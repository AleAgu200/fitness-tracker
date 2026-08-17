import { randomBytes } from "crypto";

import { and, desc, eq, inArray, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  assignedMealPlans,
  assignedWorkouts,
  attentionSignals,
  careAssignments,
  checkinRequests,
  messages,
  organizationClients,
  organizationMemberships,
  sharingConsents,
  syncDevices,
  user,
} from "@/db/schema";

function newId(): string {
  return `signal_${randomBytes(12).toString("hex")}`;
}

async function openSignal(input: {
  organizationId: string;
  ownerAssignmentId: string;
  athleteId: string;
  checkinRequestId?: string;
  reasonCode: string;
  dedupeKey: string;
  evidence: unknown;
  severity: "info" | "attention" | "urgent";
  suggestedAction: string;
  openedAt?: number;
}) {
  await db.insert(attentionSignals).values({
    id: newId(),
    organizationId: input.organizationId,
    ownerAssignmentId: input.ownerAssignmentId,
    checkinRequestId: input.checkinRequestId,
    athleteId: input.athleteId,
    reasonCode: input.reasonCode,
    dedupeKey: input.dedupeKey,
    evidence: input.evidence,
    severity: input.severity,
    status: "open",
    suggestedAction: input.suggestedAction,
    openedAt: input.openedAt ?? Date.now(),
  }).onConflictDoNothing();
}

/** Materialize only explainable rules backed by server data available in this cut. */
export async function refreshAttentionSignals(professionalUserId: string) {
  const assignments = await db.select({
    ownerAssignmentId: careAssignments.id,
    discipline: careAssignments.discipline,
    organizationId: organizationClients.organizationId,
    athleteId: organizationClients.athleteId,
  }).from(organizationMemberships)
    .innerJoin(careAssignments, eq(careAssignments.professionalMembershipId, organizationMemberships.id))
    .innerJoin(organizationClients, eq(organizationClients.id, careAssignments.organizationClientId))
    .where(and(
      eq(organizationMemberships.userId, professionalUserId),
      eq(organizationMemberships.status, "active"),
      eq(careAssignments.status, "active"),
      eq(organizationClients.status, "active"),
    ));

  const now = Date.now();
  const soon = now + 7 * 24 * 60 * 60 * 1000;
  for (const assignment of assignments) {
    const [overdueCheckins, workoutPlans, mealPlans, device, conversation] = await Promise.all([
      db.select({ id: checkinRequests.id, dueAt: checkinRequests.dueAt })
        .from(checkinRequests)
        .where(and(
          eq(checkinRequests.careAssignmentId, assignment.ownerAssignmentId),
          eq(checkinRequests.status, "pending"),
          lte(checkinRequests.dueAt, now),
        )),
      assignment.discipline === "coach"
        ? db.select({ id: assignedWorkouts.id, endsAt: assignedWorkouts.endsAt, version: assignedWorkouts.version })
            .from(assignedWorkouts)
            .where(and(
              eq(assignedWorkouts.careAssignmentId, assignment.ownerAssignmentId),
              eq(assignedWorkouts.status, "active"),
              lte(assignedWorkouts.endsAt, soon),
            ))
        : Promise.resolve([]),
      assignment.discipline === "nutritionist"
        ? db.select({ id: assignedMealPlans.id, endsAt: assignedMealPlans.endsAt, version: assignedMealPlans.version })
            .from(assignedMealPlans)
            .where(and(
              eq(assignedMealPlans.careAssignmentId, assignment.ownerAssignmentId),
              eq(assignedMealPlans.status, "active"),
              lte(assignedMealPlans.endsAt, soon),
            ))
        : Promise.resolve([]),
      db.select({ id: syncDevices.id, lastSeenAt: syncDevices.lastSeenAt })
        .from(syncDevices)
        .where(and(eq(syncDevices.athleteId, assignment.athleteId), eq(syncDevices.status, "active_writer")))
        .limit(1),
      db.select({ senderId: messages.senderId, receiverId: messages.receiverId, sentAt: messages.sentAt })
        .from(messages)
        .where(or(
          and(eq(messages.senderId, professionalUserId), eq(messages.receiverId, assignment.athleteId)),
          and(eq(messages.senderId, assignment.athleteId), eq(messages.receiverId, professionalUserId)),
        ))
        .orderBy(desc(messages.sentAt))
        .limit(1),
    ]);

    for (const request of overdueCheckins) {
      await openSignal({
        ...assignment,
        checkinRequestId: request.id,
        reasonCode: "checkin_overdue",
        dedupeKey: `checkin_overdue:${request.id}`,
        evidence: { dueAt: request.dueAt, overdueMs: now - request.dueAt },
        severity: now - request.dueAt > 48 * 60 * 60 * 1000 ? "urgent" : "attention",
        suggestedAction: "send_checkin_reminder",
      });
    }
    for (const plan of [...workoutPlans, ...mealPlans]) {
      if (plan.endsAt == null) continue;
      await openSignal({
        ...assignment,
        reasonCode: "plan_ending",
        dedupeKey: `plan_ending:${plan.id}`,
        evidence: { planId: plan.id, version: plan.version, endsAt: plan.endsAt, daysRemaining: Math.max(0, Math.ceil((plan.endsAt - now) / 86_400_000)) },
        severity: plan.endsAt <= now + 3 * 86_400_000 ? "attention" : "info",
        suggestedAction: "prepare_next_plan",
      });
    }
    const writer = device[0];
    if (!writer || now - writer.lastSeenAt > 24 * 60 * 60 * 1000) {
      const window = Math.floor(now / (24 * 60 * 60 * 1000));
      await openSignal({
        ...assignment,
        reasonCode: writer ? "sync_stale" : "sync_missing",
        dedupeKey: `sync:${window}`,
        evidence: writer ? { lastSeenAt: writer.lastSeenAt } : { lastSeenAt: null },
        severity: "info",
        suggestedAction: "check_sync_status",
      });
    }
    const last = conversation[0];
    if (last?.senderId === assignment.athleteId && now - last.sentAt > 12 * 60 * 60 * 1000) {
      await openSignal({
        ...assignment,
        reasonCode: "message_unanswered",
        dedupeKey: `message_unanswered:${last.sentAt}`,
        evidence: { messageAt: last.sentAt, waitingMs: now - last.sentAt },
        severity: "attention",
        suggestedAction: "reply_message",
        openedAt: last.sentAt,
      });
    }
  }
}

