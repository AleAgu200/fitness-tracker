import assert from "node:assert/strict";
import test from "node:test";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { attentionSignals, checkinRequests, followUpTasks, trainingSessions } from "@/db/schema";
import { AssignmentConflictError, assignWorkout } from "@/lib/assignments";
import { createCheckinRequest, reviewCheckin } from "@/lib/checkins";
import { requireCategoryAccess } from "@/lib/permissions";
import { CURRENT_SYNC_SCHEMA_VERSION } from "@/lib/sync-contract";
import { pullChanges, pushMutations } from "@/lib/sync";
import { setAthleteSharingConsent } from "@/lib/team-management";

const coachId = "coach_seed";
const athleteId = "athlete_seed";
const deviceId = "device-integration-001";

test("PostgreSQL vertical flow: sync, signal, review, task, conflict and revocation", async () => {
  const access = await requireCategoryAccess(coachId, athleteId, "training");
  assert.ok(access, "backfill should grant the coach training access");

  const sessionMutation = {
    schemaVersion: CURRENT_SYNC_SCHEMA_VERSION,
    mutationId: "mutation-session-001",
    entityType: "training_session" as const,
    entityId: "session-integration-001",
    operation: "create" as const,
    occurredAt: Date.now(),
    payload: {
      status: "completed" as const,
      startedAt: Date.now() - 3_600_000,
      completedAt: Date.now(),
      durationSeconds: 3600,
      totalVolumeKg: 4200,
      version: 1,
    },
  };
  const firstPush = await pushMutations(athleteId, deviceId, [sessionMutation]);
  const repeatedPush = await pushMutations(athleteId, deviceId, [sessionMutation]);
  assert.equal(firstPush.upgradeRequired, false);
  assert.equal(repeatedPush.upgradeRequired, false);
  if (firstPush.upgradeRequired || repeatedPush.upgradeRequired) throw new Error("unexpected_upgrade_required");
  assert.equal(firstPush.results[0].status, "acked");
  assert.equal(repeatedPush.results[0].serverSequence, firstPush.results[0].serverSequence);
  const sessionRows = await db.select().from(trainingSessions).where(eq(trainingSessions.id, sessionMutation.entityId));
  assert.equal(sessionRows.length, 1, "idempotent retry must not duplicate a session");

  const lateSet = {
    schemaVersion: CURRENT_SYNC_SCHEMA_VERSION,
    mutationId: "mutation-set-late-001",
    entityType: "training_set" as const,
    entityId: "set-integration-001",
    operation: "create" as const,
    occurredAt: Date.now(),
    payload: {
      sessionId: "session-integration-late-001",
      exerciseName: "Sentadilla",
      setIndex: 0,
      reps: 5,
      weightKg: 80,
      isPersonalRecord: false,
      completedAt: Date.now(),
      version: 1,
    },
  };
  const firstLateSetPush = await pushMutations(athleteId, deviceId, [lateSet]);
  assert.equal(firstLateSetPush.upgradeRequired, false);
  if (firstLateSetPush.upgradeRequired) throw new Error("unexpected_upgrade_required");
  assert.equal(firstLateSetPush.results[0].status, "retryable");
  await pushMutations(athleteId, deviceId, [{
    ...sessionMutation,
    mutationId: "mutation-session-late-001",
    entityId: "session-integration-late-001",
  }]);
  const retriedLateSetPush = await pushMutations(athleteId, deviceId, [lateSet]);
  assert.equal(retriedLateSetPush.upgradeRequired, false);
  if (retriedLateSetPush.upgradeRequired) throw new Error("unexpected_upgrade_required");
  assert.equal(retriedLateSetPush.results[0].status, "acked", "retryable mutations must be processed again");
  assert.equal(retriedLateSetPush.results[0].serverSequence, firstLateSetPush.results[0].serverSequence);

  const request = await createCheckinRequest({
    professionalUserId: coachId,
    athleteId,
    dueAt: Date.now() + 86_400_000,
    discipline: "coach",
  });
  assert.ok(request);
  const checkinMutation = {
    schemaVersion: CURRENT_SYNC_SCHEMA_VERSION,
    mutationId: "mutation-checkin-001",
    entityType: "checkin_response" as const,
    entityId: "response-integration-001",
    operation: "create" as const,
    occurredAt: Date.now(),
    payload: {
      requestId: request.id,
      schemaVersion: 1,
      submittedAt: Date.now(),
      answers: { energy: 5, sleep: 6, pain: 8, stress: 7, motivation: 5, obstacles: "Dolor de rodilla", note: "Necesito ajuste" },
    },
  };
  const checkinPush = await pushMutations(athleteId, deviceId, [checkinMutation]);
  assert.equal(checkinPush.upgradeRequired, false);
  if (checkinPush.upgradeRequired) throw new Error("unexpected_upgrade_required");
  assert.equal(checkinPush.results[0].status, "acked");
  const [signal] = await db.select().from(attentionSignals).where(eq(attentionSignals.checkinRequestId, request.id));
  assert.equal(signal?.severity, "urgent");
  assert.equal(signal?.status, "open");

  const review = await reviewCheckin({
    professionalUserId: coachId,
    requestId: request.id,
    action: "task",
    note: "Reducir carga y revisar evolución.",
    taskTitle: "Revisar dolor de rodilla",
    taskDueAt: Date.now() + 86_400_000,
  });
  assert.ok(review);
  const [reviewedRequest] = await db.select().from(checkinRequests).where(eq(checkinRequests.id, request.id));
  const [resolvedSignal] = await db.select().from(attentionSignals).where(eq(attentionSignals.id, signal.id));
  const tasks = await db.select().from(followUpTasks).where(and(eq(followUpTasks.athleteId, athleteId), eq(followUpTasks.status, "open")));
  assert.equal(reviewedRequest.status, "reviewed");
  assert.equal(resolvedSignal.status, "resolved");
  assert.ok(tasks.some(task => task.title === "Revisar dolor de rodilla"));

  const publishedVersion = await assignWorkout(coachId, athleteId, { coachName: "Coach Seed", exercises: [] }, { access, baseVersion: 1 });
  assert.equal(publishedVersion, 2);
  await assert.rejects(
    () => assignWorkout(coachId, athleteId, { coachName: "Coach Seed", exercises: [] }, { access, baseVersion: 1 }),
    (error: unknown) => error instanceof AssignmentConflictError && error.currentVersion === 2,
  );

  const pulled = await pullChanges({ athleteId, cursor: null, deviceId, ackSequence: 0 });
  assert.ok(pulled);
  assert.ok(pulled.changes.some(change => change.entityType === "checkin_request"));
  assert.ok(pulled.changes.some(change => change.entityType === "workout_assignment"));

  const revoked = await setAthleteSharingConsent({
    athleteUserId: athleteId,
    organizationId: access.organizationId,
    category: "training",
    granted: false,
  });
  assert.equal(revoked?.status, "revoked");
  assert.equal(await requireCategoryAccess(coachId, athleteId, "training"), null);
});
