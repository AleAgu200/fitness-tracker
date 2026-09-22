import assert from "node:assert/strict";
import test from "node:test";

import { sandboxEntitlementAllowed } from "./entitlement-policy";

test("a real (non-sandbox) purchase is always honoured", () => {
  assert.equal(sandboxEntitlementAllowed(false, { NODE_ENV: "production" }), true);
  assert.equal(sandboxEntitlementAllowed(false, {}), true);
});

test("sandbox purchases work outside production without any opt-in", () => {
  // Local development and the test suites must exercise the paid paths.
  assert.equal(sandboxEntitlementAllowed(true, { NODE_ENV: "development" }), true);
  assert.equal(sandboxEntitlementAllowed(true, {}), true);
});

test("sandbox purchases are refused in production by default", () => {
  // They cost nothing, so honouring them would give the subscription away.
  assert.equal(sandboxEntitlementAllowed(true, { NODE_ENV: "production" }), false);
});

test("production can opt in to sandbox purchases explicitly", () => {
  // Needed to exercise the RevenueCat Test Store against a real deployment
  // before store products go live.
  assert.equal(
    sandboxEntitlementAllowed(true, { NODE_ENV: "production", ALLOW_SANDBOX_ENTITLEMENTS: "true" }),
    true,
  );
  // Only the exact string opts in — a stray value must not weaken the default.
  for (const value of ["1", "yes", "TRUE", "", "false"]) {
    assert.equal(
      sandboxEntitlementAllowed(true, { NODE_ENV: "production", ALLOW_SANDBOX_ENTITLEMENTS: value }),
      false,
      `ALLOW_SANDBOX_ENTITLEMENTS=${value} must not grant access`,
    );
  }
});
