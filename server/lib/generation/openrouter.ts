import {
  CALORIE_TOLERANCE,
  PROTEIN_TOLERANCE,
  PROGRAM_DURATION_WEEKS,
  SCHEMA_VERSION,
  computedMealItemSchema,
  generatedPlanSchema,
  generationInputSchema,
  modelOutputSchema,
  type ComputedMealItem,
  type ComputedMealSlot,
  type GeneratedPlan,
  type GenerationInput,
  type MealItemInput,
  type ModelOutput,
  type NutritionTotals,
} from "./schema";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 90_000;
export const MAX_UPSTREAM_CALLS = 2;
const MAX_OUTPUT_TOKENS = 6_000;
const PROMPT_VERSION = "plan-gen-v2";

export class GenerationValidationError extends Error {
  issues: string[];
  constructor(issues: string[]) {
    super(`generation_invalid: ${issues.join("; ")}`);
    this.name = "GenerationValidationError";
    this.issues = issues;
  }
}

/** A distinct, retryable upstream timeout. Keeping this separate from generic
 * OpenRouter failures lets both synchronous routes and persisted jobs surface a
 * useful error without logging the response body or health-derived inputs. */
export class GenerationTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs = REQUEST_TIMEOUT_MS) {
    super("openrouter_timeout");
    this.name = "GenerationTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

class OpenRouterUpstreamError extends Error {
  readonly status: number;
  readonly requestId: string | null;
  readonly retryAfter: string | null;

  constructor(status: number, requestId: string | null, retryAfter: string | null) {
    // Do not include provider response bodies: they can echo request data.
    super(`openrouter_${status}`);
    this.name = "OpenRouterUpstreamError";
    this.status = status;
    this.requestId = requestId;
    this.retryAfter = retryAfter;
  }
}

class OpenRouterNetworkError extends Error {
  constructor() {
    super("openrouter_network_error");
    this.name = "OpenRouterNetworkError";
  }
}

class OpenRouterResponseError extends Error {
  constructor(
    code:
      | "openrouter_empty_response"
      | "openrouter_invalid_json"
      | "openrouter_invalid_response"
      | "openrouter_output_truncated",
  ) {
    super(code);
    this.name = "OpenRouterResponseError";
  }
}

export type GenerationCallKind = "initial" | "fallback" | "correction";

export interface GenerationUpstreamDiagnostic {
  outcome: "completed" | "failed";
  durationMs: number;
  actualModel?: string;
  provider?: string;
  requestId?: string;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  errorCode?: string;
  status?: number;
  retryAfter?: string;
}

export interface GenerationProgress {
  phase: "generating" | "validating";
  attempt: number;
  callKind: GenerationCallKind;
  requestedModel: string;
  upstream?: GenerationUpstreamDiagnostic;
}

export interface GeneratePlanOptions {
  onProgress?: (progress: GenerationProgress) => void | Promise<void>;
}

function requireApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("openrouter_key_missing");
  return key;
}

/** Explicit, pinned models only. We control the one permitted fallback so the
 *  job has a deterministic two-call budget and records the model that replied. */
function validatePinnedModel(model: string): string {
  const value = model.trim();
  if (!value || value.startsWith("openrouter/")) {
    throw new Error("openrouter_model_must_be_pinned");
  }
  return value;
}

function requireModels(): { primary: string; fallback?: string } {
  const configuredPrimary = process.env.OPENROUTER_MODEL;
  if (!configuredPrimary) throw new Error("openrouter_model_missing");

  const primary = validatePinnedModel(configuredPrimary);
  const configuredFallback = process.env.OPENROUTER_FALLBACK_MODEL;
  if (!configuredFallback) return { primary };

  const fallback = validatePinnedModel(configuredFallback);
  return fallback === primary ? { primary } : { primary, fallback };
}

/** Privacy remains the default. Local fixtures can explicitly opt out when
 *  testing free endpoints that do not publish a zero-retention policy. */
function requireZeroDataRetention(): boolean {
  return process.env.OPENROUTER_ZDR !== "false";
}

