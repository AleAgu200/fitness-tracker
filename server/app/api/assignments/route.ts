import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { getActiveMealPlan, getActiveWorkout } from "@/lib/assignments";
import { areLinked } from "@/lib/messaging";
import { roleToKind } from "@/lib/supervision";

/**
 * GET /api/assignments — athlete fetches their active assignments.
 * GET /api/assignments?athleteId=<id> — a linked professional inspects an athlete's assignments.
 */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  let athleteId = user.id;
  const requested = new URL(request.url).searchParams.get("athleteId");
  if (requested && requested !== user.id) {
    if (!roleToKind(user.role) || !(await areLinked(user.id, requested))) {
      return Response.json({ error: "not_linked" }, { status: 403 });
    }
    athleteId = requested;
  }

  return Response.json({
    workout: await getActiveWorkout(athleteId),
    mealPlan: await getActiveMealPlan(athleteId),
  });
}
