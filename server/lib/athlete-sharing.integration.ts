import assert from "node:assert/strict";
import test from "node:test";

import { getAthleteOverview } from "@/lib/overview";
import { CURRENT_SYNC_SCHEMA_VERSION, type SyncMutation } from "@/lib/sync-contract";
import { pushMutations } from "@/lib/sync";
import { seedCoachedAthlete } from "@/lib/test-fixtures";
import { setAthleteSharingConsent } from "@/lib/team-management";

let counter = 0;
function mutation(athleteId: string, input: Pick<SyncMutation, "entityType" | "entityId" | "operation" | "payload">): SyncMutation {
  counter += 1;
  return {
    schemaVersion: CURRENT_SYNC_SCHEMA_VERSION,
    mutationId: `mutation_${counter}_${athleteId}`,
    occurredAt: Date.now(),
    ...input,
  };
}

async function push(athleteId: string, item: SyncMutation) {
  const result = await pushMutations(athleteId, `device_${athleteId}`, [item]);
  if (result.upgradeRequired) throw new Error("unexpected_upgrade_required");
  return result.results[0];
}

const card = (sharedAt: number) => ({
  sessionId: "local_session_1",
  type: "new_pulse",
  metric: {
    exerciseName: "Remo con barra", weightKg: 62.5, reps: 8, deltaPct: 4.2, rpeDrop: null, daysAway: null,
    completedSets: 12, targetSets: 12, volumeKg: 6400, avgRpe: 7.8, durationMin: 52, muscles: ["upper_back", "biceps"],
  },
  earnedAt: Date.now() - 60_000,
  sharedAt,
});

test("a shared card reaches the coach until the athlete unshares it or revokes training", async () => {
  const { athleteId, coachId, organizationId } = await seedCoachedAthlete({ categories: ["training"] });
  const cardId = `card_${athleteId}`;

  assert.equal((await push(athleteId, mutation(athleteId, { entityType: "session_card", entityId: cardId, operation: "create", payload: card(Date.now()) }))).status, "acked");
  let overview = await getAthleteOverview(coachId, athleteId);
  assert.equal(overview?.sharedCards.length, 1);
  assert.equal(overview?.sharedCards[0].type, "new_pulse");

  await push(athleteId, mutation(athleteId, { entityType: "session_card", entityId: cardId, operation: "delete", payload: { unsharedAt: Date.now() } }));
  overview = await getAthleteOverview(coachId, athleteId);
  assert.equal(overview?.sharedCards.length, 0, "unsharing hides the card");

  await push(athleteId, mutation(athleteId, { entityType: "session_card", entityId: cardId, operation: "create", payload: card(Date.now()) }));
  assert.equal((await getAthleteOverview(coachId, athleteId))?.sharedCards.length, 1, "re-sharing keeps the same card");

  await setAthleteSharingConsent({ athleteUserId: athleteId, organizationId, category: "training", granted: false });
  overview = await getAthleteOverview(coachId, athleteId);
  assert.equal(overview?.sharedCards.length, 0, "revoking training hides shared cards at read time");
  assert.equal(overview?.progress.states.training, "revoked");
});

test("an invalid card is rejected instead of stored", async () => {
  const { athleteId } = await seedCoachedAthlete();
  const result = await push(athleteId, mutation(athleteId, {
    entityType: "session_card", entityId: `bad_${athleteId}`, operation: "create", payload: { ...card(Date.now()), type: "leaderboard" },
  }));
  assert.equal(result.status, "rejected");
  assert.equal(result.error, "invalid_session_card");
});

test("the coach sees only whether their plan is selected, and the latest switch wins", async () => {
  const { athleteId, coachId } = await seedCoachedAthlete({ categories: ["training"] });
  const now = Date.now();

  await push(athleteId, mutation(athleteId, { entityType: "plan_selection", entityId: athleteId, operation: "update", payload: { coachPlanSelected: false, selectedAt: now } }));
  // A late retry of an older switch must not overwrite the newer one.
  await push(athleteId, mutation(athleteId, { entityType: "plan_selection", entityId: athleteId, operation: "update", payload: { coachPlanSelected: true, selectedAt: now - 60_000 } }));

  const overview = await getAthleteOverview(coachId, athleteId);
  assert.deepEqual(overview?.planSelection, { coachPlanSelected: false, selectedAt: now });
});

test("the nutritionist sees only whether their meal plan is selected, gated by the nutrition consent", async () => {
  const { athleteId, coachId: nutritionistId, organizationId } = await seedCoachedAthlete({ discipline: "nutritionist", categories: ["nutrition"] });
  const now = Date.now();

  await push(athleteId, mutation(athleteId, { entityType: "meal_plan_selection", entityId: athleteId, operation: "update", payload: { nutritionistPlanSelected: false, selectedAt: now } }));
  await push(athleteId, mutation(athleteId, { entityType: "meal_plan_selection", entityId: athleteId, operation: "update", payload: { nutritionistPlanSelected: true, selectedAt: now - 60_000 } }));

  let overview = await getAthleteOverview(nutritionistId, athleteId);
  assert.deepEqual(overview?.mealPlanSelection, { nutritionistPlanSelected: false, selectedAt: now });
  assert.equal(overview?.planSelection, null, "a nutritionist never sees the training selection");

  await setAthleteSharingConsent({ athleteUserId: athleteId, organizationId, category: "nutrition", granted: false });
  overview = await getAthleteOverview(nutritionistId, athleteId);
  assert.equal(overview?.mealPlanSelection, null, "revoking nutrition hides the selection");
});

test("an invalid meal plan selection is rejected", async () => {
  const { athleteId } = await seedCoachedAthlete({ discipline: "nutritionist", categories: ["nutrition"] });
  const result = await push(athleteId, mutation(athleteId, {
    entityType: "meal_plan_selection", entityId: athleteId, operation: "update", payload: { coachPlanSelected: true, selectedAt: Date.now() },
  }));
  assert.equal(result.status, "rejected");
  assert.equal(result.error, "invalid_meal_plan_selection");
});

test("overview ranges report coverage and distinguish empty from unauthorized", async () => {
  const { athleteId, coachId } = await seedCoachedAthlete({ categories: ["training"] });
  const empty = await getAthleteOverview(coachId, athleteId, 7);
  assert.equal(empty?.progress.periodDays, 7);
  assert.equal(empty?.progress.states.training, "empty");
  assert.equal(empty?.progress.states.nutrition, "not_authorized", "a coach never sees nutrition");

  const now = Date.now();
  await push(athleteId, mutation(athleteId, {
    entityType: "training_session", entityId: `session_${athleteId}`, operation: "create",
    payload: { status: "completed", startedAt: now - 3_600_000, completedAt: now, totalVolumeKg: 900, version: 1 },
  }));
  const withData = await getAthleteOverview(coachId, athleteId, 90);
  assert.equal(withData?.progress.states.training, "ok");
  assert.equal(withData?.progress.training?.daysWithData, 1);
  assert.equal(withData?.progress.training?.coverage, 1 / 90);
});
