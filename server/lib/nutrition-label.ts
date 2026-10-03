import {
  BedrockRuntimeServiceException,
  ConverseCommand,
  type ConverseCommandOutput,
  type ToolSpecification,
} from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";

import { bedrockApiKey, bedrockClient, DEFAULT_BEDROCK_REGION } from "@/lib/bedrock-client";
import { draftFromLabel, LabelExtraction, NUTRIENT_KEYS, NutritionDraft } from "@/lib/nutrition-draft";

// Reads a photographed nutrition table with a vision model on Amazon Bedrock
// (Converse API, shared Bedrock API key). The model only transcribes what is
// printed — through a forced tool call with a strict schema — and every
// conversion and check runs in code (nutrition-draft.ts). The image is never
// stored or logged by PULSO; it lives only in this request.
//
// Configuration (server env; nothing is enabled without the key):
//   AWS_BEDROCK_API_KEY      see lib/bedrock-client.ts
//   BEDROCK_REGION           optional, defaults to AWS_REGION, then us-east-2
//   BEDROCK_LABEL_MODEL_ID   optional, defaults to Amazon Nova 2 Lite: low cost,
//                            and it read a test label exactly like larger models

const DEFAULT_MODEL = "us.amazon.nova-2-lite-v1:0";
const TOOL_NAME = "record_nutrition_label";
const TIMEOUT_MS = 60_000;

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

function config() {
  return {
    region: process.env.BEDROCK_REGION || process.env.AWS_REGION || DEFAULT_BEDROCK_REGION,
    model: process.env.BEDROCK_LABEL_MODEL_ID || DEFAULT_MODEL,
  };
}

export function labelReadingConfigured(): boolean {
  return bedrockApiKey() != null;
}

const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };
const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };

const LABEL_TOOL: ToolSpecification = {
  name: TOOL_NAME,
  description: "Records exactly what a packaged food's nutrition facts table states. Unknown or unprinted values are null.",
  inputSchema: { json: {
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
  } },
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

const IMAGE_FORMATS = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" } as const;

/** Bedrock's answer mapped to what the app can say; only the error name is logged. */
function labelServiceError(error: unknown): Error {
  const status = error instanceof BedrockRuntimeServiceException ? error.$metadata.httpStatusCode : undefined;
  const name = error instanceof Error ? error.name : "unknown";
  if (status === 401 || status === 403 || status === 404) {
    // Wrong key, model not enabled for the account, or a model ID that doesn't exist.
    console.error("[nutrition-label] Bedrock rejected the key or model", { status, name });
    return new LabelServiceUnavailableError("label_service_misconfigured");
  }
  if (status === 400) {
    // Usually an image the model can't take (size/format).
    console.warn("[nutrition-label] request rejected", { status, name });
    return new LabelUnreadableError("label_image_rejected");
  }
  // Throttling, 5xx, timeouts and network failures: worth retrying later.
  return new LabelServiceUnavailableError("label_service_busy");
}

/** Reads one label into a draft. Throws the typed errors above on failure. */
export async function readNutritionLabel(imageBase64: string, mediaType: LabelMediaType): Promise<NutritionDraft> {
  const { model, region } = config();
  const client = bedrockClient(region);
  if (!client) throw new LabelServiceUnavailableError("label_service_not_configured");

  let response: ConverseCommandOutput;
  try {
    response = await client.send(new ConverseCommand({
      modelId: model,
      system: [{ text: SYSTEM }],
      messages: [{
        role: "user",
        content: [
          { image: { format: IMAGE_FORMATS[mediaType], source: { bytes: Buffer.from(imageBase64, "base64") } } },
          { text: `Transcribe this nutrition table with ${TOOL_NAME}.` },
        ],
      }],
      toolConfig: { tools: [{ toolSpec: LABEL_TOOL }], toolChoice: { tool: { name: TOOL_NAME } } },
      inferenceConfig: { maxTokens: 2000 },
    }), { abortSignal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    throw labelServiceError(error);
  }

  if (response.stopReason === "content_filtered" || response.stopReason === "guardrail_intervened") {
    throw new LabelUnreadableError("label_declined");
  }
  const call = response.output?.message?.content?.find(block => block.toolUse?.name === TOOL_NAME)?.toolUse;
  if (!call) throw new LabelUnreadableError("label_no_result");
  const parsed = extractionSchema.safeParse(call.input);
  if (!parsed.success) throw new LabelUnreadableError("label_invalid_result");
  try {
    return draftFromLabel(parsed.data as LabelExtraction);
  } catch {
    throw new LabelUnreadableError("not_a_nutrition_label");
  }
}
