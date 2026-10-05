import { z } from "zod";

import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { DeviceSyncError, pullRecords, pushRecords } from "@/lib/device-sync";
import { MAX_CHANGES_PER_PUSH } from "@/lib/device-sync-policy";

const STATUS: Record<DeviceSyncError["code"], number> = {
  sync_disabled: 403,
  subscription_required: 402,
  account_deletion_pending: 423,
  too_many_changes: 413,
};

function errorResponse(error: unknown): Response {
  if (error instanceof DeviceSyncError) return Response.json({ error: error.code }, { status: STATUS[error.code] });
  throw error;
}

const pushSchema = z.object({
  deviceId: z.string().min(1).max(128),
  changes: z.array(z.object({
    table: z.string().max(64),
    id: z.string().max(128),
    op: z.enum(["upsert", "delete"]),
    payload: z.unknown().optional(),
    changedAt: z.number(),
  })).max(MAX_CHANGES_PER_PUSH),
}).strict();

/** GET /api/records?cursor=N&limit=M — changes from the athlete's devices after the cursor. */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  const params = new URL(request.url).searchParams;
  const cursor = Number(params.get("cursor") ?? 0);
  const limit = Number(params.get("limit") ?? 500);
  if (!Number.isInteger(cursor) || cursor < 0 || !Number.isInteger(limit)) return Response.json({ error: "invalid_cursor" }, { status: 400 });
  try {
    return Response.json(await pullRecords(user.id, cursor, limit), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/records — this device's changes; per record the most recent wins. */
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
  const parsed = pushSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  try {
    return Response.json({ results: await pushRecords(user.id, parsed.data.deviceId, parsed.data.changes) });
  } catch (error) {
    return errorResponse(error);
  }
}
