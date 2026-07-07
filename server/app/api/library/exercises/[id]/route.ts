import { forbidden, getSessionUser, unauthorized } from "@/lib/api-auth";
import { deleteExercise, updateExercise } from "@/lib/library";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "coach") return forbidden();
  const { id } = await params;

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

  const ok = updateExercise(user.id, id, { name, muscleGroup, equipment });
  if (!ok) return Response.json({ error: "not_editable" }, { status: 403 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "coach") return forbidden();
  const { id } = await params;

  const ok = deleteExercise(user.id, id);
  if (!ok) return Response.json({ error: "not_editable" }, { status: 403 });
  return Response.json({ ok: true });
}
