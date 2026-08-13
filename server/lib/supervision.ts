import { randomBytes } from "crypto";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { supervisionLinks, user } from "@/db/schema";

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

  await db.update(supervisionLinks)
    .set({ athleteId, status: "active", acceptedAt: Date.now() })
    .where(eq(supervisionLinks.id, link.id));

  return { ok: true, kind: link.kind as LinkKind, professionalName: link.professionalName };
}

/** Athlete's active team (coach and/or nutritionist) */
export async function getTeam(athleteId: string): Promise<TeamMember[]> {
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
