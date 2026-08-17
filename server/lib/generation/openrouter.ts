import { repairModelOutput, type ResolvedMealItem } from "./repair";
import {
  CALORIE_TOLERANCE,
  MEAL_OPTIONS_PER_SLOT,
  PROTEIN_TOLERANCE,
  PROGRAM_DURATION_WEEKS,
  SCHEMA_VERSION,
  buildModelOutputSchema,
  computedMealItemSchema,
  generatedPlanSchema,
  generationInputSchema,
  modelOutputSchema,
  type ComputedMealItem,
  type ComputedMealSlot,
  type GeneratedPlan,
  type GenerationInput,
  type MealDay,
  type ModelOutput,
  type NutritionTotals,
} from "./schema";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 90_000;
export const MAX_UPSTREAM_CALLS = 2;
const MAX_OUTPUT_TOKENS = 6_000;
const PROMPT_VERSION = "plan-gen-v3";

/** The wger catalog runs to thousands of entries, which pushed the prompt past
 *  19k tokens and buried the instructions. The model only ever picks a handful,
 *  so it is shown a bounded slice spread across muscle groups instead. */
const MAX_MODEL_EXERCISES = 120;

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

function buildSystemPrompt(foodCount: number, exerciseCount: number): string {
  return [
    "Eres el motor de generación de planes de PULSO, una app de entrenamiento y nutrición en español (Honduras/Latinoamérica).",
    "Propones ÚNICAMENTE estructura: qué ejercicio/alimento elegir, en qué día y en qué proporción. El servidor calcula todo lo numérico.",
    "Reglas obligatorias:",
    `- Elige alimentos y ejercicios por su número \`ref\`. Usa solo refs de 1 a ${foodCount} para \`foods\` y de 1 a ${exerciseCount} para \`exercises\`. Nunca inventes un ref fuera de ese rango.`,
    `- El programa de entrenamiento dura ${PROGRAM_DURATION_WEEKS} semanas y repite el mismo horario semanal (un solo bloque de días, no 4 semanas distintas).`,
    "- `workout.days` debe tener exactamente `profile.daysPerWeek` elementos, en el orden en que se entrenan. No repitas un mismo ejercicio dentro de un día.",
    "- `meals` debe tener exactamente `profile.mealsPerDay` elementos, en orden cronológico.",
    `- Cada comida lleva \`options\`: ${MEAL_OPTIONS_PER_SLOT} versiones intercambiables de esa misma comida (por ejemplo, tres desayunos distintos). El servidor las rota para armar los 7 días de la semana, así que deben ser equivalentes en función y parecidas en tamaño, pero con alimentos distintos entre sí.`,
    "- No armes los 7 días tú: entrega solo las comidas con sus opciones.",
    "- Los `grams` son una porción razonable y realista para cada alimento. El servidor los reajusta después para cuadrar con los objetivos calóricos, así que prioriza proporciones sensatas por encima de sumas exactas.",
    "- No calcules ni menciones calorías ni macronutrientes: no hay campo para ellos.",
    "- No asignes horarios de comida ni días de la semana: el servidor los asigna.",
    "- Cuando estén presentes, trata `trainingLocation`, `cookingTimeBudget` y `budgetLevel` como preferencias obligatorias dentro del catálogo permitido.",
    "- No prescribas peso inicial (no hay campo para eso); usa progressionIncrementKg para la progresión futura.",
    "- Devuelve `assumptions` (supuestos que hiciste) y `safetyNotes` (advertencias o límites que el usuario debería conocer) siempre, aunque estén vacíos.",
    "- Responde siempre en español.",
  ].join("\n");
}

/** Round-robin over muscle groups so a truncated catalog still covers the whole
 *  body, and keep PULSO's own curated entries ahead of the imported ones. */
function selectModelExercises(exercises: GenerationInput["eligibleExercises"]) {
  if (exercises.length <= MAX_MODEL_EXERCISES) return exercises;

  const byGroup = new Map<string, GenerationInput["eligibleExercises"]>();
  for (const exercise of exercises) {
    const group = byGroup.get(exercise.muscleGroup) ?? [];
    group.push(exercise);
    byGroup.set(exercise.muscleGroup, group);
  }
  for (const group of byGroup.values()) {
    group.sort((a, b) => Number(a.source !== "pulso") - Number(b.source !== "pulso"));
  }

  const groups = [...byGroup.values()];
  const selected: GenerationInput["eligibleExercises"] = [];
  for (let round = 0; selected.length < MAX_MODEL_EXERCISES; round++) {
    let tookAny = false;
    for (const group of groups) {
      const exercise = group[round];
      if (!exercise) continue;
      selected.push(exercise);
      tookAny = true;
      if (selected.length >= MAX_MODEL_EXERCISES) break;
    }
    if (!tookAny) break;
  }
  return selected;
}