export async function listAttentionSignals(professionalUserId: string, options: { limit?: number; offset?: number; status?: string[] } = {}) {
  await refreshAttentionSignals(professionalUserId);
  const statuses = options.status?.length ? options.status : ["open", "acknowledged"];
  const rows = await db.select({
    id: attentionSignals.id,
    organizationId: attentionSignals.organizationId,
    ownerAssignmentId: attentionSignals.ownerAssignmentId,
    organizationClientId: careAssignments.organizationClientId,
    athleteId: attentionSignals.athleteId,
    athleteName: user.name,
    athleteEmail: user.email,
    discipline: careAssignments.discipline,
    reasonCode: attentionSignals.reasonCode,
    evidence: attentionSignals.evidence,
    severity: attentionSignals.severity,
    status: attentionSignals.status,
    suggestedAction: attentionSignals.suggestedAction,
    openedAt: attentionSignals.openedAt,
  }).from(attentionSignals)
    .innerJoin(careAssignments, eq(careAssignments.id, attentionSignals.ownerAssignmentId))
    .innerJoin(organizationMemberships, eq(organizationMemberships.id, careAssignments.professionalMembershipId))
    .innerJoin(user, eq(user.id, attentionSignals.athleteId))
    .where(and(
      eq(organizationMemberships.userId, professionalUserId),
      eq(organizationMemberships.status, "active"),
      eq(careAssignments.status, "active"),
      inArray(attentionSignals.status, statuses),
    ))
    .orderBy(sql`case ${attentionSignals.severity} when 'urgent' then 0 when 'attention' then 1 else 2 end`, desc(attentionSignals.openedAt))
    .limit(Math.min(100, Math.max(1, options.limit ?? 50)))
    .offset(Math.max(0, options.offset ?? 0));

  const clientIds = [...new Set(rows.map(row => row.organizationClientId))];
  const consents = clientIds.length
    ? await db.select().from(sharingConsents).where(inArray(sharingConsents.organizationClientId, clientIds))
    : [];
  return rows.map(row => {
    const category = row.reasonCode.startsWith("checkin_")
      ? "checkins"
      : row.reasonCode === "plan_ending"
        ? (row.discipline === "coach" ? "training" : "nutrition")
        : null;
    const consent = category
      ? consents.find(item => item.organizationClientId === row.organizationClientId && item.category === category)
      : null;
    const evidenceAccess = !category ? "granted" : !consent ? "not_authorized" : consent.revokedAt == null ? "granted" : "revoked";
    return {
      ...row,
      evidence: evidenceAccess === "granted" ? row.evidence : { access: evidenceAccess },
      dataFreshness: { generatedAt: Date.now() },
      permissions: { canOpenRecord: true, evidence: evidenceAccess },
    };
  });
}

export async function updateAttentionSignal(input: {
  professionalUserId: string;
  signalId: string;
  status: "acknowledged" | "resolved" | "dismissed";
  note?: string;
}) {
  const [signal] = await db.select({
    id: attentionSignals.id,
    membershipUserId: organizationMemberships.userId,
  }).from(attentionSignals)
    .innerJoin(careAssignments, eq(careAssignments.id, attentionSignals.ownerAssignmentId))
    .innerJoin(organizationMemberships, eq(organizationMemberships.id, careAssignments.professionalMembershipId))
    .where(eq(attentionSignals.id, input.signalId));
  if (!signal || signal.membershipUserId !== input.professionalUserId) return false;
  if ((input.status === "resolved" || input.status === "dismissed") && !input.note?.trim()) return false;
  const now = Date.now();
  await db.update(attentionSignals).set({
    status: input.status,
    acknowledgedAt: input.status === "acknowledged" ? now : undefined,
    resolvedAt: input.status === "resolved" || input.status === "dismissed" ? now : undefined,
    resolutionNote: input.note?.trim(),
  }).where(eq(attentionSignals.id, input.signalId));
  return true;
}
