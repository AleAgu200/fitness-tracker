import { adminDeleteFood, adminUpdateFood } from "@/lib/admin-catalog";
import { parseFoodFields } from "@/lib/admin-catalog-input";
import { badRequest, readJson } from "@/lib/admin-http";
import { requireSuperAdmin } from "@/lib/api-auth";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const admin = await requireSuperAdmin(request);
  if (admin instanceof Response) return admin;
  const body = await readJson(request);
  if (!body) return badRequest("invalid_body");
  const fields = parseFoodFields(body);
  if ("error" in fields) return badRequest(fields.error);
  const ok = await adminUpdateFood(admin.id, (await params).id, fields);
  return ok ? Response.json({ ok }) : badRequest("not_found", 404);
}

export async function DELETE(request: Request, { params }: Params) {
  const admin = await requireSuperAdmin(request);
  if (admin instanceof Response) return admin;
  const ok = await adminDeleteFood(admin.id, (await params).id);
  return ok ? Response.json({ ok }) : badRequest("not_found", 404);
}
