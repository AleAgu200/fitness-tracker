import { z } from "zod";

import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { backupErrorResponse, NO_STORE } from "@/lib/backup-http";
import { createBackup, deleteBackups, getBackupStatus } from "@/lib/personal-backup";

const uploadSchema = z.object({
  deviceId: z.string().min(1).max(128),
  checksum: z.string().regex(/^[0-9a-fA-F]{64}$/),
  payloadJson: z.string().min(2),
  confirmShrink: z.boolean().optional(),
}).strict();

/** GET /api/backup — the caller's backup consent, eligibility and newest copy. Free. */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  return Response.json(await getBackupStatus(user.id), { headers: NO_STORE });
}

/** POST /api/backup — store a new complete copy (consent + Plus, from the writer phone). */
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "athlete") return Response.json({ error: "athlete_only" }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  try {
    return Response.json({ backup: await createBackup(user.id, parsed.data) }, { status: 201 });
  } catch (error) {
    return backupErrorResponse(error);
  }
}

/** DELETE /api/backup — delete every copy and withdraw backup consent. Free. */
export async function DELETE(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  return Response.json({ deleted: await deleteBackups(user.id) });
}
