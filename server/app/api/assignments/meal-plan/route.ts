import { forbidden, getSessionUser, unauthorized } from "@/lib/api-auth";
import { AssignmentConflictError, assignMealPlan, MealPlanPayload } from "@/lib/assignments";
import { requireCategoryAccess } from "@/lib/permissions";

const MAX_MEALS = 10;

/** POST /api/assignments/meal-plan { athleteId, meals } — nutritionist assigns a meal plan */
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "nutritionist") return forbidden();

  let body: { athleteId?: unknown; meals?: unknown; baseVersion?: unknown; effectiveAt?: unknown; endsAt?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const athleteId = typeof body.athleteId === "string" ? body.athleteId : null;
  if (!athleteId || !Array.isArray(body.meals) || body.meals.length === 0) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  if (body.meals.length > MAX_MEALS) {
    return Response.json({ error: "too_many_meals" }, { status: 400 });
  }
  const access = await requireCategoryAccess(user.id, athleteId, "nutrition");
  if (!access) return Response.json({ error: "nutrition_access_denied" }, { status: 403 });

  const meals: MealPlanPayload["meals"] = [];
  for (const raw of body.meals as Record<string, unknown>[]) {
    const label = typeof raw.label === "string" ? raw.label.trim().toUpperCase() : "";
    const n = typeof raw.n === "string" ? raw.n.trim() : "";
    if (!label || !n) return Response.json({ error: "invalid_meal" }, { status: 400 });
    const items = Array.isArray(raw.items)
      ? (raw.items as Record<string, unknown>[])
          .filter(it => typeof it.name === "string" && Number(it.grams) > 0)
          .map(it => ({
            foodId: typeof it.foodId === "string" ? it.foodId : "",
            name: (it.name as string).trim(),
            grams: Math.round(Number(it.grams)),
          }))
      : undefined;
    meals.push({
      label,
      time: typeof raw.time === "string" ? raw.time.trim() : "",
      n,
      kcal: Math.max(0, Math.round(Number(raw.kcal) || 0)),
      p: Math.max(0, Math.round(Number(raw.p) || 0)),
      c: Math.max(0, Math.round(Number(raw.c) || 0)),
      g: Math.max(0, Math.round(Number(raw.g) || 0)),
      items,
    });
  }

  try {
    const version = await assignMealPlan(user.id, athleteId, { nutritionistName: user.name, meals }, {
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
