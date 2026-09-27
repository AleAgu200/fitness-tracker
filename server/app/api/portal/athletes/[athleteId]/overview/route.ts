import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { getAthleteOverview } from "@/lib/overview";
import { OVERVIEW_PERIODS, parseOverviewPeriod } from "@/lib/progress-policy";

/** GET /api/portal/athletes/:athleteId/overview?range=7|28|90 (default 28). */
export async function GET(request: Request, { params }: { params: Promise<{ athleteId: string }> }) {
  const session = await getSessionUser(request);
  if (!session) return unauthorized();
  const { athleteId } = await params;
  const period = parseOverviewPeriod(new URL(request.url).searchParams.get("range"));
  if (!period) return Response.json({ error: "invalid_range", allowed: OVERVIEW_PERIODS }, { status: 400 });
  const overview = await getAthleteOverview(session.id, athleteId, period);
  if (!overview) return Response.json({ error: "athlete_access_denied" }, { status: 403 });
  return Response.json(overview);
}
