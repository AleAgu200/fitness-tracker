import assert from "node:assert/strict";
import test from "node:test";

import { normalizeEvent, verifyWebhookAuthorization } from "./revenuecat-events";

test("webhook authorization fails closed", () => {
  const original = process.env.REVENUECAT_WEBHOOK_SECRET;

  delete process.env.REVENUECAT_WEBHOOK_SECRET;
  // An unconfigured secret must never mean "allow everything".
  assert.equal(verifyWebhookAuthorization("anything"), false);

  process.env.REVENUECAT_WEBHOOK_SECRET = "sk_test_secret";
  assert.equal(verifyWebhookAuthorization("sk_test_secret"), true);
  assert.equal(verifyWebhookAuthorization("sk_test_secre"), false);
  assert.equal(verifyWebhookAuthorization("sk_test_secretX"), false);
  assert.equal(verifyWebhookAuthorization("SK_TEST_SECRET"), false);
  assert.equal(verifyWebhookAuthorization(null), false);
  assert.equal(verifyWebhookAuthorization(""), false);

  if (original === undefined) delete process.env.REVENUECAT_WEBHOOK_SECRET;
  else process.env.REVENUECAT_WEBHOOK_SECRET = original;
});

test("purchase and renewal events grant access", () => {
  for (const type of ["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE"]) {
    const result = normalizeEvent({ type, product_id: "pulso_plus_monthly", expiration_at_ms: 4_102_444_800_000 });
    assert.equal(result?.status, "active", `${type} should grant access`);
    assert.equal(result?.willRenew, true);
  }
});

test("cancellation keeps access until the period ends, expiration removes it", () => {
  // Turning off auto-renew is not the same as losing access — the athlete paid
  // for the period and must keep it.
  const cancelled = normalizeEvent({ type: "CANCELLATION", expiration_at_ms: 4_102_444_800_000 });
  assert.equal(cancelled?.status, "cancelled");
  assert.equal(cancelled?.willRenew, false);
  assert.equal(cancelled?.currentPeriodEndsAt, 4_102_444_800_000);

  assert.equal(normalizeEvent({ type: "EXPIRATION" })?.status, "expired");
  assert.equal(normalizeEvent({ type: "BILLING_ISSUE" })?.status, "billing_issue");
  assert.equal(normalizeEvent({ type: "SUBSCRIPTION_PAUSED" })?.status, "paused");
});

test("unmapped event types never change entitlement", () => {
  assert.equal(normalizeEvent({ type: "TEST" }), null);
  assert.equal(normalizeEvent({ type: "TRANSFER" }), null);
  assert.equal(normalizeEvent({ type: "SUBSCRIBER_ALIAS" }), null);
  assert.equal(normalizeEvent({}), null);
});

test("sandbox purchases are flagged", () => {
  assert.equal(normalizeEvent({ type: "INITIAL_PURCHASE", environment: "SANDBOX" })?.isSandbox, true);
  assert.equal(normalizeEvent({ type: "INITIAL_PURCHASE", environment: "PRODUCTION" })?.isSandbox, false);
});
