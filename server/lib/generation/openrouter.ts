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

// Plan generation through OpenRouter (PLAN_GENERATION_PROVIDER=openrouter).
//
// Configuration (server env):
//   OPENROUTER_API_KEY
//   OPENROUTER_ZDR   optional; "false" allows endpoints without zero data retention

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Privacy remains the default. Local fixtures can explicitly opt out when
 *  testing free endpoints that do not publish a zero-retention policy. */
function requireZeroDataRetention(): boolean {
  return process.env.OPENROUTER_ZDR !== "false";
}

export async function callOpenRouter(request: UpstreamRequest): Promise<UpstreamCallResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new GenerationConfigError("generation_key_missing");
  const startedAt = Date.now();

  const messages = [
    { role: "system", content: request.system },
    ...request.userTexts.map(content => ({ role: "user", content })),
  ];

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, request.timeoutMs);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        messages,
        stream: false,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        reasoning: {
          enabled: false,
          exclude: true,
        },
        usage: { include: true },
        response_format: {
          type: "json_schema",
          json_schema: {
            name: request.schemaName,
            strict: true,
            schema: request.schema,
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
      throw new UpstreamHttpError(
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
      throw new UpstreamResponseError("upstream_invalid_response");
    }
    const choice = json.choices?.[0];
    if (choice?.finish_reason === "length") {
      throw new UpstreamResponseError("upstream_output_truncated");
    }
    return {
      output: parseModelJson(choice?.message?.content),
      actualModel:
        typeof json.model === "string" && json.model.trim().length > 0
          ? json.model
          : request.model,
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
    if (timedOut) throw new GenerationTimeoutError(request.timeoutMs);
    if (error instanceof UpstreamHttpError || error instanceof UpstreamResponseError) {
      throw error;
    }
    throw new UpstreamNetworkError();
  } finally {
    clearTimeout(timeout);
  }
}
