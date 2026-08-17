import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  careAssignments,
  organizationClients,
  organizationMemberships,
  organizations,
  professionalCapabilities,
  sharingConsents,
} from "@/db/schema";
import {
  disciplineAllowsCategory,
  evaluatePermission,
  type Discipline,
  type OrganizationRole,
  type SharingCategory,
} from "@/lib/permissions-policy";

export {
  disciplineAllowsCategory,
  evaluatePermission,
  type Discipline,
  type OrganizationRole,
  type PermissionDecision,
  type PermissionFacts,
  type SharingCategory,
} from "@/lib/permissions-policy";

export interface AccessContext {
  organizationId: string;
  organizationName: string;
  organizationClientId: string;
  membershipId: string;
  orgRole: OrganizationRole;
  assignmentId: string;
  discipline: Discipline;
  primary: boolean;
  capabilities: Discipline[];
  consents: Record<SharingCategory, "granted" | "revoked" | "never_granted">;
}

const ALL_CATEGORIES: SharingCategory[] = ["training", "nutrition", "metrics", "checkins", "photos"];

export async function getProfessionalAccess(professionalUserId: string, athleteId: string): Promise<AccessContext[]> {
  const rows = await db.select({
    organizationId: organizations.id,
    organizationName: organizations.name,
    organizationClientId: organizationClients.id,
    membershipId: organizationMemberships.id,
    orgRole: organizationMemberships.orgRole,
    membershipStatus: organizationMemberships.status,
    clientStatus: organizationClients.status,
    assignmentId: careAssignments.id,
    assignmentStatus: careAssignments.status,
    discipline: careAssignments.discipline,
    primary: careAssignments.primary,
  })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .innerJoin(organizationClients, eq(organizationClients.organizationId, organizations.id))
    .innerJoin(careAssignments, and(
      eq(careAssignments.organizationClientId, organizationClients.id),
      eq(careAssignments.professionalMembershipId, organizationMemberships.id),
    ))
    .where(and(
      eq(organizationMemberships.userId, professionalUserId),
      eq(organizationMemberships.status, "active"),
      eq(organizationClients.athleteId, athleteId),
      eq(organizationClients.status, "active"),
      eq(careAssignments.status, "active"),
    ));

  if (!rows.length) return [];
  const membershipIds = [...new Set(rows.map(row => row.membershipId))];
  const clientIds = [...new Set(rows.map(row => row.organizationClientId))];
  const [capabilityRows, consentRows] = await Promise.all([
    db.select().from(professionalCapabilities).where(inArray(professionalCapabilities.membershipId, membershipIds)),
    db.select().from(sharingConsents).where(inArray(sharingConsents.organizationClientId, clientIds)),
  ]);

  return rows.flatMap((row) => {
    const capabilities = capabilityRows
      .filter(capability => capability.membershipId === row.membershipId)
      .map(capability => capability.discipline as Discipline);
    const consents = Object.fromEntries(ALL_CATEGORIES.map(category => {
      const consent = consentRows.find(item => item.organizationClientId === row.organizationClientId && item.category === category);
      return [category, consent ? (consent.revokedAt == null ? "granted" : "revoked") : "never_granted"];
    })) as AccessContext["consents"];
    const decision = evaluatePermission({
      membershipStatus: row.membershipStatus,
      clientStatus: row.clientStatus,
      assignmentStatus: row.assignmentStatus,
      orgRole: row.orgRole as OrganizationRole,
      assignmentDiscipline: row.discipline as Discipline,
      capabilities,
    });
    if (!decision.record) return [];
    return [{
      organizationId: row.organizationId,
      organizationName: row.organizationName,
      organizationClientId: row.organizationClientId,
      membershipId: row.membershipId,
      orgRole: row.orgRole as OrganizationRole,
      assignmentId: row.assignmentId,
      discipline: row.discipline as Discipline,
      primary: row.primary,
      capabilities,
      consents,
    }];
  });
}

export async function requireCategoryAccess(
  professionalUserId: string,
  athleteId: string,
  category: SharingCategory,
): Promise<AccessContext | null> {
  const contexts = await getProfessionalAccess(professionalUserId, athleteId);
  return contexts.find(context => {
    const decision = evaluatePermission({
      membershipStatus: "active",
      clientStatus: "active",
      assignmentStatus: "active",
      orgRole: context.orgRole,
      assignmentDiscipline: context.discipline,
      capabilities: context.capabilities,
      category,
      consentGranted: context.consents[category] === "granted",
    });
    return decision.category;
  }) ?? null;
}

export async function getOrganizationMembership(userId: string, organizationId: string) {
  const [membership] = await db.select().from(organizationMemberships).where(and(
    eq(organizationMemberships.userId, userId),
    eq(organizationMemberships.organizationId, organizationId),
    eq(organizationMemberships.status, "active"),
  ));
  return membership ?? null;
}

export async function canManageOrganization(userId: string, organizationId: string) {
  const membership = await getOrganizationMembership(userId, organizationId);
  return membership && (membership.orgRole === "owner" || membership.orgRole === "admin") ? membership : null;
}
