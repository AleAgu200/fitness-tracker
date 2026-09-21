import { randomBytes } from "crypto";

import { and, countDistinct, eq, inArray } from "drizzle-orm";

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
  if (!members.length) return [];

  const membershipIds = members.map(member => member.id);
  const [capabilities, loads] = await Promise.all([
    db.select().from(professionalCapabilities).where(inArray(professionalCapabilities.membershipId, membershipIds)),
    // Athlete load per professional, so an owner can see who is over-committed
    // before assigning another client or revoking someone.
    db.select({
      membershipId: careAssignments.professionalMembershipId,
      discipline: careAssignments.discipline,
      athletes: countDistinct(careAssignments.organizationClientId),
    })
      .from(careAssignments)
      .where(and(
        inArray(careAssignments.professionalMembershipId, membershipIds),
        eq(careAssignments.status, "active"),
      ))
      .groupBy(careAssignments.professionalMembershipId, careAssignments.discipline),
  ]);

  return members.map(member => ({
    ...member,
    disciplines: capabilities.filter(capability => capability.membershipId === member.id).map(capability => capability.discipline),
    load: loads
      .filter(row => row.membershipId === member.id)
      .map(row => ({ discipline: row.discipline as Discipline, athletes: Number(row.athletes) })),
  }));
}

/**
 * Athletes in the organization whose coverage has a gap, so revoking or
 * transferring a professional never silently leaves someone unattended.
 */