function buildSystemPrompt(): string {
  return [
    "Eres el motor de generación de planes de PULSO, una app de entrenamiento y nutrición en español (Honduras/Latinoamérica).",
    "Debes proponer ÚNICAMENTE estructura: qué ejercicio/alimento del catálogo permitido, cuánto, y en qué día. Nunca calcules ni inventes calorías o macronutrientes: el servidor los calcula a partir de los gramos.",
    "Reglas obligatorias:",
    "- Usa solo los `id` presentes en `eligibleFoods` y `eligibleExercises` del mensaje del usuario. Nunca inventes IDs.",
    `- El programa de entrenamiento dura ${PROGRAM_DURATION_WEEKS} semanas y repite el mismo horario semanal (un solo bloque de días, no 4 semanas distintas).`,
    "- El plan de comidas es una plantilla diaria única (no 7 días distintos).",
    "- El número de días de entrenamiento debe coincidir exactamente con `profile.daysPerWeek`.",
    "- Si `profile.preferredMealTimes` tiene horarios, úsalos en orden para las comidas propuestas.",
    "- Cuando estén presentes, trata `trainingLocation`, `cookingTimeBudget`, `budgetLevel` y `hondurasLatinPreference` como preferencias obligatorias dentro del catálogo permitido.",
    "- No prescribas peso inicial (no hay campo para eso); usa progressionIncrementKg para la progresión futura.",
    "- Respeta los rangos seguros de sets, reps, RIR y descanso que ya están limitados por el esquema de salida.",
    "- Devuelve `assumptions` (supuestos que hiciste) y `safetyNotes` (advertencias o límites que el usuario debería conocer) siempre, aunque estén vacíos.",
    "- Responde siempre en español.",
  ].join("\n");
}

function buildUserPayload(input: GenerationInput) {
  return {
    targets: input.targets,
    profile: input.profile,
    eligibleFoods: input.eligibleFoods,
    eligibleExercises: input.eligibleExercises,
  };
}

interface OpenRouterCallResult {
  output: unknown;
  actualModel: string;
  provider?: string;
  requestId?: string;
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
}

async function callOnce(
  input: GenerationInput,
  model: string,
  priorIssues?: string[],
): Promise<OpenRouterCallResult> {
  const apiKey = requireApiKey();
  const startedAt = Date.now();

  const messages: { role: string; content: string }[] = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: JSON.stringify(buildUserPayload(input)) },
  ];
  if (priorIssues?.length) {
    messages.push({
      role: "user",
      content: `Tu respuesta anterior no cumplió estas reglas. Corrige y reenvía el plan COMPLETO:\n- ${priorIssues.join("\n- ")}`,
    });
  }

  const { toJSONSchema } = await import("zod");
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        temperature: 0.2,
        max_tokens: MAX_OUTPUT_TOKENS,
        reasoning: {
          enabled: false,
          exclude: true,
        },
        usage: { include: true },
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "pulso_generated_plan",
            strict: true,
            schema: toJSONSchema(modelOutputSchema),
          },
        },
        provider: {
          require_parameters: true,
          allow_fallbacks: true,
          ...(requireZeroDataRetention() ? { zdr: true } : {}),
        },
      }),
    });
    if (!res.ok) {
      throw new OpenRouterUpstreamError(
        res.status,
        res.headers.get("x-request-id"),
        res.headers.get("retry-after"),
      );
    }
    let json: {
      id?: string;
      model?: string;
      provider?: string;
      choices?: { finish_reason?: string; message?: { content?: string } }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        completion_tokens_details?: { reasoning_tokens?: number };
      };
    };
    try {
      json = (await res.json()) as typeof json;
    } catch {
      throw new OpenRouterResponseError("openrouter_invalid_response");
    }
    const choice = json.choices?.[0];
    if (choice?.finish_reason === "length") {
      throw new OpenRouterResponseError("openrouter_output_truncated");
    }
    const content = choice?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new OpenRouterResponseError("openrouter_empty_response");
    }
    let output: unknown;
    try {
      output = JSON.parse(content);
    } catch {
      throw new OpenRouterResponseError("openrouter_invalid_json");
    }
    return {
      output,
      actualModel:
        typeof json.model === "string" && json.model.trim().length > 0
          ? json.model
          : model,
      provider:
        typeof json.provider === "string" && json.provider.trim().length > 0
          ? json.provider
          : undefined,
      requestId:
        (typeof json.id === "string" && json.id.trim().length > 0
          ? json.id
          : res.headers.get("x-request-id")) ?? undefined,
      durationMs: Math.max(0, Date.now() - startedAt),
      promptTokens: json.usage?.prompt_tokens,
      completionTokens: json.usage?.completion_tokens,
      reasoningTokens: json.usage?.completion_tokens_details?.reasoning_tokens,
    };
  } catch (error) {
    if (timedOut) throw new GenerationTimeoutError();
    if (
      error instanceof OpenRouterUpstreamError
      || error instanceof OpenRouterResponseError
    ) {
      throw error;
    }
    throw new OpenRouterNetworkError();
  } finally {
    clearTimeout(timeout);
  }
}

