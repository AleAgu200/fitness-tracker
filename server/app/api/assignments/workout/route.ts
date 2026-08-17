import { forbidden, getSessionUser, unauthorized } from "@/lib/api-auth";
import { AssignmentConflictError, assignWorkout, WorkoutPayload } from "@/lib/assignments";
import { requireCategoryAccess } from "@/lib/permissions";

const MAX_EXERCISES = 20;

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
  if (!athleteId || !Array.isArray(body.exercises) || body.exercises.length === 0) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  if (body.exercises.length > MAX_EXERCISES) {
    return Response.json({ error: "too_many_exercises" }, { status: 400 });
  }
  const access = await requireCategoryAccess(user.id, athleteId, "training");
  if (!access) return Response.json({ error: "training_access_denied" }, { status: 403 });

  const exercises: WorkoutPayload["exercises"] = [];
  for (const raw of body.exercises as Record<string, unknown>[]) {
    const nombre = typeof raw.nombre === "string" ? raw.nombre.trim() : "";
    if (!nombre) return Response.json({ error: "invalid_exercise" }, { status: 400 });
    const instructions = typeof raw.instructions === "string" ? raw.instructions.trim().slice(0, 2000) : null;
    const rawGifPath = typeof raw.gifPath === "string" ? raw.gifPath.trim().slice(0, 2048) : "";
    const gifPath = rawGifPath && (/^https?:\/\//i.test(rawGifPath) || rawGifPath.startsWith("/"))
      ? rawGifPath
      : null;
    exercises.push({
      nombre,
      target: Math.max(1, Math.round(Number(raw.target) || 3)),
      reps: Math.max(1, Math.round(Number(raw.reps) || 8)),
      peso: Math.max(0, Number(raw.peso) || 0),
      step: Math.max(0.5, Number(raw.step) || 2.5),
      restSeconds: Math.max(15, Math.round(Number(raw.restSeconds) || 90)),
      instructions: instructions || null,
      gifPath,
    });
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
