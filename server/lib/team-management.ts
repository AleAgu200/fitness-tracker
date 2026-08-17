import { randomBytes } from "crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  auditEvents,
  careAssignments,
  organizationClients,
  organizationMemberships,
  professionalCapabilities,
  sharingConsents,
  syncChanges,
  user,
} from "@/db/schema";
import { canManageOrganization, getOrganizationMembership, type Discipline, type OrganizationRole, type SharingCategory } from "@/lib/permissions";

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

export async function listOrganizationMembers(actorUserId: string, organizationId: string) {
  if (!(await canManageOrganization(actorUserId, organizationId))) return null;
  const members = await db.select({
    id: organizationMemberships.id,
    userId: organizationMemberships.userId,
    name: user.name,
    email: user.email,
    orgRole: organizationMemberships.orgRole,
    status: organizationMemberships.status,
    activatedAt: organizationMemberships.activatedAt,
    revokedAt: organizationMemberships.revokedAt,
  }).from(organizationMemberships)
    .innerJoin(user, eq(user.id, organizationMemberships.userId))
    .where(eq(organizationMemberships.organizationId, organizationId));
  const capabilities = await db.select().from(professionalCapabilities);
  return members.map(member => ({
    ...member,
    disciplines: capabilities.filter(capability => capability.membershipId === member.id).map(capability => capability.discipline),
  }));
}

export async function addOrganizationMember(input: {
  actorUserId: string;
  organizationId: string;
  email: string;
  orgRole: Exclude<OrganizationRole, "owner">;
  disciplines: Discipline[];
}) {
  const actor = await canManageOrganization(input.actorUserId, input.organizationId);
  if (!actor) return { ok: false as const, error: "organization_manage_denied" as const };
  const [target] = await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.email, input.email));
  if (!target) return { ok: false as const, error: "professional_must_register_first" as const };
  const [existing] = await db.select().from(organizationMemberships).where(and(
    eq(organizationMemberships.organizationId, input.organizationId),
    eq(organizationMemberships.userId, target.id),
  ));
  const now = Date.now();
  const membershipId = existing?.id ?? newId("membership");
  await db.transaction(async (tx) => {
    if (existing) {
      await tx.update(organizationMemberships).set({
        orgRole: input.orgRole,
        status: "active",
        activatedAt: now,
        revokedAt: null,
      }).where(eq(organizationMemberships.id, membershipId));
    } else {
      await tx.insert(organizationMemberships).values({
        id: membershipId,
        organizationId: input.organizationId,
        userId: target.id,
        orgRole: input.orgRole,
        status: "active",
        invitedByMembershipId: actor.id,
        invitedAt: now,
        activatedAt: now,
      });
    }
    for (const discipline of input.disciplines) {
      await tx.insert(professionalCapabilities).values({ membershipId, discipline, createdAt: now }).onConflictDoNothing();
    }
    await tx.insert(auditEvents).values({
      id: newId("audit"),
      organizationId: input.organizationId,
      actorMembershipId: actor.id,
      actorUserId: input.actorUserId,
      action: existing ? "organization_member.reactivated" : "organization_member.invited",
      subjectType: "organization_membership",
      subjectId: membershipId,
      metadata: { targetUserId: target.id, orgRole: input.orgRole, disciplines: input.disciplines },
      occurredAt: now,
    });
  });
  return { ok: true as const, member: { id: membershipId, userId: target.id, name: target.name, email: target.email, orgRole: input.orgRole, disciplines: input.disciplines } };
}

