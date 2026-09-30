import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { draftFromLabel, LabelExtraction, NUTRIENT_KEYS, NutritionDraft } from "@/lib/nutrition-draft";

// Reads a photographed nutrition table with Claude on Amazon Bedrock. The model
// only transcribes what is printed — through a strict tool schema, since the
// Bedrock endpoint has no structured-output mode — and every conversion and
// check runs in code (nutrition-draft.ts). The image is never stored or
// logged by PULSO; it lives only in this request.
//
// Configuration (server env; nothing is enabled without it):
//   BEDROCK_API_KEY          Amazon Bedrock API key (AWS_BEARER_TOKEN_BEDROCK also accepted)
//   BEDROCK_REGION           region the key and model access belong to, e.g. us-east-1
//   BEDROCK_LABEL_MODEL_ID   optional, defaults to anthropic.claude-opus-5-5
//   BEDROCK_LABEL_EFFORT     optional, low | medium | high (default medium)

const DEFAULT_MODEL = "anthropic.claude-opus-5-5";
const TOOL_NAME = "record_nutrition_label";

export class LabelServiceUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
  }
}

export class LabelUnreadableError extends Error {
  constructor(reason: string) {
    super(reason);
  }
}

let client: Anthropic | null = null;

function config() {
  const apiKey = process.env.BEDROCK_API_KEY ?? process.env.AWS_BEARER_TOKEN_BEDROCK;
  const region = process.env.BEDROCK_REGION ?? process.env.AWS_REGION;
  const effort = process.env.BEDROCK_LABEL_EFFORT;
  return {
    apiKey,
    region,
    model: process.env.BEDROCK_LABEL_MODEL_ID || DEFAULT_MODEL,
    effort: (effort === "low" || effort === "high" ? effort : "medium") as "low" | "medium" | "high",
  };
}

export function labelReadingConfigured(): boolean {
  const { apiKey, region } = config();
  return Boolean(apiKey && region);
}

function getClient(): Anthropic {
  const { apiKey, region } = config();
  if (!apiKey || !region) throw new LabelServiceUnavailableError("label_service_not_configured");
  // Claude in Amazon Bedrock serves the Messages API; a Bedrock API key is
  // accepted as the bearer credential on this endpoint.
  client ??= new Anthropic({
    apiKey,
    baseURL: `https://bedrock-mantle.${region}.api.aws/anthropic`,
    maxRetries: 1,
    timeout: 90_000,
  });
  return client;
}

const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };
const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };

const LABEL_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Records exactly what a packaged food's nutrition facts table states. Unknown or unprinted values are null.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      isNutritionLabel: { type: "boolean", description: "false when the image is not a legible nutrition facts table." },
      productName: nullableString,
      brand: nullableString,
      basisAmount: { ...nullableNumber, description: "Reference amount the column you transcribe refers to (e.g. 100 for per 100 g)." },
      basisUnit: { anyOf: [{ type: "string", enum: ["g", "ml"] }, { type: "null" }] },
      servingLabel: { ...nullableString, description: "Serving name as printed, e.g. \"1 envase\"." },
      servingAmount: { ...nullableNumber, description: "Serving size in the basis unit." },
      energyValue: nullableNumber,
      energyUnit: { anyOf: [{ type: "string", enum: ["kcal", "kJ"] }, { type: "null" }] },
      proteinG: nullableNumber,
      carbsG: nullableNumber,
      fatG: nullableNumber,
      fiberG: nullableNumber,
      sugarsG: nullableNumber,
      saturatedFatG: nullableNumber,
      sodiumMg: nullableNumber,
      saltG: nullableNumber,
      uncertainFields: {
        type: "array",
        items: { type: "string", enum: [...NUTRIENT_KEYS] },
        description: "Nutrients whose printed value was hard to read or ambiguous.",
      },
    },
    required: [
      "isNutritionLabel", "productName", "brand", "basisAmount", "basisUnit", "servingLabel", "servingAmount",
      "energyValue", "energyUnit", "proteinG", "carbsG", "fatG", "fiberG", "sugarsG", "saturatedFatG",
      "sodiumMg", "saltG", "uncertainFields",
    ],
    additionalProperties: false,
  },
};

