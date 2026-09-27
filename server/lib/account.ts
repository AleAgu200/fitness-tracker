import { randomBytes } from "crypto";

import { and, asc, eq, inArray, lte, or } from "drizzle-orm";

import { db } from "@/db";
import {
  accountDeletions,
  assignedMealPlans,
  assignedWorkouts,
  athleteDailySummaries,
  athleteMealPlanSelections,
  athletePlanSelections,
  athleteProfiles,
  attentionSignals,
  auditEvents,
  bodyMeasurements,
  careAssignments,
  checkinRequests,
  checkinResponses,
  checkinReviews,
  followUpTasks,
  messages,
  nutritionEntries,
  organizationClients,
  organizationMemberships,
  organizations,
  planDrafts,
  professionalNotes,
  pushDevices,
  session,
  sharedSessionCards,
  sharingConsents,
  subscriptions,
  syncChanges,
  syncDevices,
  syncMutations,
  trainingSessions,
  trainingSets,
  user,
} from "@/db/schema";

/** Time the athlete has to change their mind before the purge. */
export const DELETION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export class ProfessionalAccountError extends Error {
  constructor() {
    super("professional_account");
  }
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

export interface DeletionStatus {
  status: "pending";
  requestedAt: number;
  purgeAfter: number;
}

export async function getPendingDeletion(userId: string): Promise<DeletionStatus | null> {
  const [row] = await db.select().from(accountDeletions)
    .where(and(eq(accountDeletions.userId, userId), eq(accountDeletions.status, "pending")));
  return row ? { status: "pending", requestedAt: row.requestedAt, purgeAfter: row.purgeAfter } : null;
}

/**
 * Starts the 30-day grace period. Immediately: every session is signed out,
 * push devices are dropped and each organization link is paused, so the care
 * team stops seeing the athlete. Idempotent — a second request returns the
 * pending one. Professionals can't delete from the app: their organizations,
 * published plans and athletes need a hand-off first.
 */
export async function requestAccountDeletion(userId: string): Promise<DeletionStatus> {
  const existing = await getPendingDeletion(userId);
  if (existing) return existing;

  const memberships = await db.select({ id: organizationMemberships.id }).from(organizationMemberships)
    .where(and(eq(organizationMemberships.userId, userId), inArray(organizationMemberships.status, ["active", "invited"])));
  if (memberships.length) throw new ProfessionalAccountError();

  const now = Date.now();
  const purgeAfter = now + DELETION_GRACE_MS;
  try {
    await db.transaction(async (tx) => {
      const clients = await tx.select({ id: organizationClients.id, organizationId: organizationClients.organizationId })
        .from(organizationClients)
        .where(and(eq(organizationClients.athleteId, userId), eq(organizationClients.status, "active")));
      if (clients.length) {
        await tx.update(organizationClients).set({ status: "paused", pausedAt: now })
          .where(inArray(organizationClients.id, clients.map(client => client.id)));
      }
      await tx.insert(accountDeletions).values({
        id: newId("deletion"),
        userId,
        pseudonym: newId("deleted_athlete"),
        status: "pending",
        requestedAt: now,
        purgeAfter,
        pausedClientIds: clients.map(client => client.id),
      });
      for (const organizationId of new Set(clients.map(client => client.organizationId))) {
        await tx.insert(auditEvents).values({
          id: newId("audit"),
          organizationId,
          actorUserId: userId,
          action: "athlete_account.deletion_requested",
          subjectType: "athlete",
          subjectId: userId,
          metadata: { purgeAfter },
          occurredAt: now,
        });
      }
      await tx.delete(pushDevices).where(eq(pushDevices.userId, userId));
      await tx.delete(session).where(eq(session.userId, userId));
    });
  } catch (error) {
    // Two concurrent requests: the unique pending index lets exactly one win.
    const raced = await getPendingDeletion(userId);
    if (raced) return raced;
    throw error;
  }
  return { status: "pending", requestedAt: now, purgeAfter };
}

/** Cancels a pending deletion and restores the organization links it paused. */
export async function cancelAccountDeletion(userId: string): Promise<boolean> {
  const now = Date.now();
  return db.transaction(async (tx) => {
    const [row] = await tx.update(accountDeletions)
      .set({ status: "cancelled", cancelledAt: now })
      .where(and(eq(accountDeletions.userId, userId), eq(accountDeletions.status, "pending")))
      .returning();
    if (!row) return false;
    const pausedIds = row.pausedClientIds ?? [];
    if (pausedIds.length) {
      // Only links still paused by this request; a team may have ended one since.
      const restored = await tx.update(organizationClients).set({ status: "active", pausedAt: null })
        .where(and(inArray(organizationClients.id, pausedIds), eq(organizationClients.status, "paused")))
        .returning({ organizationId: organizationClients.organizationId });
      for (const organizationId of new Set(restored.map(client => client.organizationId))) {
        await tx.insert(auditEvents).values({
          id: newId("audit"),
          organizationId,
          actorUserId: userId,
          action: "athlete_account.deletion_cancelled",
          subjectType: "athlete",
          subjectId: userId,
          occurredAt: now,
        });
      }
    }
    return true;
  });
}

/**
 * Purges accounts whose grace period ended. Each purge runs in one
 * transaction holding the deletion row's lock, and marks it completed last —
 * so repeated or concurrent runs never purge twice and a failed purge simply
 * stays pending for the next run.
 */
export async function purgeDueAccounts(now = Date.now()): Promise<number> {
  const due = await db.select({ id: accountDeletions.id }).from(accountDeletions)
    .where(and(eq(accountDeletions.status, "pending"), lte(accountDeletions.purgeAfter, now)));
  let purged = 0;
  for (const { id } of due) {
    try {
      if (await purgeAccount(id, now)) purged += 1;
    } catch (error) {
      console.error("[account-purge] failed", { deletionId: id, error });
    }
  }
  return purged;
}

/**
 * Deletes everything tied to the athlete, in foreign-key order (most links are
 * `restrict` on purpose, so nothing disappears by accident elsewhere). Each
 * organization that knew the athlete keeps a single audit event with a
 * pseudonym — no name, email, health data or notes.
 */
async function purgeAccount(deletionId: string, now: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(accountDeletions)
      .where(and(
        eq(accountDeletions.id, deletionId),
        eq(accountDeletions.status, "pending"),
        lte(accountDeletions.purgeAfter, now),
      ))
      .for("update");
    if (!row?.userId) return false;
    const userId = row.userId;

    const clients = await tx.select({ id: organizationClients.id, organizationId: organizationClients.organizationId })
      .from(organizationClients).where(eq(organizationClients.athleteId, userId));
    const clientIds = clients.map(client => client.id);
    const requestIds = (await tx.select({ id: checkinRequests.id }).from(checkinRequests)
      .where(eq(checkinRequests.athleteId, userId))).map(request => request.id);

    // What professionals hold about the athlete.
    await tx.delete(followUpTasks).where(eq(followUpTasks.athleteId, userId));
    await tx.delete(attentionSignals).where(eq(attentionSignals.athleteId, userId));
    if (requestIds.length) {
      await tx.delete(checkinReviews).where(inArray(checkinReviews.requestId, requestIds));
      await tx.delete(checkinResponses).where(inArray(checkinResponses.requestId, requestIds));
      await tx.delete(checkinRequests).where(inArray(checkinRequests.id, requestIds));
    }
    await tx.delete(professionalNotes).where(eq(professionalNotes.athleteId, userId));
    await tx.delete(planDrafts).where(eq(planDrafts.athleteId, userId));
    await tx.delete(assignedWorkouts).where(eq(assignedWorkouts.athleteId, userId));
    await tx.delete(assignedMealPlans).where(eq(assignedMealPlans.athleteId, userId));
    if (clientIds.length) {
      await tx.delete(sharingConsents).where(inArray(sharingConsents.organizationClientId, clientIds));
      await tx.delete(careAssignments).where(inArray(careAssignments.organizationClientId, clientIds));
      await tx.delete(organizationClients).where(inArray(organizationClients.id, clientIds));
    }
    await tx.delete(auditEvents).where(eq(auditEvents.subjectId, userId));
    await tx.update(auditEvents).set({ actorUserId: null }).where(eq(auditEvents.actorUserId, userId));

    // What the phone synced.
    await tx.delete(syncChanges).where(eq(syncChanges.athleteId, userId));
    await tx.delete(syncMutations).where(eq(syncMutations.athleteId, userId));
    await tx.delete(trainingSets).where(eq(trainingSets.athleteId, userId));
    await tx.delete(trainingSessions).where(eq(trainingSessions.athleteId, userId));
    await tx.delete(nutritionEntries).where(eq(nutritionEntries.athleteId, userId));
    await tx.delete(athleteDailySummaries).where(eq(athleteDailySummaries.athleteId, userId));
    await tx.delete(bodyMeasurements).where(eq(bodyMeasurements.athleteId, userId));
    await tx.delete(syncDevices).where(eq(syncDevices.athleteId, userId));

    // The rest cascades from the user row: auth sessions and credentials,
    // profile, messages, push devices, AI generation jobs, subscription,
    // shared cards and plan selections. Billing events keep the store receipt
    // with the user reference nulled (they carry no health data).
    await tx.delete(user).where(eq(user.id, userId));

    for (const organizationId of new Set(clients.map(client => client.organizationId))) {
      await tx.insert(auditEvents).values({
        id: newId("audit"),
        organizationId,
        action: "athlete_account.deleted",
        subjectType: "deleted_athlete",
        subjectId: row.pseudonym,
        metadata: { requestedAt: row.requestedAt },
        occurredAt: now,
      });
    }
    await tx.update(accountDeletions)
      .set({ status: "completed", completedAt: now, userId: null, pausedClientIds: [] })
      .where(eq(accountDeletions.id, deletionId));
    return true;
  });
}

