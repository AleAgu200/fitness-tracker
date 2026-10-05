import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { careAssignments, organizationClients, sharingConsents, syncChanges, user, userReports } from "@/db/schema";
import { areLinked, sendMessage } from "@/lib/messaging";
import { requireCategoryAccess } from "@/lib/permissions";
import { acceptInvite, createInvite, getTeam } from "@/lib/supervision";
import { leaveProfessional } from "@/lib/team-leave";
import { seedCoachedAthlete } from "@/lib/test-fixtures";
import { closeReport, createReport } from "@/lib/user-reports";

/** A coach and an athlete linked through a real invite code, as the app does it. */
async function linkThroughInvite() {
  const nonce = randomUUID();
  const coachId = `pro_${nonce}`;
  const athleteId = `athlete_${nonce}`;
  const timestamps = { createdAt: new Date(), updatedAt: new Date() };
  await db.insert(user).values([
    { id: coachId, name: "Coach Test", email: `${coachId}@pulso.test`, role: "coach", ...timestamps },
    { id: athleteId, name: "Atleta Test", email: `${athleteId}@pulso.test`, role: "athlete", ...timestamps },
  ]);
  const accepted = await acceptInvite(athleteId, await createInvite(coachId, "coach"));
  assert.equal(accepted.ok, true);
  return { coachId, athleteId };
}

test("leaving a professional cuts access, messaging and every consent", async () => {
  const { coachId, athleteId, organizationClientId } = await seedCoachedAthlete({ categories: ["training", "metrics"] });
  assert.ok(await requireCategoryAccess(coachId, athleteId, "training"));

  const left = await leaveProfessional(athleteId, coachId);
  assert.deepEqual(left, { ok: true });

  assert.equal(await requireCategoryAccess(coachId, athleteId, "training"), null);
  assert.equal(await areLinked(athleteId, coachId), false);
  const [client] = await db.select().from(organizationClients).where(eq(organizationClients.id, organizationClientId));
  assert.equal(client.status, "revoked");
  const consents = await db.select().from(sharingConsents).where(eq(sharingConsents.organizationClientId, organizationClientId));
  assert.ok(consents.length > 0);
  assert.ok(consents.every(consent => consent.revokedAt != null));

  // The athlete's devices hear about it: the assignment is gone and each consent is off.
  const changes = await db.select().from(syncChanges).where(eq(syncChanges.athleteId, athleteId));
  assert.ok(changes.some(change => change.entityType === "care_assignment" && change.operation === "delete"));
  const consentChanges = changes.filter(change => change.entityType === "sharing_consent");
  assert.equal(consentChanges.length, consents.length);
  assert.ok(consentChanges.every(change => (change.payload as { granted: boolean }).granted === false));
  assert.ok(changes.some(change => change.entityType === "organization_client" && change.entityId === organizationClientId));

  assert.deepEqual(await leaveProfessional(athleteId, coachId), { ok: false, error: "not_linked" });
});

test("an athlete who left can come back with a new invite code", async () => {
  const { coachId, athleteId } = await linkThroughInvite();
  assert.equal((await getTeam(athleteId)).length, 1);

  assert.deepEqual(await leaveProfessional(athleteId, coachId), { ok: true });
  assert.equal((await getTeam(athleteId)).length, 0);
  assert.equal(await areLinked(athleteId, coachId), false);

  const again = await acceptInvite(athleteId, await createInvite(coachId, "coach"));
  assert.equal(again.ok, true);
  const team = await getTeam(athleteId);
  assert.equal(team.length, 1);
  assert.equal(team[0].userId, coachId);
  assert.equal(await areLinked(athleteId, coachId), true);
  // Rejoining grants the default categories again.
  assert.ok(await requireCategoryAccess(coachId, athleteId, "training"));

  const [client] = await db.select().from(organizationClients).where(eq(organizationClients.athleteId, athleteId));
  const active = await db.select().from(careAssignments)
    .where(and(eq(careAssignments.organizationClientId, client.id), eq(careAssignments.status, "active")));
  assert.equal(active.length, 1);
  assert.equal(active[0].primary, true);
});

test("a report snapshots the conversation and survives leaving the team", async () => {
  const { coachId, athleteId } = await linkThroughInvite();
  await sendMessage(coachId, athleteId, "Hola, ¿cómo vas?");
  await sendMessage(athleteId, coachId, "Bien");
  await leaveProfessional(athleteId, coachId);

  const first = await createReport({ reporterId: athleteId, reportedUserId: coachId, reason: "harassment", detail: " Me escribe de noche " });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const [row] = await db.select().from(userReports).where(eq(userReports.id, first.id));
  assert.equal(row.detail, "Me escribe de noche");
  const evidence = row.evidence as { messages: { from: string; content: string }[] };
  assert.deepEqual(evidence.messages.map(message => message.from), ["reported", "reporter"]);

  // A second report while the first is open updates it instead of piling up.
  const second = await createReport({ reporterId: athleteId, reportedUserId: coachId, reason: "spam" });
  assert.deepEqual(second, { ok: true, id: first.id });

  assert.equal(await closeReport({ id: athleteId }, first.id, "resolved", "Cuenta suspendida"), true);
  assert.equal(await closeReport({ id: athleteId }, first.id, "dismissed"), false);
});

test("strangers and yourself cannot be reported", async () => {
  const { athleteId } = await linkThroughInvite();
  const other = await linkThroughInvite();
  assert.deepEqual(
    await createReport({ reporterId: athleteId, reportedUserId: other.coachId, reason: "spam" }),
    { ok: false, error: "not_related" },
  );
  assert.deepEqual(
    await createReport({ reporterId: athleteId, reportedUserId: athleteId, reason: "spam" }),
    { ok: false, error: "self_report" },
  );
});
