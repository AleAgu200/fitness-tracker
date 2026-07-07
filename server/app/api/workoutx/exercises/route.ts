import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { mapEquipment, mapMuscleGroup, searchExercises } from "@/lib/workoutx";

/**
 * GET /api/workoutx/exercises?q=<name> — proxied WorkoutX search (key stays server-side).
 * Available to any signed-in user (athletes use it for suggestions in the app).
 */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) return Response.json({ exercises: [] });

  try {
    const results = await searchExercises(q);
    return Response.json({
      exercises: results.map(e => ({
        id: e.id,
        name: e.name,
        bodyPart: e.bodyPart,
        target: e.target,
        equipment: e.equipment,
        // Never expose WorkoutX's authenticated URL to the browser.
        gifUrl: e.gifUrl ? `/api/workoutx/gifs/${encodeURIComponent(e.id)}.gif` : null,
        muscleGroup: mapMuscleGroup(e.bodyPart),
        localEquipment: mapEquipment(e.equipment),
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "workoutx_error";
    const status = msg === "workoutx_429" ? 429 : msg === "workoutx_key_missing" ? 503 : 502;
    return Response.json({ error: msg }, { status });
  }
}
