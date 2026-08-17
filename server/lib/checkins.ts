import { randomBytes } from "crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  attentionSignals,
  auditEvents,
  careAssignments,
  checkinRequests,
  checkinReviews,
  checkinTemplateVersions,
  followUpTasks,
  messages,
  organizationClients,
  organizationMemberships,
  professionalNotes,
  syncChanges,
} from "@/db/schema";
import { disciplineAllowsCategory, getProfessionalAccess, type Discipline } from "@/lib/permissions";

export const FIXED_WEEKLY_CHECKIN = [
  { id: "energy", label: "Energía", type: "scale", min: 1, max: 10, required: true },
  { id: "sleep", label: "Sueño", type: "scale", min: 1, max: 10, required: true },
  { id: "pain", label: "Dolor", type: "scale", min: 0, max: 10, required: true },
  { id: "stress", label: "Estrés", type: "scale", min: 1, max: 10, required: true },
  { id: "motivation", label: "Motivación", type: "scale", min: 1, max: 10, required: true },
  { id: "obstacles", label: "Obstáculos", type: "text", required: false },
  { id: "note", label: "Nota libre", type: "text", required: false },
] as const;

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

export async function createCheckinRequest(input: {
  professionalUserId: string;
  athleteId: string;
  dueAt: number;
  discipline?: Discipline;
}) {
  const contexts = await getProfessionalAccess(input.professionalUserId, input.athleteId);
  const access = contexts.find(context =>
    (!input.discipline || context.discipline === input.discipline)
    && disciplineAllowsCategory(context.discipline, "checkins")
    && context.consents.checkins === "granted",
  );
  if (!access) return null;
  const now = Date.now();
  const templateId = `fixed_weekly_${access.organizationId}_${access.discipline}_v1`;
  const requestId = newId("checkin");
  await db.transaction(async (tx) => {
    await tx.insert(checkinTemplateVersions).values({
      id: templateId,
      organizationId: access.organizationId,
      discipline: access.discipline,
      schemaVersion: 1,
      questions: FIXED_WEEKLY_CHECKIN,
      createdByMembershipId: access.membershipId,
      createdAt: now,
    }).onConflictDoNothing();
    await tx.insert(checkinRequests).values({
      id: requestId,
      careAssignmentId: access.assignmentId,
      athleteId: input.athleteId,
      templateVersionId: templateId,
      dueAt: input.dueAt,
      status: "pending",
      createdAt: now,
    });
    await tx.insert(syncChanges).values({
      id: newId("change"),
      athleteId: input.athleteId,
      entityType: "checkin_request",
      entityId: requestId,
      operation: "create",
      payload: { id: requestId, dueAt: input.dueAt, schemaVersion: 1, questions: FIXED_WEEKLY_CHECKIN },
      createdAt: now,
    });
    await tx.insert(auditEvents).values({
      id: newId("audit"),
      organizationId: access.organizationId,
      actorMembershipId: access.membershipId,
      actorUserId: input.professionalUserId,
      action: "checkin.requested",
      subjectType: "checkin_request",
      subjectId: requestId,
      metadata: { athleteId: input.athleteId, dueAt: input.dueAt },
      occurredAt: now,
    });
  });
  return { id: requestId, dueAt: input.dueAt, status: "pending" as const, schemaVersion: 1, questions: FIXED_WEEKLY_CHECKIN };
}

export async function reviewCheckin(input: {
  professionalUserId: string;
  requestId: string;
  action: "message" | "task" | "plan_adjustment" | "no_changes";
  note?: string;
  message?: string;
  taskTitle?: string;
  taskDueAt?: number;
}) {
  const [request] = await db.select({
    id: checkinRequests.id,
    status: checkinRequests.status,
    athleteId: checkinRequests.athleteId,
    discipline: careAssignments.discipline,
    organizationId: organizationClients.organizationId,
  }).from(checkinRequests)
    .innerJoin(careAssignments, eq(careAssignments.id, checkinRequests.careAssignmentId))
    .innerJoin(organizationClients, eq(organizationClients.id, careAssignments.organizationClientId))
    .where(eq(checkinRequests.id, input.requestId));
  if (!request || request.status !== "submitted") return null;
  const access = (await getProfessionalAccess(input.professionalUserId, request.athleteId)).find(context =>
    context.organizationId === request.organizationId
    && context.discipline === request.discipline
    && context.consents.checkins === "granted",
  );
  if (!access) return null;
  if (input.action === "message" && !input.message?.trim()) return null;
  if (input.action === "task" && !input.taskTitle?.trim()) return null;
  const now = Date.now();
  const reviewId = newId("review");
  await db.transaction(async (tx) => {
    await tx.insert(checkinReviews).values({
      id: reviewId,
      requestId: input.requestId,
      reviewerMembershipId: access.membershipId,
      action: input.action,
      note: input.note?.trim(),
      createdAt: now,
    });
    await tx.update(checkinRequests).set({ status: "reviewed", reviewedAt: now }).where(eq(checkinRequests.id, input.requestId));
    await tx.update(attentionSignals).set({
      status: "resolved",
      resolvedAt: now,
      resolutionNote: input.note?.trim() || `Revisión: ${input.action}`,
    }).where(and(
      eq(attentionSignals.checkinRequestId, input.requestId),
      eq(attentionSignals.status, "open"),
    ));
    if (input.action === "message") {
      await tx.insert(messages).values({
        id: newId("message"),
        senderId: input.professionalUserId,
        receiverId: request.athleteId,
        content: input.message!.trim(),
        sentAt: now,
      });
    }
    if (input.action === "task") {
      await tx.insert(followUpTasks).values({
        id: newId("task"),
        organizationId: access.organizationId,
        athleteId: request.athleteId,
        assigneeMembershipId: access.membershipId,
        createdByMembershipId: access.membershipId,
        title: input.taskTitle!.trim(),
        detail: input.note?.trim(),
        dueAt: input.taskDueAt,
        status: "open",
        createdAt: now,
      });
    }
    if (input.note?.trim()) {
      await tx.insert(professionalNotes).values({
        id: newId("note"),
        organizationId: access.organizationId,
        athleteId: request.athleteId,
        authorMembershipId: access.membershipId,
        visibility: "care_team",
        body: input.note.trim(),
        createdAt: now,
      });
    }
    await tx.insert(auditEvents).values({
      id: newId("audit"),
      organizationId: access.organizationId,
      actorMembershipId: access.membershipId,
      actorUserId: input.professionalUserId,
      action: "checkin.reviewed",
      subjectType: "athlete",
      subjectId: request.athleteId,
      metadata: { action: input.action, athleteId: request.athleteId, requestId: input.requestId },
      occurredAt: now,
    });
  });
  return { id: reviewId, reviewedAt: now, action: input.action };
}
