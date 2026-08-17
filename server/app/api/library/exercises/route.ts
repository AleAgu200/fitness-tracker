import { forbidden, getSessionUser, unauthorized } from "@/lib/api-auth";
import { createExercise, listExercises } from "@/lib/library";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role === "nutritionist") return forbidden();
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ exercises: await listExercises(q) });
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
  const instructions = typeof body.instructions === "string" ? body.instructions.trim().slice(0, 2000) : null;
  const source = body.source === "workoutx" ? "workoutx" as const : "custom" as const;
  const externalId = typeof body.externalId === "string" ? body.externalId.slice(0, 160) : null;
  const mediaUrl = safeHttpUrl(body.mediaUrl);
  if (!name) return Response.json({ error: "invalid_body" }, { status: 400 });

  const result = await createExercise(user.id, { name, muscleGroup, equipment, instructions, source, externalId, mediaUrl });
  return Response.json(result, { status: result.duplicate ? 200 : 201 });
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
