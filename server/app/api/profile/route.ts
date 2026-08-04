import { getSessionUser, forbidden, unauthorized } from "@/lib/api-auth";
import { getAthleteProfile, upsertAthleteProfile } from "@/lib/profiles";
import { z } from "zod";

function isValidDateOfBirth(value: string): boolean {
  const match = /^(?:(\d{2})\/(\d{2})\/(\d{4})|(\d{4})-(\d{2})-(\d{2}))$/.exec(value);
  if (!match) return false;
  const year = Number(match[3] ?? match[4]);
  const month = Number(match[2] ?? match[5]);
  const day = Number(match[1] ?? match[6]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return false;
  const today = new Date();
  let age = today.getUTCFullYear() - year;
  const beforeBirthday =
    today.getUTCMonth() < month - 1 ||
    (today.getUTCMonth() === month - 1 && today.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age >= 1 && age < 120;
}

const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  sex: z.enum(["M", "F", "X"]).nullable().optional(),
  dateOfBirth: z.string().trim().refine(isValidDateOfBirth, "invalid_date_of_birth").nullable().optional(),
  heightCm: z.number().finite().min(100).max(250).nullable().optional(),
  goalWeightKg: z.number().finite().min(25).max(350).nullable().optional(),
  measurement: z.object({
    id: z.string().min(1).max(128),
    measuredAt: z.number().int().positive(),
    weightKg: z.number().finite().min(25).max(350),
  }).strict().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "empty_update");

/** Return the authenticated athlete's server-backed profile. */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "athlete") return forbidden();
  return Response.json(
    { profile: getAthleteProfile(user.id) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

/** Merge profile fields for the authenticated athlete; userId is never accepted from the client. */
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "athlete") return forbidden();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "invalid_profile",
        issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      },
      { status: 400 },
    );
  }

  try {
    return Response.json(
      { profile: upsertAthleteProfile(user.id, user.name, parsed.data) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "measurement_id_conflict") {
      return Response.json({ error: "measurement_id_conflict" }, { status: 409 });
    }
    console.error("[profile] save failed", error instanceof Error ? error.message : String(error));
    return Response.json({ error: "profile_save_failed" }, { status: 500 });
  }
}
