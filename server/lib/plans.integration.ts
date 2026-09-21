import assert from "node:assert/strict";
import test from "node:test";

import {
  assignWorkout,
  getActiveWorkout,
  getScheduledWorkout,
  listWorkoutHistory,
  withdrawScheduledPlan,
} from "@/lib/assignments";
import { DraftConflictError, openDraft, publishDraft, saveDraft } from "@/lib/plans";
import { seedCoachedAthlete } from "@/lib/test-fixtures";

const DAY = 24 * 60 * 60 * 1000;

function exercises(nombre: string) {
  return [{ nombre, target: 3, reps: 8, peso: 60, step: 2.5, restSeconds: 90 }];
}

test("a future-dated plan does not disturb the plan in force until it takes effect", async () => {
  const { access, coachId, athleteId } = await seedCoachedAthlete();

  const now = Date.now();
  await assignWorkout(coachId, athleteId, { coachName: "Coach", exercises: exercises("Actual") }, {
    access,
    effectiveAt: now - DAY,
    name: "Fase actual",
  });

  const scheduledVersion = await assignWorkout(
    coachId,
    athleteId,
    { coachName: "Coach", exercises: exercises("Siguiente") },
    { access, effectiveAt: now + 3 * DAY, name: "Fase siguiente" },
  );

  const active = await getActiveWorkout(athleteId, now);
  assert.equal(active?.name, "Fase actual", "athlete keeps training the current phase");
  assert.equal(active?.payload.exercises[0].nombre, "Actual");

  const scheduled = await getScheduledWorkout(athleteId, now);
  assert.equal(scheduled?.version, scheduledVersion);
  assert.equal(scheduled?.name, "Fase siguiente");

  // Time travel rather than waiting: the window is evaluated against `now`.
  const later = await getActiveWorkout(athleteId, now + 4 * DAY);
  assert.equal(later?.version, scheduledVersion, "the scheduled phase takes over on its effective date");
  assert.equal(later?.payload.exercises[0].nombre, "Siguiente");

  assert.equal(await getScheduledWorkout(athleteId, now + 4 * DAY), null);
});

test("withdrawing a scheduled plan leaves the athlete on their current plan", async () => {
  const { access, coachId, athleteId } = await seedCoachedAthlete();

  const now = Date.now();
  await assignWorkout(coachId, athleteId, { coachName: "Coach", exercises: exercises("Vigente") }, {
    access,
    effectiveAt: now - DAY,
    name: "Vigente",
  });
  const scheduledVersion = await assignWorkout(
    coachId,
    athleteId,
    { coachName: "Coach", exercises: exercises("Cancelado") },
    { access, effectiveAt: now + 2 * DAY, name: "Cancelado" },
  );

  assert.equal(await withdrawScheduledPlan(athleteId, "coach", scheduledVersion, now), true);

  const afterWithdrawal = await getActiveWorkout(athleteId, now + 5 * DAY);
  assert.equal(afterWithdrawal?.name, "Vigente", "the current plan's window must reopen");
  assert.equal(await getScheduledWorkout(athleteId, now), null);

  // A plan that already applied cannot be withdrawn — only superseded.
  assert.equal(await withdrawScheduledPlan(athleteId, "coach", afterWithdrawal!.version, now), false);
});

test("publishing a draft against a stale base version conflicts instead of overwriting", async () => {
  const { access, coachId, athleteId } = await seedCoachedAthlete();

  await openDraft(access, athleteId);
  await saveDraft(access, athleteId, {
    payload: { coachName: "Coach", exercises: exercises("Desde borrador") },
    name: "Borrador",
  });

  // Someone else publishes while the draft is open.
  await assignWorkout(coachId, athleteId, { coachName: "Coach", exercises: exercises("Interpuesto") }, { access });

  await assert.rejects(
    () => publishDraft(access, athleteId, coachId, "Coach"),
    (error: unknown) => error instanceof DraftConflictError,
    "a stale draft must not silently overwrite the newer published plan",
  );

  // The draft survives the conflict so the work is not lost.
  const draft = await openDraft(access, athleteId);
  assert.equal(draft.name, "Borrador");
  assert.equal(draft.stale, true, "draft should report that its base version moved");
});

test("publishing a draft records history and clears the draft", async () => {
  const { access, coachId, athleteId } = await seedCoachedAthlete();

  const fresh = await openDraft(access, athleteId);
  assert.equal(fresh.stale, false);
  await saveDraft(access, athleteId, {
    payload: { coachName: "Coach", exercises: exercises("Publicado") },
    name: "Fase publicada",
  });

  const result = await publishDraft(access, athleteId, coachId, "Coach");
  assert.ok(result, "publish should return the new version");

  const active = await getActiveWorkout(athleteId);
  assert.equal(active?.version, result.version);
  assert.equal(active?.name, "Fase publicada");
  assert.equal(active?.payload.coachName, "Coach");

  const history = await listWorkoutHistory(athleteId);
  assert.ok(history.some(entry => entry.version === result.version), "published version appears in history");

  // Reopening after publish starts a clean draft seeded from what is now live.
  const reopened = await openDraft(access, athleteId);
  assert.equal(reopened.name, null);
  assert.equal(reopened.baseVersion, result.version);
});
