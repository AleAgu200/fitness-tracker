import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { WriterDeviceConflictError, pushMutations } from "@/lib/sync";
import { syncPushSchema } from "@/lib/sync-contract";

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
  const parsed = syncPushSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_sync_batch", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await pushMutations(user.id, parsed.data.deviceId, parsed.data.mutations);
    if (result.upgradeRequired) return Response.json({ error: "sync_upgrade_required", ...result }, { status: 426 });
    return Response.json(result);
  } catch (error) {
    if (error instanceof WriterDeviceConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
