import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { backupErrorResponse, NO_STORE } from "@/lib/backup-http";
import { getBackupSnapshot } from "@/lib/personal-backup";

/** GET /api/backup/snapshot?revision=N — a full verified copy (newest by default). Free, also after Plus ends. */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  const raw = new URL(request.url).searchParams.get("revision");
  const revision = raw == null ? undefined : Number(raw);
  if (revision !== undefined && (!Number.isInteger(revision) || revision < 1)) {
    return Response.json({ error: "invalid_revision" }, { status: 400 });
  }
  try {
    return Response.json({ backup: await getBackupSnapshot(user.id, revision) }, { headers: NO_STORE });
  } catch (error) {
    return backupErrorResponse(error);
  }
}
