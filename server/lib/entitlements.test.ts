import assert from "node:assert/strict";
import test from "node:test";

import { REVERIFY_COOLDOWN_MS, sandboxEntitlementAllowed, shouldReverifyEntitlement } from "./entitlement-policy";

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

test("a renewing subscription whose period ended is re-read from RevenueCat", () => {
  const now = Date.now();
  const lapsed = { status: "active", willRenew: true, currentPeriodEndsAt: now - 1, updatedAt: now - REVERIFY_COOLDOWN_MS - 1 };
  // The renewal webhook never arrived: ask before showing the paywall again.
  assert.equal(shouldReverifyEntitlement(lapsed, now), true);
  assert.equal(shouldReverifyEntitlement({ ...lapsed, status: "billing_issue" }, now), true);
});

test("no re-read while the period runs, after a cancellation, or right after the last check", () => {
  const now = Date.now();
  const lapsed = { status: "active", willRenew: true, currentPeriodEndsAt: now - 1, updatedAt: now - REVERIFY_COOLDOWN_MS - 1 };
  assert.equal(shouldReverifyEntitlement({ ...lapsed, currentPeriodEndsAt: now + 60_000 }, now), false);
  assert.equal(shouldReverifyEntitlement({ ...lapsed, currentPeriodEndsAt: null }, now), false);
  assert.equal(shouldReverifyEntitlement({ ...lapsed, willRenew: false }, now), false);
  assert.equal(shouldReverifyEntitlement({ ...lapsed, status: "expired" }, now), false);
  assert.equal(shouldReverifyEntitlement({ ...lapsed, updatedAt: now - 1_000 }, now), false);
});
