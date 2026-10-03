import {
  BedrockRuntimeClient,
  BedrockRuntimeServiceException,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

import { bedrockClient, DEFAULT_BEDROCK_REGION } from "@/lib/bedrock-client";

import {
  GenerationConfigError,
  GenerationTimeoutError,
  UpstreamHttpError,
  UpstreamNetworkError,
  UpstreamResponseError,
  parseModelJson,
  type UpstreamCallResult,
  type UpstreamRequest,
} from "./upstream";

// Plan generation on Amazon Bedrock through the Converse API, with the shared
// Bedrock API key (lib/bedrock-client.ts).
//
// Configuration (server env):
//   AWS_BEDROCK_API_KEY   see lib/bedrock-client.ts
//   BEDROCK_PLAN_REGION   optional, defaults to us-east-2

function getClient(): BedrockRuntimeClient {
  // Throttling retries inside the client don't spend the job's two-call
  // budget; the abort signal below still bounds the whole exchange.
  const client = bedrockClient(process.env.BEDROCK_PLAN_REGION || DEFAULT_BEDROCK_REGION);
  if (!client) throw new GenerationConfigError("generation_key_missing");
  return client;
}

/** SDK exceptions carry the HTTP status; anything without one never got an answer. */
function toUpstreamError(error: unknown): Error {
  if (error instanceof BedrockRuntimeServiceException && error.$metadata.httpStatusCode) {
    return new UpstreamHttpError(
      error.$metadata.httpStatusCode,
      error.$metadata.requestId ?? null,
      null,
      error.name,
    );
  }
  return new UpstreamNetworkError();
}

export async function callBedrock(request: UpstreamRequest): Promise<UpstreamCallResult> {
  const bedrock = getClient();
  const startedAt = Date.now();
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, request.timeoutMs);

  try {
    let response;
    try {
      response = await bedrock.send(new ConverseCommand({
        modelId: request.model,
        system: [{ text: request.system }],
        // Converse wants alternating roles, so the correction rides in the
        // same user turn as the catalog instead of a second user message.
        messages: [{ role: "user", content: request.userTexts.map(text => ({ text })) }],
        // No temperature: Kimi K3 is a reasoning model and rejects the field
        // (ValidationException). The JSON schema below keeps the reply on shape.
        inferenceConfig: { maxTokens: request.maxTokens },
        outputConfig: {
          textFormat: {
            type: "json_schema",
            structure: {
              jsonSchema: { name: request.schemaName, schema: JSON.stringify(request.schema) },
            },
          },
        },
      }), { abortSignal: controller.signal });
    } catch (error) {
      if (timedOut) throw new GenerationTimeoutError(request.timeoutMs);
      throw toUpstreamError(error);
    }

    if (response.stopReason === "max_tokens" || response.stopReason === "model_context_window_exceeded") {
      throw new UpstreamResponseError("upstream_output_truncated");
    }
    const blocks = response.output?.message?.content;
    if (!blocks) throw new UpstreamResponseError("upstream_invalid_response");
    // Reasoning models may add reasoning blocks before the answer; only text counts.
    const text = blocks.map(block => block.text ?? "").join("");

    return {
      output: parseModelJson(text),
      actualModel: request.model,
      provider: "bedrock",
      requestId: response.$metadata.requestId,
      durationMs: Math.max(0, Date.now() - startedAt),
      promptTokens: response.usage?.inputTokens,
      completionTokens: response.usage?.outputTokens,
    };
  } finally {
    clearTimeout(timeout);
  }
}
