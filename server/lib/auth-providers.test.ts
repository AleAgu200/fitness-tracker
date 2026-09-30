import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseList, socialProvidersFromEnv } from "./auth-providers";

describe("socialProvidersFromEnv", () => {
  it("enables nothing without identifiers", () => {
    assert.deepEqual(socialProvidersFromEnv({}), {});
    assert.deepEqual(socialProvidersFromEnv({ GOOGLE_CLIENT_IDS: " , ", APPLE_BUNDLE_IDS: "" }), {});
  });

  it("accepts every Google audience, Web client first, without a secret", () => {
    const { google } = socialProvidersFromEnv({ GOOGLE_CLIENT_IDS: "web.apps.googleusercontent.com, ios.apps.googleusercontent.com" });
    assert.deepEqual(google?.clientId, ["web.apps.googleusercontent.com", "ios.apps.googleusercontent.com"]);
    assert.equal(google?.clientSecret, "");
  });

  it("verifies Apple tokens against every bundle ID", () => {
    const { apple } = socialProvidersFromEnv({ APPLE_BUNDLE_IDS: "com.lalomaster.pulso,com.pulsofitness.pulsofitness" });
    assert.deepEqual(apple?.audience, ["com.lalomaster.pulso", "com.pulsofitness.pulsofitness"]);
    assert.equal(apple?.clientId, "com.lalomaster.pulso");
  });
});

describe("parseList", () => {
  it("trims and drops empty items", () => {
    assert.deepEqual(parseList(" a ,,b "), ["a", "b"]);
    assert.deepEqual(parseList(undefined), []);
  });
});
