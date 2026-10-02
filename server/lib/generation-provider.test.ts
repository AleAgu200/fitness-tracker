import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { callBedrock } from "./generation/bedrock";
import { resolveProvider } from "./generation/generate";
import { callOpenRouter } from "./generation/openrouter";
import { GenerationConfigError, UpstreamResponseError, parseModelJson } from "./generation/upstream";

describe("resolveProvider", () => {
  it("defaults to Kimi K3 on Bedrock", () => {
    const provider = resolveProvider({});
    assert.equal(provider.call, callBedrock);
    assert.equal(provider.primary, "global.moonshotai.kimi-k3");
    assert.equal(provider.fallback, undefined);
  });

  it("takes the Bedrock model and fallback from the environment", () => {
    const provider = resolveProvider({ BEDROCK_PLAN_MODEL_ID: "a", BEDROCK_PLAN_FALLBACK_MODEL_ID: "b" });
    assert.equal(provider.primary, "a");
    assert.equal(provider.fallback, "b");
    assert.equal(resolveProvider({ BEDROCK_PLAN_MODEL_ID: "a", BEDROCK_PLAN_FALLBACK_MODEL_ID: "a" }).fallback, undefined);
  });

  it("still offers OpenRouter, with an explicit pinned model", () => {
    const provider = resolveProvider({ PLAN_GENERATION_PROVIDER: "openrouter", OPENROUTER_MODEL: "moonshotai/kimi-k2" });
    assert.equal(provider.call, callOpenRouter);
    assert.equal(provider.primary, "moonshotai/kimi-k2");
    assert.throws(() => resolveProvider({ PLAN_GENERATION_PROVIDER: "openrouter" }), GenerationConfigError);
    assert.throws(() => resolveProvider({ PLAN_GENERATION_PROVIDER: "openrouter", OPENROUTER_MODEL: "openrouter/auto" }), GenerationConfigError);
  });

  it("rejects an unknown provider", () => {
    assert.throws(() => resolveProvider({ PLAN_GENERATION_PROVIDER: "other" }), GenerationConfigError);
  });
});

describe("parseModelJson", () => {
  it("reads plain and fenced JSON", () => {
    assert.deepEqual(parseModelJson('{"a":1}'), { a: 1 });
    assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
  });

  it("rejects empty or non-JSON replies", () => {
    assert.throws(() => parseModelJson(""), UpstreamResponseError);
    assert.throws(() => parseModelJson(undefined), UpstreamResponseError);
    assert.throws(() => parseModelJson("Aquí está tu plan: {"), UpstreamResponseError);
  });
});
