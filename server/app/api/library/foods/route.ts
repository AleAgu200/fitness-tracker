import { forbidden, getSessionUser, unauthorized } from "@/lib/api-auth";
import { createFood, listFoods } from "@/lib/library";

// Any professional can browse foods; only nutritionists can modify them
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ foods: await listFoods(q) });
}

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "nutritionist") return forbidden();

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

  const food = await createFood(user.id, {
    name, category, kcal: nums[0], proteinG: nums[1], carbsG: nums[2], fatG: nums[3],
  });
  return Response.json({ food });
}
