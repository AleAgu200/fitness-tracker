import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { lastMessageAt } from "@/lib/messaging";
import { getAthletes, getTeam, roleToKind } from "@/lib/supervision";

/** Current user's active links: team for athletes, athlete roster for professionals */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  if (roleToKind(user.role)) {
    const athletes = getAthletes(user.id);
    const lastMsg = lastMessageAt(user.id);
    return Response.json({
      role: user.role,
      athletes: athletes.map(a => ({ ...a, lastMessageAt: lastMsg[a.userId] ?? null })),
    });
  }
  return Response.json({ role: user.role, team: getTeam(user.id) });
}