function canUseFallback(error: unknown): boolean {
  if (
    error instanceof GenerationTimeoutError
    || error instanceof OpenRouterNetworkError
    || error instanceof OpenRouterResponseError
  ) {
    return true;
  }
  return error instanceof OpenRouterUpstreamError
    && (error.status === 404 || error.status === 408 || error.status >= 500);
}

function diagnosticForFailure(error: unknown, durationMs: number): GenerationUpstreamDiagnostic {
  if (error instanceof GenerationTimeoutError) {
    return { outcome: "failed", durationMs, errorCode: "generation_timeout" };
  }
  if (error instanceof OpenRouterUpstreamError) {
    return {
      outcome: "failed",
      durationMs,
      errorCode: `openrouter_${error.status}`,
      status: error.status,
      ...(error.requestId ? { requestId: error.requestId } : {}),
      ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
    };
  }
  if (error instanceof Error && error.message.startsWith("openrouter_")) {
    return { outcome: "failed", durationMs, errorCode: error.message };
  }
  return { outcome: "failed", durationMs, errorCode: "openrouter_failed" };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function computeItemNutrition(food: GenerationInput["eligibleFoods"][number], grams: number) {
  const factor = grams / 100;
  return {
    kcal: round1(food.kcal * factor),
    proteinGrams: round1(food.proteinG * factor),
    carbsGrams: round1(food.carbsG * factor),
    fatGrams: round1(food.fatG * factor),
  };
}

function sumNutrition(items: { kcal: number; proteinGrams: number; carbsGrams: number; fatGrams: number }[]): NutritionTotals {
  return items.reduce(
    (acc, i) => ({
      kcal: round1(acc.kcal + i.kcal),
      proteinGrams: round1(acc.proteinGrams + i.proteinGrams),
      carbsGrams: round1(acc.carbsGrams + i.carbsGrams),
      fatGrams: round1(acc.fatGrams + i.fatGrams),
    }),
    { kcal: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 },
  );
}

type EnrichedPlan = Omit<GeneratedPlan, "schemaVersion" | "model" | "promptVersion">;

/** Cross-check the model's proposal against the catalog it was given, and
 *  recompute every nutrient from grams — the model's own numbers (it isn't
 *  asked for any) are never involved. Returns validation issues in Spanish so
 *  they can be fed straight back to the model as correction instructions. */
function validateAndEnrich(input: GenerationInput, output: ModelOutput): { ok: true; plan: EnrichedPlan } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  const foodMap = new Map(input.eligibleFoods.map((f) => [f.id, f]));
  const exerciseIds = new Set(input.eligibleExercises.map((e) => e.id));

  if (output.workout.days.length !== input.profile.daysPerWeek) {
    issues.push(`workout.days debe tener ${input.profile.daysPerWeek} días (profile.daysPerWeek), tiene ${output.workout.days.length}`);
  }
  const weekdaysSeen = new Set<number>();
  for (const day of output.workout.days) {
    if (weekdaysSeen.has(day.weekday)) issues.push(`weekday duplicado: ${day.weekday}`);
    weekdaysSeen.add(day.weekday);
    for (const ex of day.exercises) {
      if (!exerciseIds.has(ex.exerciseId)) issues.push(`exerciseId fuera del catálogo permitido: ${ex.exerciseId}`);
      if (ex.repsMin > ex.repsMax) issues.push(`repsMin > repsMax en exerciseId ${ex.exerciseId}`);
      if (ex.rirMin > ex.rirMax) issues.push(`rirMin > rirMax en exerciseId ${ex.exerciseId}`);
    }
  }

  if (output.meals.length !== input.profile.mealsPerDay) {
    issues.push(`meals debe tener ${input.profile.mealsPerDay} comidas, tiene ${output.meals.length}`);
  }
  for (const [index, preferredTime] of (input.profile.preferredMealTimes ?? []).entries()) {
    const meal = output.meals[index];
    if (meal && meal.time !== preferredTime) {
      issues.push(`meals.${index}.time debe ser ${preferredTime}, tiene ${meal.time}`);
    }
  }

  const resolveItems = (items: MealItemInput[]): ComputedMealItem[] => {
    const resolved: ComputedMealItem[] = [];
    for (const item of items) {
      const food = foodMap.get(item.foodId);
      if (!food || food.source !== item.source) {
        issues.push(`foodId fuera del catálogo permitido: ${item.foodId}`);
        continue;
      }
      resolved.push(computedMealItemSchema.parse({ ...item, ...computeItemNutrition(food, item.grams) }));
    }
    return resolved;
  };

  const meals: ComputedMealSlot[] = output.meals.map((meal) => {
    const items = resolveItems(meal.items);
    const substitutions = resolveItems(meal.substitutions);
    return { label: meal.label, time: meal.time, items, substitutions, totals: sumNutrition(items) };
  });

  const dailyTotals = sumNutrition(meals.flatMap((m) => m.items));

  const kcalDelta = Math.abs(dailyTotals.kcal - input.targets.dailyCalories) / input.targets.dailyCalories;
  if (kcalDelta > CALORIE_TOLERANCE) {
    issues.push(
      `calorías totales ${Math.round(dailyTotals.kcal)} fuera de ±${CALORIE_TOLERANCE * 100}% del objetivo (${input.targets.dailyCalories})`,
    );
  }
  const proteinDelta = Math.abs(dailyTotals.proteinGrams - input.targets.proteinGrams) / input.targets.proteinGrams;
  if (proteinDelta > PROTEIN_TOLERANCE) {
    issues.push(
      `proteína total ${Math.round(dailyTotals.proteinGrams)}g fuera de ±${PROTEIN_TOLERANCE * 100}% del objetivo (${input.targets.proteinGrams}g)`,
    );
  }

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    plan: {
      assumptions: output.assumptions,
      safetyNotes: output.safetyNotes,
      workout: output.workout,
      meals,
      dailyTotals,
    },
  };
}

