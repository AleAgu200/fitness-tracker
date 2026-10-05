import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { getDeviceSyncStatus } from "@/lib/device-sync";

/** GET /api/records/status — whether this account syncs its devices, and how much is stored. */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  return Response.json(await getDeviceSyncStatus(user.id), { headers: { "Cache-Control": "no-store" } });
}
