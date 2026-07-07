import { forbidden, getSessionUser, unauthorized } from "@/lib/api-auth";
import { createExercise, listExercises } from "@/lib/library";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ exercises: listExercises(q) });
}

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "coach") return forbidden();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const muscleGroup = typeof body.muscleGroup === "string" ? body.muscleGroup : "otro";
  const equipment = typeof body.equipment === "string" ? body.equipment : "otro";
  if (!name) return Response.json({ error: "invalid_body" }, { status: 400 });

  return Response.json({ exercise: createExercise(user.id, { name, muscleGroup, equipment }) });
}
