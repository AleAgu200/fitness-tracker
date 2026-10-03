import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";

// One Bedrock API key (bearer token) for every model PULSO calls — plan
// generation and label reading — so no AWS credentials are involved.
//
//   AWS_BEDROCK_API_KEY   Bedrock API key (BEDROCK_API_KEY / AWS_BEARER_TOKEN_BEDROCK also accepted)

export const DEFAULT_BEDROCK_REGION = "us-east-2";

export function bedrockApiKey(env: Record<string, string | undefined> = process.env): string | null {
  return env.AWS_BEDROCK_API_KEY || env.BEDROCK_API_KEY || env.AWS_BEARER_TOKEN_BEDROCK || null;
}

const clients = new Map<string, BedrockRuntimeClient>();

/** A Converse client for `region`; null when no key is configured. */
export function bedrockClient(region: string): BedrockRuntimeClient | null {
  const apiKey = bedrockApiKey();
  if (!apiKey) return null;
  let client = clients.get(region);
  if (!client) {
    client = new BedrockRuntimeClient({
      region,
      token: { token: apiKey },
      authSchemePreference: ["httpBearerAuth"],
      // Throttling is retried here; callers bound the whole exchange themselves.
      maxAttempts: 3,
      retryMode: "adaptive",
    });
    clients.set(region, client);
  }
  return client;
}
