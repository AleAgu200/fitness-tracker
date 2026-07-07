import Database from "better-sqlite3";
import { randomBytes } from "crypto";

// Same DB file as Better Auth so links can join against "user"
const db = new Database("./data/auth.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS "supervision_links" (
    "id"              TEXT NOT NULL PRIMARY KEY,
    "professionalId"  TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "athleteId"       TEXT REFERENCES "user"("id") ON DELETE CASCADE,
    "kind"            TEXT NOT NULL CHECK ("kind" IN ('coach','nutritionist')),
    "status"          TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','active','revoked')),
    "inviteCode"      TEXT UNIQUE,
    "createdAt"       INTEGER NOT NULL,
    "acceptedAt"      INTEGER
  );
  CREATE INDEX IF NOT EXISTS "sl_athlete"      ON "supervision_links" ("athleteId", "status");
  CREATE INDEX IF NOT EXISTS "sl_professional" ON "supervision_links" ("professionalId", "status");
`);

export type LinkKind = "coach" | "nutritionist";

export interface TeamMember {
  linkId: string;
  kind: LinkKind;
  userId: string;
  name: string;
  email: string;
  since: number;
}

export interface LinkedAthlete {
  linkId: string;
  kind: LinkKind;
  userId: string;
  name: string;
  email: string;
  since: number;
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
export function createInvite(professionalId: string, kind: LinkKind): string {
  // Retry on the (unlikely) code collision
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newInviteCode();
    try {
      db.prepare(
        `INSERT INTO "supervision_links" ("id","professionalId","kind","status","inviteCode","createdAt")
         VALUES (?, ?, ?, 'pending', ?, ?)`,
      ).run(newId(), professionalId, kind, code, Date.now());
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
export function acceptInvite(athleteId: string, code: string): AcceptResult {
  const link = db.prepare(
    `SELECT l."id", l."kind", l."professionalId", u."name" AS professionalName
     FROM "supervision_links" l
     JOIN "user" u ON u."id" = l."professionalId"
     WHERE l."inviteCode" = ? AND l."status" = 'pending'`,
  ).get(code.trim().toUpperCase()) as
    | { id: string; kind: LinkKind; professionalId: string; professionalName: string }
    | undefined;

  if (!link) return { ok: false, error: "invalid_code" };
  if (link.professionalId === athleteId) return { ok: false, error: "self_link" };

  const existing = db.prepare(
    `SELECT 1 FROM "supervision_links"
     WHERE "athleteId" = ? AND "kind" = ? AND "status" = 'active'`,
  ).get(athleteId, link.kind);
  if (existing) return { ok: false, error: "already_linked" };

  db.prepare(
    `UPDATE "supervision_links"
     SET "athleteId" = ?, "status" = 'active', "acceptedAt" = ?
     WHERE "id" = ?`,
  ).run(athleteId, Date.now(), link.id);

  return { ok: true, kind: link.kind, professionalName: link.professionalName };
}

/** Athlete's active team (coach and/or nutritionist) */
export function getTeam(athleteId: string): TeamMember[] {
  return db.prepare(
    `SELECT l."id" AS linkId, l."kind", u."id" AS userId, u."name", u."email", l."acceptedAt" AS since
     FROM "supervision_links" l
     JOIN "user" u ON u."id" = l."professionalId"
     WHERE l."athleteId" = ? AND l."status" = 'active'
     ORDER BY l."kind"`,
  ).all(athleteId) as TeamMember[];
}

/** Professional's active athletes */
export function getAthletes(professionalId: string): LinkedAthlete[] {
  return db.prepare(
    `SELECT l."id" AS linkId, l."kind", u."id" AS userId, u."name", u."email", l."acceptedAt" AS since
     FROM "supervision_links" l
     JOIN "user" u ON u."id" = l."athleteId"
     WHERE l."professionalId" = ? AND l."status" = 'active'
     ORDER BY l."acceptedAt" DESC`,
  ).all(professionalId) as LinkedAthlete[];
}