export async function assignProfessional(input: {
  actorUserId: string;
  organizationId: string;
  athleteId: string;
  professionalMembershipId: string;
  discipline: Discipline;
  primary: boolean;
}) {
  const actor = await canManageOrganization(input.actorUserId, input.organizationId);
  if (!actor) return { ok: false as const, error: "organization_manage_denied" as const };
  const [professional, client, capability] = await Promise.all([
    db.select().from(organizationMemberships).where(and(
      eq(organizationMemberships.id, input.professionalMembershipId),
      eq(organizationMemberships.organizationId, input.organizationId),
      eq(organizationMemberships.status, "active"),
    )).then(rows => rows[0]),
    db.select().from(organizationClients).where(and(
      eq(organizationClients.organizationId, input.organizationId),
      eq(organizationClients.athleteId, input.athleteId),
      eq(organizationClients.status, "active"),
    )).then(rows => rows[0]),
    db.select().from(professionalCapabilities).where(and(
      eq(professionalCapabilities.membershipId, input.professionalMembershipId),
      eq(professionalCapabilities.discipline, input.discipline),
    )).then(rows => rows[0]),
  ]);
  if (!professional || !capability) return { ok: false as const, error: "professional_capability_missing" as const };
  if (!client) return { ok: false as const, error: "organization_client_not_active" as const };
  const [existing] = await db.select().from(careAssignments).where(and(
    eq(careAssignments.organizationClientId, client.id),
    eq(careAssignments.professionalMembershipId, input.professionalMembershipId),
    eq(careAssignments.discipline, input.discipline),
  ));
  const now = Date.now();
  const assignmentId = existing?.id ?? newId("assignment");
  await db.transaction(async (tx) => {
    if (input.primary) {
      await tx.update(careAssignments).set({ primary: false }).where(and(
        eq(careAssignments.organizationClientId, client.id),
        eq(careAssignments.discipline, input.discipline),
        eq(careAssignments.status, "active"),
      ));
    }
    if (existing) {
      await tx.update(careAssignments).set({ status: "active", primary: input.primary, revokedAt: null }).where(eq(careAssignments.id, assignmentId));
    } else {
      await tx.insert(careAssignments).values({
        id: assignmentId,
        organizationClientId: client.id,
        professionalMembershipId: input.professionalMembershipId,
        discipline: input.discipline,
        primary: input.primary,
        status: "active",
        createdAt: now,
      });
    }
    await tx.insert(syncChanges).values({
      id: newId("change"),
      athleteId: input.athleteId,
      entityType: "care_assignment",
      entityId: assignmentId,
      operation: existing ? "update" : "create",
      payload: { organizationId: input.organizationId, discipline: input.discipline, primary: input.primary },
      createdAt: now,
    });
    await tx.insert(auditEvents).values({
      id: newId("audit"),
      organizationId: input.organizationId,
      actorMembershipId: actor.id,
      actorUserId: input.actorUserId,
      action: existing ? "care_assignment.updated" : "care_assignment.created",
      subjectType: "athlete",
      subjectId: input.athleteId,
      metadata: { assignmentId, professionalMembershipId: input.professionalMembershipId, discipline: input.discipline, primary: input.primary },
      occurredAt: now,
    });
  });
  return { ok: true as const, assignment: { id: assignmentId, discipline: input.discipline, primary: input.primary, status: "active" as const } };
}

export async function setAthleteSharingConsent(input: {
  athleteUserId: string;
  organizationId: string;
  category: SharingCategory;
  granted: boolean;
}) {
  const [client] = await db.select().from(organizationClients).where(and(
    eq(organizationClients.organizationId, input.organizationId),
    eq(organizationClients.athleteId, input.athleteUserId),
    eq(organizationClients.status, "active"),
  ));
  if (!client) return null;
  const [existing] = await db.select().from(sharingConsents).where(and(
    eq(sharingConsents.organizationClientId, client.id),
    eq(sharingConsents.category, input.category),
  ));
  const now = Date.now();
  await db.transaction(async (tx) => {
    if (existing) {
      await tx.update(sharingConsents).set({
        grantedAt: input.granted ? now : existing.grantedAt,
        revokedAt: input.granted ? null : now,
        updatedAt: now,
      }).where(eq(sharingConsents.id, existing.id));
    } else {
      await tx.insert(sharingConsents).values({
        id: newId("consent"),
        organizationClientId: client.id,
        category: input.category,
        grantedAt: now,
        revokedAt: input.granted ? null : now,
        updatedAt: now,
      });
    }
    await tx.insert(syncChanges).values({
      id: newId("change"),
      athleteId: input.athleteUserId,
      entityType: "sharing_consent",
      entityId: `${client.id}:${input.category}`,
      operation: "update",
      payload: { organizationId: input.organizationId, category: input.category, granted: input.granted, updatedAt: now },
      createdAt: now,
    });
    await tx.insert(auditEvents).values({
      id: newId("audit"),
      organizationId: input.organizationId,
      actorUserId: input.athleteUserId,
      action: input.granted ? "sharing_consent.granted" : "sharing_consent.revoked",
      subjectType: "athlete",
      subjectId: input.athleteUserId,
      metadata: { category: input.category },
      occurredAt: now,
    });
  });
  return { category: input.category, status: input.granted ? "granted" as const : "revoked" as const, updatedAt: now };
}
