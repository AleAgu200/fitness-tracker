import { revertCatalogExercise, setCatalogExerciseHidden, updateCatalogExercise } from "@/lib/admin-catalog";
import { parseExerciseFields } from "@/lib/admin-catalog-input";
import { badRequest, readJson } from "@/lib/admin-http";
import { requireSuperAdmin } from "@/lib/api-auth";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const admin = await requireSuperAdmin(request);
  if (admin instanceof Response) return admin;
  const body = await readJson(request);
  if (!body) return badRequest("invalid_body");
  const fields = parseExerciseFields(body);
  if ("error" in fields) return badRequest(fields.error);
  const ok = await updateCatalogExercise(admin.id, (await params).id, fields);
  return ok ? Response.json({ ok }) : badRequest("not_found", 404);
}

/** { hidden: boolean } hides or shows; { revert: true } drops the override. */
export async function PATCH(request: Request, { params }: Params) {
  const admin = await requireSuperAdmin(request);
  if (admin instanceof Response) return admin;
  const body = await readJson(request);
  const id = (await params).id;
  let ok: boolean;
  if (body?.revert === true) ok = await revertCatalogExercise(admin.id, id);
  else if (typeof body?.hidden === "boolean") ok = await setCatalogExerciseHidden(admin.id, id, body.hidden);
  else return badRequest("invalid_body");
  return ok ? Response.json({ ok }) : badRequest("not_found", 404);
}
