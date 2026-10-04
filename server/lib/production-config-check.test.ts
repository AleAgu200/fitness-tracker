import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { productionConfigFindings } from "./production-config-check";

const settings = (env: Record<string, string>) => productionConfigFindings(env).map(finding => finding.setting);

describe("productionConfigFindings", () => {
  it("checks nothing outside production", () => {
    assert.deepEqual(productionConfigFindings({ NODE_ENV: "development", ALLOW_SANDBOX_ENTITLEMENTS: "true" }), []);
  });

  it("flags sandbox entitlements and test billing keys in production", () => {
    const found = settings({ NODE_ENV: "production", ALLOW_SANDBOX_ENTITLEMENTS: "true", REVENUECAT_API_KEY: "sk_test_x", SENTRY_DSN: "x" });
    assert.ok(found.includes("ALLOW_SANDBOX_ENTITLEMENTS"));
    assert.ok(found.includes("REVENUECAT_API_KEY"));
    assert.ok(found.includes("REVENUECAT_WEBHOOK_SECRET"));
  });

  it("is quiet for a launch-ready environment", () => {
    assert.deepEqual(settings({
      NODE_ENV: "production",
      REVENUECAT_API_KEY: "sk_live",
      REVENUECAT_WEBHOOK_SECRET: "s",
      SENTRY_DSN: "https://x@o.ingest.sentry.io/1",
      BETTER_AUTH_URL: "https://pulsofitness.tech",
    }), []);
  });

  it("never includes values in its findings", () => {
    const text = JSON.stringify(productionConfigFindings({ NODE_ENV: "production", REVENUECAT_API_KEY: "sk_test_SECRETVALUE" }));
    assert.ok(!text.includes("SECRETVALUE"));
  });
});
