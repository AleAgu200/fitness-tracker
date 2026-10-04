import { z } from "zod";

import { getPendingDeletion } from "@/lib/account";
import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { CURRENT_SYNC_SCHEMA_VERSION } from "@/lib/sync-contract";
import { claimWriterDevice, WriterDeviceConflictError } from "@/lib/sync";

const claimSchema = z.object({ deviceId: z.string().min(1).max(128) }).strict();

/**
 * POST /api/sync/writer — the athlete explicitly makes this phone the one that
 * records (after a restore or a lost phone). The previous phone stops syncing.
 */
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "athlete") return Response.json({ error: "athlete_only" }, { status: 403 });
  if (await getPendingDeletion(user.id)) return Response.json({ error: "account_deletion_pending" }, { status: 423 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = claimSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  try {
    return Response.json(await claimWriterDevice(user.id, parsed.data.deviceId, CURRENT_SYNC_SCHEMA_VERSION));
  } catch (error) {
    if (error instanceof WriterDeviceConflictError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