/** The catalog the model actually sees: 1-based `ref` in place of the opaque
 *  24-hex catalog ids it could not transcribe correctly, and short keys so the
 *  list stays cheap. `ref` is the index into `input.eligibleFoods` /
 *  `input.eligibleExercises`, which is what repair.ts resolves against. */
function buildUserPayload(input: GenerationInput) {
  return {
    targets: input.targets,
    profile: input.profile,
    foods: input.eligibleFoods.map((food, index) => ({
      ref: index + 1,
      name: food.name,
      kcal: food.kcal,
      p: food.proteinG,
      c: food.carbsG,
      f: food.fatG,
    })),
    exercises: input.eligibleExercises.map((exercise, index) => ({
      ref: index + 1,
      name: exercise.name,
      muscle: exercise.muscleGroup,
      equipment: exercise.equipment,
    })),
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
    {
      role: "system",
      content: buildSystemPrompt(input.eligibleFoods.length, input.eligibleExercises.length),
    },
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
            schema: toJSONSchema(
              buildModelOutputSchema(input.eligibleFoods.length, input.eligibleExercises.length),
            ),
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

function toComputedItems(items: ResolvedMealItem[]): ComputedMealItem[] {
  return items.map((item) =>
    computedMealItemSchema.parse({
      foodId: item.food.id,
      source: item.food.source,
      grams: item.grams,
      ...computeItemNutrition(item.food, item.grams),
    }),
  );
}

/** Turn the model's proposal into a stored plan: repair everything the server
 *  can decide on its own (see repair.ts), then recompute every nutrient from the
 *  fitted grams. The model's own numbers — it isn't asked for any — are never
 *  involved. Remaining issues are phrased in Spanish so they can be fed straight
 *  back as correction instructions. */
function validateAndEnrich(input: GenerationInput, output: ModelOutput): { ok: true; plan: EnrichedPlan } | { ok: false; issues: string[] } {
  const repaired = repairModelOutput(input, output);
  if (!repaired.ok) return { ok: false, issues: repaired.issues };

  const week: MealDay[] = repaired.plan.week.map((day) => {
    const meals: ComputedMealSlot[] = day.meals.map((meal) => {
      const items = toComputedItems(meal.items);
      return { label: meal.label, time: meal.time, items, totals: sumNutrition(items) };
    });
    return {
      weekday: day.weekday,
      meals,
      dailyTotals: sumNutrition(meals.flatMap((m) => m.items)),
    };
  });

  // The fitter targets these directly, so a miss here means it hit a bound (a
  // catalog with no protein-dense food, say) rather than a model mistake. Ask
  // for a different food mix rather than for arithmetic.
  //
  // Every day is checked: options differ in calorie density, so one rotation
  // can land outside tolerance while the rest are fine. Only the worst day is
  // reported — seven near-identical complaints would crowd out the rest of the
  // correction instructions.
  const worstKcal = week.reduce((worst, day) =>
    Math.abs(day.dailyTotals.kcal - input.targets.dailyCalories)
    > Math.abs(worst.dailyTotals.kcal - input.targets.dailyCalories) ? day : worst);
  const worstProtein = week.reduce((worst, day) =>
    Math.abs(day.dailyTotals.proteinGrams - input.targets.proteinGrams)
    > Math.abs(worst.dailyTotals.proteinGrams - input.targets.proteinGrams) ? day : worst);

  const issues: string[] = [];
  const kcalDelta = Math.abs(worstKcal.dailyTotals.kcal - input.targets.dailyCalories) / input.targets.dailyCalories;
  if (kcalDelta > CALORIE_TOLERANCE) {
    issues.push(
      `no fue posible ajustar las porciones a ${input.targets.dailyCalories} kcal (un día quedó en ${Math.round(worstKcal.dailyTotals.kcal)}). Propon opciones de comida con distinta densidad calórica.`,
    );
  }
  const proteinDelta = Math.abs(worstProtein.dailyTotals.proteinGrams - input.targets.proteinGrams) / input.targets.proteinGrams;
  if (proteinDelta > PROTEIN_TOLERANCE) {
    issues.push(
      `no fue posible ajustar las porciones a ${input.targets.proteinGrams}g de proteína (un día quedó en ${Math.round(worstProtein.dailyTotals.proteinGrams)}g). Incluye más alimentos ricos en proteína en todas las opciones.`,
    );
  }
  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    plan: {
      assumptions: output.assumptions,
      safetyNotes: output.safetyNotes,
      workout: { durationWeeks: PROGRAM_DURATION_WEEKS, days: repaired.plan.days },
      week,
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
  const parsedInput = generationInputSchema.parse(rawInput);
  // Truncate before anything else: `ref` is an index into these arrays, so the
  // prompt, the JSON schema bounds, and repair.ts must all see the same list.
  const input: GenerationInput = {
    ...parsedInput,
    eligibleExercises: selectModelExercises(parsedInput.eligibleExercises),
  };
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
