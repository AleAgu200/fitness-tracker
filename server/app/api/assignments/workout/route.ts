import { forbidden, getSessionUser, unauthorized } from "@/lib/api-auth";
import { AssignmentConflictError, assignWorkout, WorkoutPayload } from "@/lib/assignments";
import { normalizeExercises, PlanPayloadError } from "@/lib/plan-payload";
import { requireCategoryAccess } from "@/lib/permissions";

/** POST /api/assignments/workout { athleteId, exercises } — coach assigns a training plan */
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "coach") return forbidden();

  let body: { athleteId?: unknown; exercises?: unknown; baseVersion?: unknown; effectiveAt?: unknown; endsAt?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const athleteId = typeof body.athleteId === "string" ? body.athleteId : null;
  if (!athleteId) return Response.json({ error: "invalid_body" }, { status: 400 });

  const access = await requireCategoryAccess(user.id, athleteId, "training");
  if (!access) return Response.json({ error: "training_access_denied" }, { status: 403 });

  let exercises: WorkoutPayload["exercises"];
  try {
    exercises = normalizeExercises(body.exercises);
  } catch (error) {
    if (error instanceof PlanPayloadError) return Response.json({ error: error.code }, { status: 400 });
    throw error;
  }

  try {
    const version = await assignWorkout(user.id, athleteId, { coachName: user.name, exercises }, {
      access,
      baseVersion: typeof body.baseVersion === "number" ? body.baseVersion : undefined,
      effectiveAt: typeof body.effectiveAt === "number" ? body.effectiveAt : undefined,
      endsAt: body.endsAt === null || typeof body.endsAt === "number" ? body.endsAt : undefined,
    });
    return Response.json({ ok: true, version });
  } catch (error) {
    if (error instanceof AssignmentConflictError) {
      return Response.json({ error: error.message, currentVersion: error.currentVersion }, { status: 409 });
    }
    throw error;
  }
}
