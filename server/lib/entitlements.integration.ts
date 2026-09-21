import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

import { db } from "@/db";
import { planGenerationJobs, user } from "@/db/schema";
import { canGeneratePlan, FREE_GENERATION_LIMIT, getEntitlement } from "@/lib/entitlements";
import { applyEntitlement, clearEntitlement } from "@/lib/revenuecat";

const DAY = 24 * 60 * 60 * 1000;

async function seedAthlete(): Promise<string> {
  const id = `athlete_${randomUUID()}`;
  const now = new Date();
  await db.insert(user).values({
    id,
    name: "Atleta Billing",
    email: `${id}@pulso.test`,
    role: "athlete",
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function recordCompletedGeneration(userId: string): Promise<void> {
  const now = Date.now();
  await db.insert(planGenerationJobs).values({
    id: `job_${randomUUID()}`,
    userId,
    inputHash: randomUUID(),
    status: "succeeded",
    phase: "completed",
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    consumedAt: now,
  });
}

test("the first plan is free and the second one hits the paywall", async () => {
  const userId = await seedAthlete();

  const initial = await canGeneratePlan(userId);
  assert.equal(initial.allowed, true, "onboarding must never hit a wall");
  assert.equal(initial.freeUsed, 0);
  assert.equal(initial.freeLimit, FREE_GENERATION_LIMIT);

  await recordCompletedGeneration(userId);

  const second = await canGeneratePlan(userId);
  assert.equal(second.allowed, false);
  assert.equal(second.reason, "free_quota_exhausted");
  assert.equal(second.entitled, false);
});

test("an active subscription lifts the generation limit", async () => {
  const userId = await seedAthlete();
  await recordCompletedGeneration(userId);
  assert.equal((await canGeneratePlan(userId)).allowed, false);

  await applyEntitlement({
    userId,
    entitlement: {
      status: "active",
      productId: "pulso_plus_monthly",
      store: "play_store",
      isSandbox: false,
      currentPeriodEndsAt: Date.now() + 30 * DAY,
      willRenew: true,
    },
  });

  const allowance = await canGeneratePlan(userId);
  assert.equal(allowance.allowed, true);
  assert.equal(allowance.entitled, true);
});

test("an elapsed period is not entitlement even if the status still says active", async () => {
  const userId = await seedAthlete();
  await recordCompletedGeneration(userId);
  await applyEntitlement({
    userId,
    entitlement: {
      status: "active",
      productId: "pulso_plus_monthly",
      store: "app_store",
      isSandbox: false,
      // Renewal webhook never arrived; failing closed is the safe default
      // because every generation costs real money upstream.
      currentPeriodEndsAt: Date.now() - DAY,
      willRenew: true,
    },
  });

  assert.equal((await getEntitlement(userId)).entitled, false);
  assert.equal((await canGeneratePlan(userId)).allowed, false);
});

test("cancelled keeps access until the period ends; expiration revokes immediately", async () => {
  const userId = await seedAthlete();
  await recordCompletedGeneration(userId);

  await applyEntitlement({
    userId,
    entitlement: {
      status: "cancelled",
      productId: "pulso_plus_monthly",
      store: "app_store",
      isSandbox: false,
      currentPeriodEndsAt: Date.now() + 5 * DAY,
      willRenew: false,
    },
  });
  // Auto-renew off, but they paid for this period.
  assert.equal((await getEntitlement(userId)).entitled, false, "cancelled is not an entitled status");

  await applyEntitlement({
    userId,
    entitlement: {
      status: "billing_issue",
      productId: "pulso_plus_monthly",
      store: "app_store",
      isSandbox: false,
      currentPeriodEndsAt: Date.now() + 5 * DAY,
      willRenew: true,
    },
  });
  // A retryable billing problem must not lock someone out mid-period.
  assert.equal((await getEntitlement(userId)).entitled, true);

  await clearEntitlement(userId);
  assert.equal((await getEntitlement(userId)).entitled, false);
});
