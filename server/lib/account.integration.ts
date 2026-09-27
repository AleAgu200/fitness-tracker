import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  accountDeletions,
  auditEvents,
  messages,
  organizationClients,
  organizations,
  session,
  trainingSessions,
  user,
} from "@/db/schema";
import {
  cancelAccountDeletion,
  exportAccountData,
  getPendingDeletion,
  ProfessionalAccountError,
  purgeDueAccounts,
  requestAccountDeletion,
} from "@/lib/account";
import { createCheckinRequest } from "@/lib/checkins";
import { getProfessionalAccess } from "@/lib/permissions";
import { CURRENT_SYNC_SCHEMA_VERSION } from "@/lib/sync-contract";
import { pushMutations } from "@/lib/sync";
import { seedCoachedAthlete } from "@/lib/test-fixtures";
import { createFollowUpTask } from "@/lib/overview";

async function seedAthleteWithData() {
  const seeded = await seedCoachedAthlete({ categories: ["training", "checkins"] });
  const { athleteId, coachId } = seeded;
  const now = Date.now();
  await pushMutations(athleteId, `device_${athleteId}`, [{
    schemaVersion: CURRENT_SYNC_SCHEMA_VERSION,
    mutationId: `mutation_${athleteId}`,
    entityType: "training_session",
    entityId: `session_${athleteId}`,
    operation: "create",
    occurredAt: now,
    payload: { status: "completed", startedAt: now - 3_600_000, completedAt: now, totalVolumeKg: 1200, version: 1 },
  }]);
  await db.insert(session).values({
    id: `auth_${randomUUID()}`,
    token: randomUUID(),
    userId: athleteId,
    expiresAt: new Date(now + 86_400_000),
    createdAt: new Date(now),
    updatedAt: new Date(now),
  });
  await db.insert(messages).values({ id: `msg_${randomUUID()}`, senderId: coachId, receiverId: athleteId, content: "¿Cómo te sentiste?", sentAt: now });
  await createCheckinRequest({ professionalUserId: coachId, athleteId, dueAt: now + 86_400_000 });
  await createFollowUpTask({ professionalUserId: coachId, athleteId, title: "Revisar semana" });
  return seeded;
}

test("deletion: the grace period hides the athlete and cancelling restores the team link", async () => {
  const { athleteId, coachId, organizationClientId } = await seedAthleteWithData();

  const first = await requestAccountDeletion(athleteId);
  const repeated = await requestAccountDeletion(athleteId);
  assert.equal(repeated.requestedAt, first.requestedAt, "a second request returns the pending one");
  assert.deepEqual(await getProfessionalAccess(coachId, athleteId), [], "the team stops seeing the athlete right away");
  assert.equal((await db.select().from(session).where(eq(session.userId, athleteId))).length, 0, "every session is signed out");

  assert.equal(await cancelAccountDeletion(athleteId), true);
  assert.equal(await getPendingDeletion(athleteId), null);
  const [client] = await db.select().from(organizationClients).where(eq(organizationClients.id, organizationClientId));
  assert.equal(client.status, "active");
  assert.equal((await getProfessionalAccess(coachId, athleteId)).length, 1);
  assert.equal(await cancelAccountDeletion(athleteId), false, "nothing left to cancel");
});

test("deletion: the purge removes the athlete and leaves only a pseudonymous audit event", async () => {
  const { athleteId, coachId, organizationId } = await seedAthleteWithData();
  await requestAccountDeletion(athleteId);

  // Not due yet: the athlete must survive a sweep.
  await purgeDueAccounts();
  assert.equal((await db.select().from(user).where(eq(user.id, athleteId))).length, 1);

  // Age only this athlete's request, so the sweep can't touch other pending
  // deletions in a shared development database.
  await db.update(accountDeletions).set({ purgeAfter: Date.now() - 1000 })
    .where(and(eq(accountDeletions.userId, athleteId), eq(accountDeletions.status, "pending")));
  assert.ok(await purgeDueAccounts() >= 1);

  assert.equal((await db.select().from(user).where(eq(user.id, athleteId))).length, 0);
  assert.equal((await db.select().from(trainingSessions).where(eq(trainingSessions.athleteId, athleteId))).length, 0);
  assert.equal((await db.select().from(organizationClients).where(eq(organizationClients.athleteId, athleteId))).length, 0);
  assert.equal((await db.select().from(auditEvents).where(eq(auditEvents.subjectId, athleteId))).length, 0);

  const trail = await db.select().from(auditEvents).where(and(
    eq(auditEvents.organizationId, organizationId),
    eq(auditEvents.action, "athlete_account.deleted"),
  ));
  assert.equal(trail.length, 1);
  assert.equal(trail[0].subjectType, "deleted_athlete");
  assert.ok(!JSON.stringify(trail[0]).includes(athleteId), "the trail carries no reference to the athlete");

  const [record] = await db.select().from(accountDeletions).where(eq(accountDeletions.pseudonym, trail[0].subjectId));
  assert.equal(record.status, "completed");
  assert.equal(record.userId, null);

  // The professional and the organization are untouched; a rerun is a no-op.
  assert.equal((await db.select().from(user).where(eq(user.id, coachId))).length, 1);
  assert.equal((await db.select().from(organizations).where(eq(organizations.id, organizationId))).length, 1);
  await purgeDueAccounts();
  assert.equal((await db.select().from(auditEvents).where(eq(auditEvents.subjectId, trail[0].subjectId))).length, 1);
});

test("professionals can't delete their account from the app", async () => {
  const { coachId } = await seedCoachedAthlete();
  await assert.rejects(requestAccountDeletion(coachId), ProfessionalAccountError);
  assert.equal(await getPendingDeletion(coachId), null);
});

test("export returns the athlete's server data and never credentials", async () => {
  const { athleteId } = await seedAthleteWithData();
  const data = await exportAccountData(athleteId);
  assert.ok(data);
  assert.equal(data.account.id, athleteId);
  assert.equal(data.training.sessions.length, 1);
  assert.equal(data.messages.length, 1);
  assert.equal(data.teams.length, 1);
  assert.deepEqual(data.teams[0].sharing.map(item => item.category).sort(), ["checkins", "training"]);
  const serialized = JSON.stringify(data);
  assert.ok(!serialized.includes("password") && !serialized.includes("token"), "no credentials in the export");
});
