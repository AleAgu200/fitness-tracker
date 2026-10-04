import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { NO_STORE } from "@/lib/backup-http";
import { getBackupBootstrap } from "@/lib/personal-backup";

/**
 * GET /api/backup/bootstrap — profile, onboarding and active-plan references
 * of the newest copy, so a new phone can route before the full restore.
 * `{ backup: null }` is a verified absence, not an error.
 */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  return Response.json({ backup: await getBackupBootstrap(user.id) }, { headers: NO_STORE });
}