export async function listCoverageGaps(organizationId: string) {
  const clients = await db.select({
    organizationClientId: organizationClients.id,
    athleteId: organizationClients.athleteId,
    athleteName: user.name,
  })
    .from(organizationClients)
    .innerJoin(user, eq(user.id, organizationClients.athleteId))
    .where(and(eq(organizationClients.organizationId, organizationId), eq(organizationClients.status, "active")));
  if (!clients.length) return [];

  const assignments = await db.select({
    organizationClientId: careAssignments.organizationClientId,
    discipline: careAssignments.discipline,
    primary: careAssignments.primary,
  })
    .from(careAssignments)
    .where(and(
      inArray(careAssignments.organizationClientId, clients.map(client => client.organizationClientId)),
      eq(careAssignments.status, "active"),
    ));

  return clients.flatMap((client) => {
    const own = assignments.filter(row => row.organizationClientId === client.organizationClientId);
    return (["coach", "nutritionist"] as Discipline[]).flatMap((discipline) => {
      const forDiscipline = own.filter(row => row.discipline === discipline);
      // No assignment at all is a deliberate choice (not every athlete has a
      // nutritionist); assignments without a primary is the real gap.
      if (!forDiscipline.length) return [];
      if (forDiscipline.some(row => row.primary)) return [];
      return [{ ...client, discipline, reason: "no_primary" as const }];
    });
  });
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

/** Every active athlete in the organization with who currently covers them. */
export async function listOrganizationRoster(organizationId: string) {
  const clients = await db.select({
    organizationClientId: organizationClients.id,
    athleteId: organizationClients.athleteId,
    athleteName: user.name,
    athleteEmail: user.email,
  })
    .from(organizationClients)
    .innerJoin(user, eq(user.id, organizationClients.athleteId))
    .where(and(eq(organizationClients.organizationId, organizationId), eq(organizationClients.status, "active")));
  if (!clients.length) return [];

  const assignments = await db.select({
    assignmentId: careAssignments.id,
    organizationClientId: careAssignments.organizationClientId,
    membershipId: careAssignments.professionalMembershipId,
    discipline: careAssignments.discipline,
    primary: careAssignments.primary,
    professionalName: user.name,
  })
    .from(careAssignments)
    .innerJoin(organizationMemberships, eq(organizationMemberships.id, careAssignments.professionalMembershipId))
    .innerJoin(user, eq(user.id, organizationMemberships.userId))
    .where(and(
      inArray(careAssignments.organizationClientId, clients.map(client => client.organizationClientId)),
      eq(careAssignments.status, "active"),
    ));

  return clients.map(client => ({
    ...client,
    team: assignments
      .filter(row => row.organizationClientId === client.organizationClientId)
      .map(({ organizationClientId: _ignored, ...row }) => ({ ...row, discipline: row.discipline as Discipline })),
  }));
}

/**
 * Deactivate a member. Uses status + revokedAt rather than deleting: their
 * published plans, notes, reviews and audit trail must keep their author.
 * Their active care assignments are revoked in the same transaction so a
 * deactivated professional cannot keep reading athlete records.
 */
export async function revokeOrganizationMember(input: {
  actorUserId: string;
  organizationId: string;
  membershipId: string;
}) {
  const actor = await canManageOrganization(input.actorUserId, input.organizationId);
  if (!actor) return { ok: false as const, error: "organization_manage_denied" as const };

  const [target] = await db.select().from(organizationMemberships).where(and(
    eq(organizationMemberships.id, input.membershipId),
    eq(organizationMemberships.organizationId, input.organizationId),
  ));
  if (!target || target.status === "revoked") return { ok: false as const, error: "member_not_found" as const };

  if (target.orgRole === "owner") {
    const owners = await db.select({ id: organizationMemberships.id }).from(organizationMemberships).where(and(
      eq(organizationMemberships.organizationId, input.organizationId),
      eq(organizationMemberships.orgRole, "owner"),
      eq(organizationMemberships.status, "active"),
    ));
    // Losing the last owner would leave the organization unadministrable.
    if (owners.length <= 1) return { ok: false as const, error: "last_owner" as const };
  }

  const now = Date.now();
  const released = await db.select({
    assignmentId: careAssignments.id,
    organizationClientId: careAssignments.organizationClientId,
    discipline: careAssignments.discipline,
    primary: careAssignments.primary,
    athleteId: organizationClients.athleteId,
  })
    .from(careAssignments)
    .innerJoin(organizationClients, eq(organizationClients.id, careAssignments.organizationClientId))
    .where(and(
      eq(careAssignments.professionalMembershipId, input.membershipId),
      eq(careAssignments.status, "active"),
    ));

  await db.transaction(async (tx) => {
    await tx.update(organizationMemberships)
      .set({ status: "revoked", revokedAt: now })
      .where(eq(organizationMemberships.id, input.membershipId));
    await tx.update(careAssignments)
      .set({ status: "revoked", primary: false, revokedAt: now })
      .where(and(
        eq(careAssignments.professionalMembershipId, input.membershipId),
        eq(careAssignments.status, "active"),
      ));
    for (const assignment of released) {
      await tx.insert(syncChanges).values({
        id: newId("change"),
        athleteId: assignment.athleteId,
        entityType: "care_assignment",
        entityId: assignment.assignmentId,
        operation: "delete",
        payload: { organizationId: input.organizationId, discipline: assignment.discipline, primary: false },
        createdAt: now,
      });
    }
    await tx.insert(auditEvents).values({
      id: newId("audit"),
      organizationId: input.organizationId,
      actorMembershipId: actor.id,
      actorUserId: input.actorUserId,
      action: "organization_member.revoked",
      subjectType: "organization_membership",
      subjectId: input.membershipId,
      metadata: { releasedAssignments: released.length, targetUserId: target.userId },
      occurredAt: now,
    });
  });

  // Athletes who just lost their primary in a discipline need reassignment.
  const uncovered = released.filter(assignment => assignment.primary)
    .map(assignment => ({ athleteId: assignment.athleteId, discipline: assignment.discipline as Discipline }));
  return { ok: true as const, releasedAssignments: released.length, uncovered };
}

/** Add or remove a member's disciplines. */
export async function setMemberDisciplines(input: {
  actorUserId: string;
  organizationId: string;
  membershipId: string;
  disciplines: Discipline[];
}) {
  const actor = await canManageOrganization(input.actorUserId, input.organizationId);
  if (!actor) return { ok: false as const, error: "organization_manage_denied" as const };

  const [target] = await db.select().from(organizationMemberships).where(and(
    eq(organizationMemberships.id, input.membershipId),
    eq(organizationMemberships.organizationId, input.organizationId),
    eq(organizationMemberships.status, "active"),
  ));
  if (!target) return { ok: false as const, error: "member_not_found" as const };

  const current = await db.select().from(professionalCapabilities)
    .where(eq(professionalCapabilities.membershipId, input.membershipId));
  const removing = current
    .map(capability => capability.discipline as Discipline)
    .filter(discipline => !input.disciplines.includes(discipline));

  if (removing.length) {
    const blocking = await db.select({ id: careAssignments.id }).from(careAssignments).where(and(
      eq(careAssignments.professionalMembershipId, input.membershipId),
      eq(careAssignments.status, "active"),
      inArray(careAssignments.discipline, removing),
    ));
    // Dropping a discipline someone is actively assigned in would leave those
    // athletes with an assignment whose discipline no longer authorizes it.
    if (blocking.length) return { ok: false as const, error: "discipline_has_active_assignments" as const };
  }

  const now = Date.now();
  await db.transaction(async (tx) => {
    if (removing.length) {
      await tx.delete(professionalCapabilities).where(and(
        eq(professionalCapabilities.membershipId, input.membershipId),
        inArray(professionalCapabilities.discipline, removing),
      ));
    }
    for (const discipline of input.disciplines) {
      await tx.insert(professionalCapabilities)
        .values({ membershipId: input.membershipId, discipline, createdAt: now })
        .onConflictDoNothing();
    }
    await tx.insert(auditEvents).values({
      id: newId("audit"),
      organizationId: input.organizationId,
      actorMembershipId: actor.id,
      actorUserId: input.actorUserId,
      action: "organization_member.disciplines_changed",
      subjectType: "organization_membership",
      subjectId: input.membershipId,
      metadata: { disciplines: input.disciplines, removed: removing },
      occurredAt: now,
    });
  });
  return { ok: true as const, disciplines: input.disciplines };
}

/** Remove one professional from one athlete without touching the rest of the team. */
export async function revokeCareAssignment(input: {
  actorUserId: string;
  organizationId: string;
  assignmentId: string;
}) {
  const actor = await canManageOrganization(input.actorUserId, input.organizationId);
  if (!actor) return { ok: false as const, error: "organization_manage_denied" as const };

  const [assignment] = await db.select({
    id: careAssignments.id,
    discipline: careAssignments.discipline,
    primary: careAssignments.primary,
    athleteId: organizationClients.athleteId,
    organizationId: organizationClients.organizationId,
  })
    .from(careAssignments)
    .innerJoin(organizationClients, eq(organizationClients.id, careAssignments.organizationClientId))
    .where(and(eq(careAssignments.id, input.assignmentId), eq(careAssignments.status, "active")));
  if (!assignment || assignment.organizationId !== input.organizationId) {
    return { ok: false as const, error: "assignment_not_found" as const };
  }

  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx.update(careAssignments)
      .set({ status: "revoked", primary: false, revokedAt: now })
      .where(eq(careAssignments.id, input.assignmentId));
    await tx.insert(syncChanges).values({
      id: newId("change"),
      athleteId: assignment.athleteId,
      entityType: "care_assignment",
      entityId: input.assignmentId,
      operation: "delete",
      payload: { organizationId: input.organizationId, discipline: assignment.discipline, primary: false },
      createdAt: now,
    });
    await tx.insert(auditEvents).values({
      id: newId("audit"),
      organizationId: input.organizationId,
      actorMembershipId: actor.id,
      actorUserId: input.actorUserId,
      action: "care_assignment.revoked",
      subjectType: "athlete",
      subjectId: assignment.athleteId,
      metadata: { assignmentId: input.assignmentId, discipline: assignment.discipline, wasPrimary: assignment.primary },
      occurredAt: now,
    });
  });
  return {
    ok: true as const,
    uncovered: assignment.primary
      ? [{ athleteId: assignment.athleteId, discipline: assignment.discipline as Discipline }]
      : [],
  };
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
