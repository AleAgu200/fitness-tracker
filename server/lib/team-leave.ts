import { randomBytes } from "crypto";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  auditEvents,
  careAssignments,
  checkinRequests,
  organizationClients,
  organizationMemberships,
  sharingConsents,
  supervisionLinks,
  syncChanges,
} from "@/db/schema";

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

export type LeaveResult = { ok: true } | { ok: false; error: "not_linked" };

/**
 * The athlete ends their relationship with one professional. Every active assignment
 * with them is revoked and their pending check-ins are cancelled. An organization left
 * with no active assignment for the athlete loses the client link and every sharing
 * consent. The legacy link goes too, so they can no longer message each other. Coming
 * back takes a new invite code. Each change is queued for the athlete's devices.
 */
export async function leaveProfessional(athleteId: string, professionalId: string): Promise<LeaveResult> {
  return db.transaction(async (tx) => {
    const assignments = await tx.select({
      id: careAssignments.id,
      discipline: careAssignments.discipline,
      organizationClientId: careAssignments.organizationClientId,
      organizationId: organizationClients.organizationId,
    })
      .from(careAssignments)
      .innerJoin(organizationClients, eq(organizationClients.id, careAssignments.organizationClientId))
      .innerJoin(organizationMemberships, eq(organizationMemberships.id, careAssignments.professionalMembershipId))
      .where(and(
        eq(organizationClients.athleteId, athleteId),
        eq(organizationMemberships.userId, professionalId),
        eq(careAssignments.status, "active"),
      ));

    const legacy = await tx.update(supervisionLinks)
      .set({ status: "revoked" })
      .where(and(
        eq(supervisionLinks.athleteId, athleteId),
        eq(supervisionLinks.professionalId, professionalId),
        eq(supervisionLinks.status, "active"),
      ))
      .returning({ id: supervisionLinks.id });

    if (!assignments.length && !legacy.length) return { ok: false as const, error: "not_linked" as const };

    const now = Date.now();
    const change = (entityType: string, entityId: string, operation: "update" | "delete", payload: unknown) =>
      tx.insert(syncChanges).values({ id: newId("change"), athleteId, entityType, entityId, operation, payload, createdAt: now });

    if (assignments.length) {
      const assignmentIds = assignments.map(assignment => assignment.id);
      await tx.update(careAssignments)
        .set({ status: "revoked", primary: false, revokedAt: now })
        .where(inArray(careAssignments.id, assignmentIds));
      for (const assignment of assignments) {
        await change("care_assignment", assignment.id, "delete", {
          organizationId: assignment.organizationId, discipline: assignment.discipline, primary: false,
        });
      }

      const cancelled = await tx.update(checkinRequests)
        .set({ status: "cancelled" })
        .where(and(inArray(checkinRequests.careAssignmentId, assignmentIds), eq(checkinRequests.status, "pending")))
        .returning({ id: checkinRequests.id });
      for (const request of cancelled) await change("checkin_request", request.id, "delete", {});
    }

    for (const organizationClientId of new Set(assignments.map(assignment => assignment.organizationClientId))) {
      const organizationId = assignments.find(assignment => assignment.organizationClientId === organizationClientId)!.organizationId;
      const [stillCovered] = await tx.select({ id: careAssignments.id }).from(careAssignments)
        .where(and(eq(careAssignments.organizationClientId, organizationClientId), eq(careAssignments.status, "active")))
        .limit(1);

      if (!stillCovered) {
        await tx.update(organizationClients)
          .set({ status: "revoked", revokedAt: now })
          .where(eq(organizationClients.id, organizationClientId));
        const revoked = await tx.update(sharingConsents)
          .set({ revokedAt: now, updatedAt: now })
          .where(and(eq(sharingConsents.organizationClientId, organizationClientId), isNull(sharingConsents.revokedAt)))
          .returning({ category: sharingConsents.category });
        for (const { category } of revoked) {
          await change("sharing_consent", `${organizationClientId}:${category}`, "update", {
            organizationId, category, granted: false, updatedAt: now,
          });
        }
        // Devices drop the organization's sharing switches; a new invite brings them back.
        await change("organization_client", organizationClientId, "delete", { organizationId });
      }

      await tx.insert(auditEvents).values({
        id: newId("audit"),
        organizationId,
        actorUserId: athleteId,
        action: "care_assignment.left_by_athlete",
        subjectType: "athlete",
        subjectId: athleteId,
        metadata: {
          assignmentIds: assignments.filter(a => a.organizationClientId === organizationClientId).map(a => a.id),
          clientRevoked: !stillCovered,
        },
        occurredAt: now,
      });
    }

    return { ok: true as const };
  });
}
