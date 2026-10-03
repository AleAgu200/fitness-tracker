import assert from "node:assert/strict";
import test from "node:test";

import { bedrockApiKey } from "./bedrock-client";

test("one Bedrock key serves plans and label reading, whatever its name", () => {
  // Doppler prd names it AWS_BEDROCK_API_KEY; label reading used to look only
  // at the other two names and reported itself as not configured.
  assert.equal(bedrockApiKey({ AWS_BEDROCK_API_KEY: "a" }), "a");
  assert.equal(bedrockApiKey({ BEDROCK_API_KEY: "b" }), "b");
  assert.equal(bedrockApiKey({ AWS_BEARER_TOKEN_BEDROCK: "c" }), "c");
  assert.equal(bedrockApiKey({ AWS_BEDROCK_API_KEY: "a", BEDROCK_API_KEY: "b" }), "a");
  assert.equal(bedrockApiKey({ AWS_BEDROCK_API_KEY: "" }), null);
  assert.equal(bedrockApiKey({}), null);
});
