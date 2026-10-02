import { adminCreateFood, adminListFoods } from "@/lib/admin-catalog";
import { parseFoodFields } from "@/lib/admin-catalog-input";
import { badRequest, readJson } from "@/lib/admin-http";
import { requireSuperAdmin } from "@/lib/api-auth";

export async function GET(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (admin instanceof Response) return admin;
  const params = new URL(request.url).searchParams;
  const scope = params.get("scope");
  return Response.json({
    foods: await adminListFoods(params.get("q") ?? "", scope === "base" || scope === "custom" ? scope : "all"),
  });
}

export async function POST(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (admin instanceof Response) return admin;
  const body = await readJson(request);
  if (!body) return badRequest("invalid_body");
  const fields = parseFoodFields(body);
  if ("error" in fields) return badRequest(fields.error);
  const result = await adminCreateFood(admin.id, fields);
  if ("error" in result) return badRequest(result.error ?? "duplicate_name", 409);
  return Response.json(result, { status: 201 });
}