const SYSTEM = `You transcribe nutrition facts tables from photos of packaged food, for an athlete who will review the result before saving it. Labels may be in Spanish or English and may have several columns.

- Transcribe only what is printed. Never estimate or fill in a value that isn't on the label: use null.
- Prefer the "per 100 g" or "per 100 ml" column when there is one; otherwise use the per-serving column and put the serving size as the basis.
- Report energy with the unit it is printed in. If both kcal and kJ appear, use kcal.
- Report sodium in mg as printed (convert g to mg only when the label states sodium in g). If the label only lists salt, report it as saltG and leave sodium null.
- List in uncertainFields any nutrient whose number was blurry, cut off, or ambiguous.
- If the image is not a legible nutrition table, set isNutritionLabel to false and the rest to null.

Always answer by calling the ${TOOL_NAME} tool exactly once.`;

const extractionSchema = z.object({
  isNutritionLabel: z.boolean(),
  productName: z.string().max(200).nullable(),
  brand: z.string().max(200).nullable(),
  basisAmount: z.number().positive().max(10_000).nullable(),
  basisUnit: z.enum(["g", "ml"]).nullable(),
  servingLabel: z.string().max(120).nullable(),
  servingAmount: z.number().positive().max(10_000).nullable(),
  energyValue: z.number().min(0).max(100_000).nullable(),
  energyUnit: z.enum(["kcal", "kJ"]).nullable(),
  proteinG: z.number().min(0).max(10_000).nullable(),
  carbsG: z.number().min(0).max(10_000).nullable(),
  fatG: z.number().min(0).max(10_000).nullable(),
  fiberG: z.number().min(0).max(10_000).nullable(),
  sugarsG: z.number().min(0).max(10_000).nullable(),
  saturatedFatG: z.number().min(0).max(10_000).nullable(),
  sodiumMg: z.number().min(0).max(1_000_000).nullable(),
  saltG: z.number().min(0).max(10_000).nullable(),
  uncertainFields: z.array(z.string()).max(20),
});

export type LabelMediaType = "image/jpeg" | "image/png" | "image/webp";

/** Reads one label into a draft. Throws the typed errors above on failure. */
export async function readNutritionLabel(imageBase64: string, mediaType: LabelMediaType): Promise<NutritionDraft> {
  const { model, effort } = config();
  let response: Anthropic.Message;
  try {
    response = await getClient().messages.create({
      model,
      max_tokens: 16000,
      output_config: { effort },
      system: SYSTEM,
      tools: [LABEL_TOOL],
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: `Transcribe this nutrition table with ${TOOL_NAME}.` },
        ],
      }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      console.error("[nutrition-label] Bedrock rejected the credentials or model access", { status: error.status });
      throw new LabelServiceUnavailableError("label_service_misconfigured");
    }
    if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionError) {
      throw new LabelServiceUnavailableError("label_service_busy");
    }
    if (error instanceof Anthropic.BadRequestError) {
      // Usually an image the endpoint can't take (size/format).
      console.warn("[nutrition-label] request rejected", { status: error.status, message: error.message });
      throw new LabelUnreadableError("label_image_rejected");
    }
    throw error;
  }

  if (response.stop_reason === "refusal") throw new LabelUnreadableError("label_declined");
  const call = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === TOOL_NAME);
  if (!call) throw new LabelUnreadableError("label_no_result");
  const parsed = extractionSchema.safeParse(call.input);
  if (!parsed.success) throw new LabelUnreadableError("label_invalid_result");
  try {
    return draftFromLabel(parsed.data as LabelExtraction);
  } catch {
    throw new LabelUnreadableError("not_a_nutrition_label");
  }
}
