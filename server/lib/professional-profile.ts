import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  organizationMemberships,
  organizations,
  professionalCapabilities,
  professionalProfiles,
  professionalSettings,
  user,
} from "@/db/schema";
import { legacyMembershipId, legacyOrganizationId } from "@/lib/organizations";
import type { LinkKind } from "@/lib/supervision";

export interface ProfessionalProfileInput {
  name: string;
  organizationName: string;
  headline: string;
  bio: string;
  phone: string | null;
  location: string | null;
  timezone: string;
  credentials: string;
}

export async function initializeProfessionalAccount(input: {
  userId: string;
  name: string;
  discipline: LinkKind;
  organizationName?: string;
}) {
  const now = Date.now();
  const organizationId = legacyOrganizationId(input.userId);
  const membershipId = legacyMembershipId(input.userId);
  await db.transaction(async (tx) => {
    await tx.update(user).set({ role: input.discipline, updatedAt: new Date() }).where(eq(user.id, input.userId));
    await tx.insert(organizations).values({
      id: organizationId,
      name: input.organizationName?.trim() || `${input.name} · PULSO`,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
    await tx.insert(organizationMemberships).values({
      id: membershipId,
      organizationId,
      userId: input.userId,
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
    await tx.insert(professionalProfiles).values({
      userId: input.userId,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
    await tx.insert(professionalSettings).values({
      userId: input.userId,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
  });
  return { organizationId, membershipId };
}

export async function getProfessionalProfile(userId: string) {
  const organizationId = legacyOrganizationId(userId);
  const membershipId = legacyMembershipId(userId);
  const [result] = await db.select({
    name: user.name,
    email: user.email,
    role: user.role,
    headline: professionalProfiles.headline,
    bio: professionalProfiles.bio,
    phone: professionalProfiles.phone,
    location: professionalProfiles.location,
    timezone: professionalProfiles.timezone,
    credentials: professionalProfiles.credentials,
    organizationName: organizations.name,
    organizationRole: organizationMemberships.orgRole,
  }).from(user)
    .leftJoin(professionalProfiles, eq(professionalProfiles.userId, user.id))
    .leftJoin(organizationMemberships, and(
      eq(organizationMemberships.id, membershipId),
      eq(organizationMemberships.userId, user.id),
    ))
    .leftJoin(organizations, eq(organizations.id, organizationId))
    .where(eq(user.id, userId));
  return result ?? null;
}

export async function updateProfessionalProfile(userId: string, input: ProfessionalProfileInput) {
  const now = Date.now();
  const organizationId = legacyOrganizationId(userId);
  await db.transaction(async (tx) => {
    await tx.update(user).set({ name: input.name, updatedAt: new Date() }).where(eq(user.id, userId));
    await tx.insert(professionalProfiles).values({
      userId,
      headline: input.headline,
      bio: input.bio,
      phone: input.phone,
      location: input.location,
      timezone: input.timezone,
      credentials: input.credentials,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: professionalProfiles.userId,
      set: {
        headline: input.headline,
        bio: input.bio,
        phone: input.phone,
        location: input.location,
        timezone: input.timezone,
        credentials: input.credentials,
        updatedAt: now,
      },
    });
    await tx.update(organizations)
      .set({ name: input.organizationName, updatedAt: now })
      .where(eq(organizations.id, organizationId));
  });
}

export async function getProfessionalSettings(userId: string) {
  const [settings] = await db.select().from(professionalSettings).where(eq(professionalSettings.userId, userId));
  return settings ?? null;
}

export async function updateProfessionalSettings(userId: string, input: {
  emailNotifications: boolean;
  attentionDigest: boolean;
  weeklySummary: boolean;
  defaultPortalSection: "attention" | "athletes" | "foods" | "exercises";
}) {
  const now = Date.now();
  await db.insert(professionalSettings).values({
    userId,
    ...input,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: professionalSettings.userId,
    set: { ...input, updatedAt: now },
  });
}
