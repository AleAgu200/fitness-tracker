import { getSessionUser, unauthorized } from "@/lib/api-auth";
import {
  getActiveMealPlan,
  getActiveWorkout,
  getScheduledMealPlan,
  getScheduledWorkout,
  listMealPlanHistory,
  listWorkoutHistory,
} from "@/lib/assignments";
import { parseDiscipline, requirePlanAccess } from "@/lib/plans";

/** GET — published versions plus what is in force and what is scheduled next. */
export async function GET(request: Request, { params }: { params: Promise<{ athleteId: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  const { athleteId } = await params;

  const discipline = parseDiscipline(new URL(request.url).searchParams.get("discipline"));
  if (!discipline) return Response.json({ error: "invalid_discipline" }, { status: 400 });
  const access = await requirePlanAccess(user.id, athleteId, discipline);
  if (!access) return Response.json({ error: "plan_access_denied" }, { status: 403 });

  const [history, active, scheduled] = await Promise.all([
    discipline === "coach" ? listWorkoutHistory(athleteId) : listMealPlanHistory(athleteId),
    discipline === "coach" ? getActiveWorkout(athleteId) : getActiveMealPlan(athleteId),
    discipline === "coach" ? getScheduledWorkout(athleteId) : getScheduledMealPlan(athleteId),
  ]);

  return Response.json({
    history,
    activeVersion: active?.version ?? null,
    scheduled: scheduled ? { version: scheduled.version, name: scheduled.name, effectiveAt: scheduled.effectiveAt } : null,
  });
}
