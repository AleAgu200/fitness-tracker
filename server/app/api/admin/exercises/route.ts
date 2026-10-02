import { adminSearchExercises, createCatalogExercise } from "@/lib/admin-catalog";
import { parseExerciseFields } from "@/lib/admin-catalog-input";
import { badRequest, pageParam, readJson } from "@/lib/admin-http";
import { requireSuperAdmin } from "@/lib/api-auth";
import { ensureCatalogOverlay } from "@/lib/catalog-overlay";

export async function GET(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (admin instanceof Response) return admin;
  const params = new URL(request.url).searchParams;
  await ensureCatalogOverlay();
  return Response.json(await adminSearchExercises(params.get("q") ?? "", pageParam(params.get("page"))));
}

export async function POST(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (admin instanceof Response) return admin;
  const body = await readJson(request);
  if (!body) return badRequest("invalid_body");
  const fields = parseExerciseFields(body);
  if ("error" in fields) return badRequest(fields.error);
  const id = await createCatalogExercise(admin.id, fields);
  return Response.json({ id }, { status: 201 });
}
