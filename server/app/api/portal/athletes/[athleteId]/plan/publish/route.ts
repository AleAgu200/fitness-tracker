import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { DraftConflictError, parseDiscipline, publishDraft, requirePlanAccess } from "@/lib/plans";

/** POST — publish the open draft as the next version. */
export async function POST(request: Request, { params }: { params: Promise<{ athleteId: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  const { athleteId } = await params;

  const discipline = parseDiscipline(new URL(request.url).searchParams.get("discipline"));
  if (!discipline) return Response.json({ error: "invalid_discipline" }, { status: 400 });
  const access = await requirePlanAccess(user.id, athleteId, discipline);
  if (!access) return Response.json({ error: "plan_access_denied" }, { status: 403 });

  try {
    const result = await publishDraft(access, athleteId, user.id, user.name);
    if (!result) return Response.json({ error: "draft_not_found" }, { status: 404 });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof DraftConflictError) {
      // The draft is deliberately left intact so the professional can rebase
      // rather than lose the work they just wrote.
      return Response.json({ error: error.message, currentVersion: error.currentVersion }, { status: 409 });
    }
    throw error;
  }
}
