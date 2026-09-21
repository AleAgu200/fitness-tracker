import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { withdrawScheduledPlan } from "@/lib/assignments";
import { parseDiscipline, requirePlanAccess, revertToVersion } from "@/lib/plans";

/**
 * POST { version } — load an old version back into the draft for review.
 * POST { withdrawVersion } — cancel a scheduled version that has not applied yet.
 */
export async function POST(request: Request, { params }: { params: Promise<{ athleteId: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  const { athleteId } = await params;

  const discipline = parseDiscipline(new URL(request.url).searchParams.get("discipline"));
  if (!discipline) return Response.json({ error: "invalid_discipline" }, { status: 400 });
  const access = await requirePlanAccess(user.id, athleteId, discipline);
  if (!access) return Response.json({ error: "plan_access_denied" }, { status: 403 });

  let body: { version?: unknown; withdrawVersion?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  if (typeof body.withdrawVersion === "number") {
    const withdrawn = await withdrawScheduledPlan(athleteId, discipline, body.withdrawVersion);
    if (!withdrawn) return Response.json({ error: "not_scheduled" }, { status: 409 });
    return Response.json({ ok: true });
  }

  if (typeof body.version !== "number") {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const draft = await revertToVersion(access, athleteId, body.version);
  if (!draft) return Response.json({ error: "version_not_found" }, { status: 404 });
  return Response.json({ draft });
}
