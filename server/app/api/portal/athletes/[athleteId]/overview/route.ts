import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { getAthleteOverview } from "@/lib/overview";

export async function GET(request: Request, { params }: { params: Promise<{ athleteId: string }> }) {
  const session = await getSessionUser(request);
  if (!session) return unauthorized();
  const { athleteId } = await params;
  const overview = await getAthleteOverview(session.id, athleteId);
  if (!overview) return Response.json({ error: "athlete_access_denied" }, { status: 403 });
  return Response.json(overview);
}