/**
 * Everything the server holds about the athlete, as plain JSON. The phone adds
 * its local history on top (most data lives only there). Credentials, tokens
 * and professionals' private notes are excluded; notes a professional wrote
 * for the athlete are included.
 */
export async function exportAccountData(userId: string) {
  const [account] = await db.select({
    id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt,
  }).from(user).where(eq(user.id, userId));
  if (!account) return null;

  const clients = await db.select({
    id: organizationClients.id,
    organizationId: organizationClients.organizationId,
    organizationName: organizations.name,
    status: organizationClients.status,
    createdAt: organizationClients.createdAt,
  }).from(organizationClients)
    .innerJoin(organizations, eq(organizations.id, organizationClients.organizationId))
    .where(eq(organizationClients.athleteId, userId));
  const clientIds = clients.map(client => client.id);

  const [
    profile, measurements, sessions, sets, nutrition, summaries, consents, care, checkins, notes,
    workouts, mealPlans, conversation, subscription, cards, planSelection, mealPlanSelection,
  ] = await Promise.all([
    db.select().from(athleteProfiles).where(eq(athleteProfiles.userId, userId)),
    db.select().from(bodyMeasurements).where(eq(bodyMeasurements.athleteId, userId)).orderBy(asc(bodyMeasurements.measuredAt)),
    db.select().from(trainingSessions).where(eq(trainingSessions.athleteId, userId)).orderBy(asc(trainingSessions.startedAt)),
    db.select().from(trainingSets).where(eq(trainingSets.athleteId, userId)).orderBy(asc(trainingSets.completedAt)),
    db.select().from(nutritionEntries).where(eq(nutritionEntries.athleteId, userId)).orderBy(asc(nutritionEntries.occurredAt)),
    db.select().from(athleteDailySummaries).where(eq(athleteDailySummaries.athleteId, userId)).orderBy(asc(athleteDailySummaries.date)),
    clientIds.length ? db.select().from(sharingConsents).where(inArray(sharingConsents.organizationClientId, clientIds)) : Promise.resolve([]),
    clientIds.length
      ? db.select({ organizationClientId: careAssignments.organizationClientId, discipline: careAssignments.discipline, primary: careAssignments.primary, status: careAssignments.status, createdAt: careAssignments.createdAt })
          .from(careAssignments).where(inArray(careAssignments.organizationClientId, clientIds))
      : Promise.resolve([]),
    db.select({
      requestId: checkinRequests.id, dueAt: checkinRequests.dueAt, status: checkinRequests.status,
      submittedAt: checkinResponses.submittedAt, answers: checkinResponses.answers,
    }).from(checkinRequests)
      .leftJoin(checkinResponses, eq(checkinResponses.requestId, checkinRequests.id))
      .where(eq(checkinRequests.athleteId, userId)),
    db.select({ body: professionalNotes.body, createdAt: professionalNotes.createdAt, organizationId: professionalNotes.organizationId })
      .from(professionalNotes)
      .where(and(eq(professionalNotes.athleteId, userId), eq(professionalNotes.visibility, "athlete"))),
    db.select({ name: assignedWorkouts.name, version: assignedWorkouts.version, status: assignedWorkouts.status, payload: assignedWorkouts.payload, effectiveAt: assignedWorkouts.effectiveAt, createdAt: assignedWorkouts.createdAt })
      .from(assignedWorkouts).where(eq(assignedWorkouts.athleteId, userId)),
    db.select({ name: assignedMealPlans.name, version: assignedMealPlans.version, status: assignedMealPlans.status, payload: assignedMealPlans.payload, effectiveAt: assignedMealPlans.effectiveAt, createdAt: assignedMealPlans.createdAt })
      .from(assignedMealPlans).where(eq(assignedMealPlans.athleteId, userId)),
    db.select().from(messages).where(or(eq(messages.senderId, userId), eq(messages.receiverId, userId))).orderBy(asc(messages.sentAt)),
    db.select({ entitlement: subscriptions.entitlement, status: subscriptions.status, productId: subscriptions.productId, store: subscriptions.store, currentPeriodEndsAt: subscriptions.currentPeriodEndsAt })
      .from(subscriptions).where(eq(subscriptions.userId, userId)),
    db.select().from(sharedSessionCards).where(eq(sharedSessionCards.athleteId, userId)),
    db.select().from(athletePlanSelections).where(eq(athletePlanSelections.athleteId, userId)),
    db.select().from(athleteMealPlanSelections).where(eq(athleteMealPlanSelections.athleteId, userId)),
  ]);

  const organizationNames = new Map(clients.map(client => [client.organizationId, client.organizationName]));
  return {
    account,
    profile: profile[0] ?? null,
    teams: clients.map(client => ({
      organization: client.organizationName,
      status: client.status,
      since: client.createdAt,
      professionals: care.filter(item => item.organizationClientId === client.id)
        .map(({ organizationClientId: _, ...item }) => item),
      sharing: consents.filter(item => item.organizationClientId === client.id)
        .map(item => ({ category: item.category, grantedAt: item.grantedAt, revokedAt: item.revokedAt })),
    })),
    training: { sessions, sets },
    nutrition,
    bodyMeasurements: measurements,
    dailySummaries: summaries,
    checkins,
    notesFromProfessionals: notes.map(({ organizationId, ...note }) => ({ ...note, organization: organizationNames.get(organizationId) ?? null })),
    assignedPlans: { workouts, mealPlans },
    messages: conversation,
    subscription: subscription[0] ?? null,
    sharedCards: cards,
    planSelection: planSelection[0] ?? null,
    mealPlanSelection: mealPlanSelection[0] ?? null,
  };
}
