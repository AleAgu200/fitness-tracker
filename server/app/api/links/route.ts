import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { getAthletes, getTeam, roleToKind } from "@/lib/supervision";

/** Current user's active links: team for athletes, athlete roster for professionals */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  if (roleToKind(user.role)) {
    return Response.json({ role: user.role, athletes: getAthletes(user.id) });
  }
  return Response.json({ role: user.role, team: getTeam(user.id) });
}
