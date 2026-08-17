import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { getActiveMealPlan, getActiveWorkout } from "@/lib/assignments";
import { getProfessionalAccess } from "@/lib/permissions";
import { roleToKind } from "@/lib/supervision";

/**
 * GET /api/assignments — athlete fetches their active assignments.
 * GET /api/assignments?athleteId=<id> — a linked professional inspects an athlete's assignments.
 */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  let athleteId = user.id;
  let professionalAccess: Awaited<ReturnType<typeof getProfessionalAccess>> | null = null;
  const requested = new URL(request.url).searchParams.get("athleteId");
  if (requested && requested !== user.id) {
    professionalAccess = roleToKind(user.role) ? await getProfessionalAccess(user.id, requested) : [];
    if (!professionalAccess.length) {
      return Response.json({ error: "not_linked" }, { status: 403 });
    }
    athleteId = requested;
  }

  const [workout, mealPlan] = await Promise.all([getActiveWorkout(athleteId), getActiveMealPlan(athleteId)]);
  if (!professionalAccess) return Response.json({ workout, mealPlan });
  return Response.json({
    workout: professionalAccess.some(access => access.discipline === "coach" && access.consents.training === "granted") ? workout : null,
    mealPlan: professionalAccess.some(access => access.discipline === "nutritionist" && access.consents.nutrition === "granted") ? mealPlan : null,
    permissions: {
      training: professionalAccess.some(access => access.discipline === "coach" && access.consents.training === "granted"),
      nutrition: professionalAccess.some(access => access.discipline === "nutritionist" && access.consents.nutrition === "granted"),
    },
  });
}
