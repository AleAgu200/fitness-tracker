import { randomBytes } from "crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  auditEvents,
  careAssignments,
  organizationClients,
  organizationMemberships,
  organizations,
  professionalCapabilities,
  sharingConsents,
  syncChanges,
} from "@/db/schema";
import type { LinkKind } from "@/lib/supervision";

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

export function legacyOrganizationId(professionalId: string): string {
  return `org_${professionalId}`;
}

export function legacyMembershipId(professionalId: string): string {
  return `mem_${professionalId}`;
}

/** Ensure the additive organization projection exists for a legacy professional. */
export async function ensureProfessionalOrganization(input: {
  professionalId: string;
  professionalName: string;
  discipline: LinkKind;
}) {
  const now = Date.now();
  const organizationId = legacyOrganizationId(input.professionalId);
  const membershipId = legacyMembershipId(input.professionalId);

  await db.transaction(async (tx) => {
    await tx.insert(organizations).values({
      id: organizationId,
      name: `${input.professionalName} · PULSO`,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();

    await tx.insert(organizationMemberships).values({
      id: membershipId,
      organizationId,
      userId: input.professionalId,
      orgRole: "owner",
      status: "active",
      invitedAt: now,
      activatedAt: now,
    }).onConflictDoNothing();

    await tx.insert(professionalCapabilities).values({
      membershipId,
      discipline: input.discipline,
      createdAt: now,
    }).onConflictDoNothing();
  });

  return { organizationId, membershipId };
}

/** Dual-write an accepted legacy invite into organization/client/care tables. */
export async function projectAcceptedLink(input: {
  linkId: string;
  professionalId: string;
  professionalName: string;
  athleteId: string;
  discipline: LinkKind;
  acceptedAt: number;
}) {
  const { organizationId, membershipId } = await ensureProfessionalOrganization(input);
  const preferredClientId = `oc_${input.linkId}`;
  const assignmentId = `ca_${input.linkId}`;
  const domainCategory = input.discipline === "coach" ? "training" : "nutrition";

  return db.transaction(async (tx) => {
    await tx.insert(organizationClients).values({
      id: preferredClientId,
      organizationId,
      athleteId: input.athleteId,
      status: "active",
      createdAt: input.acceptedAt,
      activatedAt: input.acceptedAt,
    }).onConflictDoNothing();

    const [client] = await tx.select({ id: organizationClients.id })
      .from(organizationClients)
      .where(and(
        eq(organizationClients.organizationId, organizationId),
        eq(organizationClients.athleteId, input.athleteId),
      ));
    if (!client) throw new Error("organization_client_projection_failed");

    await tx.insert(careAssignments).values({
      id: assignmentId,
      organizationClientId: client.id,
      professionalMembershipId: membershipId,
      discipline: input.discipline,
      primary: true,
      status: "active",
      createdAt: input.acceptedAt,
    }).onConflictDoNothing();

    for (const category of [domainCategory, "checkins"] as const) {
      await tx.insert(sharingConsents).values({
        id: `consent_${assignmentId}_${category}`,
        organizationClientId: client.id,
        category,
        grantedAt: input.acceptedAt,
        updatedAt: input.acceptedAt,
      }).onConflictDoNothing();
    }

    const changeId = newId("change");
    await tx.insert(syncChanges).values({
      id: changeId,
      athleteId: input.athleteId,
      entityType: "sharing_permissions",
      entityId: client.id,
      operation: "create",
      payload: { organizationId, categories: [domainCategory, "checkins"] },
      createdAt: input.acceptedAt,
    });
    await tx.insert(auditEvents).values({
      id: newId("audit"),
      organizationId,
      actorMembershipId: membershipId,
      actorUserId: input.professionalId,
      action: "care_assignment.created_from_legacy_link",
      subjectType: "athlete",
      subjectId: input.athleteId,
      metadata: { linkId: input.linkId, discipline: input.discipline },
      occurredAt: input.acceptedAt,
    });

    return { organizationId, membershipId, organizationClientId: client.id, careAssignmentId: assignmentId };
  });
}

export async function appendAuditEvent(input: {
  organizationId: string;
  actorMembershipId?: string | null;
  actorUserId?: string | null;
  action: string;
  subjectType: string;
  subjectId: string;
  metadata?: unknown;
}) {
  await db.insert(auditEvents).values({
    id: newId("audit"),
    organizationId: input.organizationId,
    actorMembershipId: input.actorMembershipId,
    actorUserId: input.actorUserId,
    action: input.action,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    metadata: input.metadata,
    occurredAt: Date.now(),
  });
}

export async function enqueueSyncChange(input: {
  athleteId: string;
  entityType: string;
  entityId: string;
  operation: "create" | "update" | "delete";
  payload?: unknown;
}) {
  const [change] = await db.insert(syncChanges).values({
    id: newId("change"),
    athleteId: input.athleteId,
    entityType: input.entityType,
    entityId: input.entityId,
    operation: input.operation,
    payload: input.payload,
    createdAt: Date.now(),
  }).returning({ serverSequence: syncChanges.serverSequence });
  return change.serverSequence;
}
