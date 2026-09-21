import { forbidden, getSessionUser, unauthorized } from "@/lib/api-auth";
import { AssignmentConflictError, assignMealPlan, MealPlanPayload } from "@/lib/assignments";
import { normalizeMeals, PlanPayloadError } from "@/lib/plan-payload";
import { requireCategoryAccess } from "@/lib/permissions";

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
  if (!athleteId) return Response.json({ error: "invalid_body" }, { status: 400 });

  const access = await requireCategoryAccess(user.id, athleteId, "nutrition");
  if (!access) return Response.json({ error: "nutrition_access_denied" }, { status: 403 });

  let meals: MealPlanPayload["meals"];
  try {
    meals = normalizeMeals(body.meals);
  } catch (error) {
    if (error instanceof PlanPayloadError) return Response.json({ error: error.code }, { status: 400 });
    throw error;
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
