import { forbidden, getSessionUser, unauthorized } from "@/lib/api-auth";
import { assignWorkout, WorkoutPayload } from "@/lib/assignments";
import { areLinked } from "@/lib/messaging";

const MAX_EXERCISES = 20;

/** POST /api/assignments/workout { athleteId, exercises } — coach assigns a training plan */
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "coach") return forbidden();

  let body: { athleteId?: unknown; exercises?: unknown };
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
  if (!areLinked(user.id, athleteId)) return Response.json({ error: "not_linked" }, { status: 403 });

  const exercises: WorkoutPayload["exercises"] = [];
  for (const raw of body.exercises as Record<string, unknown>[]) {
    const nombre = typeof raw.nombre === "string" ? raw.nombre.trim() : "";
    if (!nombre) return Response.json({ error: "invalid_exercise" }, { status: 400 });
    exercises.push({
      nombre,
      target: Math.max(1, Math.round(Number(raw.target) || 3)),
      reps: Math.max(1, Math.round(Number(raw.reps) || 8)),
      peso: Math.max(0, Number(raw.peso) || 0),
      step: Math.max(0.5, Number(raw.step) || 2.5),
      restSeconds: Math.max(15, Math.round(Number(raw.restSeconds) || 90)),
    });
  }

  const version = assignWorkout(user.id, athleteId, { coachName: user.name, exercises });
  return Response.json({ ok: true, version });
}
