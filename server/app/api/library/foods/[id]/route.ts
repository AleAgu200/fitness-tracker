import { forbidden, getSessionUser, unauthorized } from "@/lib/api-auth";
import { deleteFood, updateFood } from "@/lib/library";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "nutritionist") return forbidden();
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const category = typeof body.category === "string" ? body.category : "otro";
  const nums = [body.kcal, body.proteinG, body.carbsG, body.fatG].map(v => Math.max(0, Number(v) || 0));
  if (!name) return Response.json({ error: "invalid_body" }, { status: 400 });

  const ok = await updateFood(user.id, id, {
    name, category, kcal: nums[0], proteinG: nums[1], carbsG: nums[2], fatG: nums[3],
  });
  if (!ok) return Response.json({ error: "not_editable" }, { status: 403 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "nutritionist") return forbidden();
  const { id } = await params;

  const ok = await deleteFood(user.id, id);
  if (!ok) return Response.json({ error: "not_editable" }, { status: 403 });
  return Response.json({ ok: true });
}
