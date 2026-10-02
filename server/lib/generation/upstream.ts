// The contract between plan generation (generate.ts) and the model providers
// behind it (bedrock.ts, openrouter.ts): one request shape, one result shape,
// and the errors generate.ts, jobs.ts and the plan routes know how to classify.
// Error messages never carry provider response bodies: they can echo request
// data, which here is onboarding-derived health information.

export const REQUEST_TIMEOUT_MS = 90_000;
export const MAX_OUTPUT_TOKENS = 6_000;

export interface UpstreamRequest {
  model: string;
  system: string;
  /** User turns, in order: the catalog payload, then any correction. */
  userTexts: string[];
  /** JSON schema the reply must follow. */
  schema: Record<string, unknown>;
  schemaName: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

export interface UpstreamCallResult {
  output: unknown;
  actualModel: string;
  provider?: string;
  requestId?: string;
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
}

export type UpstreamCall = (request: UpstreamRequest) => Promise<UpstreamCallResult>;

/** A distinct, retryable upstream timeout. */
export class GenerationTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs = REQUEST_TIMEOUT_MS) {
    super("upstream_timeout");
    this.name = "GenerationTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/** The provider answered with an HTTP error. `reason` is the provider's error
 *  name (e.g. ThrottlingException), never its message. */
export class UpstreamHttpError extends Error {
  readonly status: number;
  readonly requestId: string | null;
  readonly retryAfter: string | null;
  readonly reason: string | null;

  constructor(status: number, requestId: string | null, retryAfter: string | null, reason: string | null = null) {
    super(`upstream_${status}`);
    this.name = "UpstreamHttpError";
    this.status = status;
    this.requestId = requestId;
    this.retryAfter = retryAfter;
    this.reason = reason;
  }
}

export class UpstreamNetworkError extends Error {
  constructor() {
    super("upstream_network_error");
    this.name = "UpstreamNetworkError";
  }
}

export class UpstreamResponseError extends Error {
  constructor(
    code:
      | "upstream_empty_response"
      | "upstream_invalid_json"
      | "upstream_invalid_response"
      | "upstream_output_truncated",
  ) {
    super(code);
    this.name = "UpstreamResponseError";
  }
}

/** Missing or invalid server configuration: retrying won't help. */
export class GenerationConfigError extends Error {
  constructor(code: "generation_key_missing" | "generation_model_missing" | "generation_model_must_be_pinned" | "generation_provider_unknown") {
    super(code);
    this.name = "GenerationConfigError";
  }
}

/** Parses the model's reply. Some models wrap JSON in a ``` fence even when
 *  asked not to; that wrapper is the only thing tolerated. */
export function parseModelJson(content: string | undefined): unknown {
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new UpstreamResponseError("upstream_empty_response");
  }
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(content.trim());
  try {
    return JSON.parse(fenced ? fenced[1] : content);
  } catch {
    throw new UpstreamResponseError("upstream_invalid_json");
  }
}
