import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { db } from "@/db";
import {
  careAssignments,
  organizationClients,
  organizationMemberships,
  organizations,
  professionalCapabilities,
  sharingConsents,
  user,
} from "@/db/schema";
import { requireCategoryAccess, type AccessContext, type SharingCategory } from "@/lib/permissions";

export interface SeededAthlete {
  access: AccessContext;
  coachId: string;
  athleteId: string;
  organizationId: string;
  membershipId: string;
  organizationClientId: string;
}

/**
 * Provision an isolated professional + athlete for one integration test.
 *
 * Self-seeding on purpose: relying on rows that happen to exist in a dev
 * database makes the suite unrunnable on a fresh machine and lets tests
 * interfere with each other. Every call gets its own organization.
 */
export async function seedCoachedAthlete(options: {
  discipline?: "coach" | "nutritionist";
  categories?: SharingCategory[];
} = {}): Promise<SeededAthlete> {
  const discipline = options.discipline ?? "coach";
  const categories = options.categories ?? ["training"];
  const nonce = randomUUID();
  const coachId = `pro_${nonce}`;
  const athleteId = `athlete_${nonce}`;
  const now = Date.now();
  const timestamps = { createdAt: new Date(now), updatedAt: new Date(now) };

  await db.insert(user).values([
    { id: coachId, name: "Profesional Test", email: `${coachId}@pulso.test`, role: discipline, ...timestamps },
    { id: athleteId, name: "Atleta Test", email: `${athleteId}@pulso.test`, role: "athlete", ...timestamps },
  ]);

  const organizationId = `org_${nonce}`;
  await db.insert(organizations).values({ id: organizationId, name: `Org ${nonce}`, createdAt: now, updatedAt: now });

  const membershipId = `mem_${nonce}`;
  await db.insert(organizationMemberships).values({
    id: membershipId,
    organizationId,
    userId: coachId,
    orgRole: "owner",
    status: "active",
    invitedAt: now,
    activatedAt: now,
  });
  await db.insert(professionalCapabilities).values({ membershipId, discipline, createdAt: now });

  const organizationClientId = `client_${nonce}`;
  await db.insert(organizationClients).values({
    id: organizationClientId,
    organizationId,
    athleteId,
    status: "active",
    createdAt: now,
    activatedAt: now,
  });
  await db.insert(careAssignments).values({
    id: `care_${nonce}`,
    organizationClientId,
    professionalMembershipId: membershipId,
    discipline,
    primary: true,
    status: "active",
    createdAt: now,
  });
  await db.insert(sharingConsents).values(categories.map(category => ({
    id: `consent_${category}_${nonce}`,
    organizationClientId,
    category,
    grantedAt: now,
    updatedAt: now,
  })));

  const primaryCategory: SharingCategory = discipline === "coach" ? "training" : "nutrition";
  const access = await requireCategoryAccess(coachId, athleteId, primaryCategory);
  assert.ok(access, `seeded ${discipline} should hold ${primaryCategory} access`);

  return { access, coachId, athleteId, organizationId, membershipId, organizationClientId };
}

/** Add a second professional to an existing seeded organization. */
export async function addProfessionalToOrg(input: {
  organizationId: string;
  disciplines: ("coach" | "nutritionist")[];
  orgRole?: "owner" | "admin" | "professional";
}): Promise<{ userId: string; membershipId: string }> {
  const nonce = randomUUID();
  const userId = `pro_${nonce}`;
  const membershipId = `mem_${nonce}`;
  const now = Date.now();

  await db.insert(user).values({
    id: userId,
    name: "Colaborador Test",
    email: `${userId}@pulso.test`,
    role: input.disciplines[0],
    createdAt: new Date(now),
    updatedAt: new Date(now),
  });
  await db.insert(organizationMemberships).values({
    id: membershipId,
    organizationId: input.organizationId,
    userId,
    orgRole: input.orgRole ?? "professional",
    status: "active",
    invitedAt: now,
    activatedAt: now,
  });
  await db.insert(professionalCapabilities).values(
    input.disciplines.map(discipline => ({ membershipId, discipline, createdAt: now })),
  );

  return { userId, membershipId };
}
