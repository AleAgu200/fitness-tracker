import { randomBytes } from "crypto";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  careAssignments,
  organizationClients,
  organizationMemberships,
  supervisionLinks,
  user,
} from "@/db/schema";
import { ensureProfessionalOrganization, projectAcceptedLink } from "@/lib/organizations";

export type LinkKind = "coach" | "nutritionist";

export interface TeamMember {
  linkId: string;
  kind: LinkKind;
  userId: string;
  name: string;
  email: string;
  since: number | null;
}

export interface LinkedAthlete {
  linkId: string;
  kind: LinkKind;
  userId: string;
  name: string;
  email: string;
  since: number | null;
}

function newId(): string {
  return randomBytes(12).toString("hex");
}

/** Human-friendly 6-char code, unambiguous alphabet */
function newInviteCode(): string {
  const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
  return code;
}

export function roleToKind(role: string): LinkKind | null {
  if (role === "coach") return "coach";
  if (role === "nutritionist") return "nutritionist";
  return null;
}

/** Professional creates an open invite; returns the code the athlete types in the app */
export async function createInvite(professionalId: string, kind: LinkKind): Promise<string> {
  const [professional] = await db.select({ name: user.name }).from(user).where(eq(user.id, professionalId));
  if (!professional) throw new Error("professional_not_found");
  await ensureProfessionalOrganization({ professionalId, professionalName: professional.name, discipline: kind });
  // Retry on the (unlikely) code collision
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newInviteCode();
    try {
      await db.insert(supervisionLinks).values({
        id: newId(),
        professionalId,
        kind,
        status: "pending",
        inviteCode: code,
        createdAt: Date.now(),
      });
      return code;
    } catch (e) {
      if (attempt === 4) throw e;
    }
  }
  throw new Error("invite_code_generation_failed");
}

export type AcceptResult =
  | { ok: true; kind: LinkKind; professionalName: string }
  | { ok: false; error: "invalid_code" | "already_linked" | "self_link" };

/** Athlete redeems an invite code */
export async function acceptInvite(athleteId: string, code: string): Promise<AcceptResult> {
  const [link] = await db
    .select({
      id: supervisionLinks.id,
      kind: supervisionLinks.kind,
      professionalId: supervisionLinks.professionalId,
      professionalName: user.name,
    })
    .from(supervisionLinks)
    .innerJoin(user, eq(user.id, supervisionLinks.professionalId))
    .where(and(eq(supervisionLinks.inviteCode, code.trim().toUpperCase()), eq(supervisionLinks.status, "pending")));

  if (!link) return { ok: false, error: "invalid_code" };
  if (link.professionalId === athleteId) return { ok: false, error: "self_link" };

  const [existing] = await db
    .select({ id: supervisionLinks.id })
    .from(supervisionLinks)
    .where(and(
      eq(supervisionLinks.athleteId, athleteId),
      eq(supervisionLinks.kind, link.kind),
      eq(supervisionLinks.status, "active"),
    ));
  if (existing) return { ok: false, error: "already_linked" };

  const acceptedAt = Date.now();
  await projectAcceptedLink({
    linkId: link.id,
    professionalId: link.professionalId,
    professionalName: link.professionalName,
    athleteId,
    discipline: link.kind as LinkKind,
    acceptedAt,
  });

  await db.update(supervisionLinks)
    .set({ athleteId, status: "active", acceptedAt })
    .where(eq(supervisionLinks.id, link.id));

  return { ok: true, kind: link.kind as LinkKind, professionalName: link.professionalName };
}

/** Athlete's active team (coach and/or nutritionist) */
export async function getTeam(athleteId: string): Promise<TeamMember[]> {
  const projected = await db
    .select({
      linkId: careAssignments.id,
      kind: careAssignments.discipline,
      userId: user.id,
      name: user.name,
      email: user.email,
      since: careAssignments.createdAt,
    })
    .from(organizationClients)
    .innerJoin(careAssignments, eq(careAssignments.organizationClientId, organizationClients.id))
    .innerJoin(organizationMemberships, eq(organizationMemberships.id, careAssignments.professionalMembershipId))
    .innerJoin(user, eq(user.id, organizationMemberships.userId))
    .where(and(
      eq(organizationClients.athleteId, athleteId),
      eq(organizationClients.status, "active"),
      eq(careAssignments.status, "active"),
      eq(organizationMemberships.status, "active"),
    ))
    .orderBy(careAssignments.discipline);
  if (projected.length) return projected as TeamMember[];

  const rows = await db
    .select({
      linkId: supervisionLinks.id,
      kind: supervisionLinks.kind,
      userId: user.id,
      name: user.name,
      email: user.email,
      since: supervisionLinks.acceptedAt,
    })
    .from(supervisionLinks)
    .innerJoin(user, eq(user.id, supervisionLinks.professionalId))
    .where(and(eq(supervisionLinks.athleteId, athleteId), eq(supervisionLinks.status, "active")))
    .orderBy(supervisionLinks.kind);
  return rows as TeamMember[];
}

/** Professional's active athletes */
export async function getAthletes(professionalId: string): Promise<LinkedAthlete[]> {
  const projected = await db
    .select({
      linkId: careAssignments.id,
      kind: careAssignments.discipline,
      userId: user.id,
      name: user.name,
      email: user.email,
      since: careAssignments.createdAt,
    })
    .from(organizationMemberships)
    .innerJoin(careAssignments, eq(careAssignments.professionalMembershipId, organizationMemberships.id))
    .innerJoin(organizationClients, eq(organizationClients.id, careAssignments.organizationClientId))
    .innerJoin(user, eq(user.id, organizationClients.athleteId))
    .where(and(
      eq(organizationMemberships.userId, professionalId),
      eq(organizationMemberships.status, "active"),
      eq(careAssignments.status, "active"),
      eq(organizationClients.status, "active"),
    ))
    .orderBy(desc(careAssignments.createdAt));
  if (projected.length) return projected as LinkedAthlete[];

  const rows = await db
    .select({
      linkId: supervisionLinks.id,
      kind: supervisionLinks.kind,
      userId: user.id,
      name: user.name,
      email: user.email,
      since: supervisionLinks.acceptedAt,
    })
    .from(supervisionLinks)
    .innerJoin(user, eq(user.id, supervisionLinks.athleteId))
    .where(and(eq(supervisionLinks.professionalId, professionalId), eq(supervisionLinks.status, "active")))
    .orderBy(desc(supervisionLinks.acceptedAt));
  return rows as LinkedAthlete[];
}