/** Generate, validate, and enrich a plan with one shared two-call budget. A
 *  transport/provider failure can spend call two on the explicit fallback;
 *  completed-but-invalid output can instead spend it on one correction. */
export async function generatePlan(
  rawInput: GenerationInput,
  options: GeneratePlanOptions = {},
): Promise<GeneratedPlan> {
  const input = generationInputSchema.parse(rawInput);
  const models = requireModels();

  let issues: string[] | undefined;
  let requestedModel = models.primary;
  let callKind: GenerationCallKind = "initial";

  for (let callIndex = 0; callIndex < MAX_UPSTREAM_CALLS; callIndex++) {
    const attempt = callIndex + 1;
    await options.onProgress?.({
      phase: "generating",
      attempt,
      callKind,
      requestedModel,
    });

    const startedAt = Date.now();
    let upstream: OpenRouterCallResult;
    try {
      upstream = await callOnce(input, requestedModel, issues);
    } catch (error) {
      await options.onProgress?.({
        phase: "generating",
        attempt,
        callKind,
        requestedModel,
        upstream: diagnosticForFailure(error, Math.max(0, Date.now() - startedAt)),
      });

      const hasAnotherCall = attempt < MAX_UPSTREAM_CALLS;
      if (
        hasAnotherCall
        && models.fallback
        && requestedModel !== models.fallback
        && canUseFallback(error)
      ) {
        requestedModel = models.fallback;
        callKind = "fallback";
        issues = undefined;
        continue;
      }
      throw error;
    }

    await options.onProgress?.({
      phase: "validating",
      attempt,
      callKind,
      requestedModel,
      upstream: {
        outcome: "completed",
        durationMs: upstream.durationMs,
        actualModel: upstream.actualModel,
        ...(upstream.provider ? { provider: upstream.provider } : {}),
        ...(upstream.requestId ? { requestId: upstream.requestId } : {}),
        ...(upstream.promptTokens === undefined ? {} : { promptTokens: upstream.promptTokens }),
        ...(upstream.completionTokens === undefined ? {} : { completionTokens: upstream.completionTokens }),
        ...(upstream.reasoningTokens === undefined ? {} : { reasoningTokens: upstream.reasoningTokens }),
      },
    });

    const parsed = modelOutputSchema.safeParse(upstream.output);
    if (!parsed.success) {
      issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      callKind = "correction";
      continue;
    }
    const result = validateAndEnrich(input, parsed.data);
    if (!result.ok) {
      issues = result.issues;
      callKind = "correction";
      continue;
    }
    return generatedPlanSchema.parse({
      ...result.plan,
      schemaVersion: SCHEMA_VERSION,
      model: upstream.actualModel,
      promptVersion: PROMPT_VERSION,
    });
  }

  throw new GenerationValidationError(issues ?? ["unknown_validation_failure"]);
}
