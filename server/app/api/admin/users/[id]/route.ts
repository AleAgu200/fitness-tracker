import { applyUserAction, getUserDetail } from "@/lib/admin";
import { adminErrorResponse, badRequest, readJson } from "@/lib/admin-http";
import { AdminUserAction, ASSIGNABLE_ROLES, AssignableRole } from "@/lib/admin-policy";
import { requireSuperAdmin } from "@/lib/api-auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const admin = await requireSuperAdmin(request);
  if (admin instanceof Response) return admin;
  const detail = await getUserDetail((await params).id);
  if (!detail) return badRequest("user_not_found", 404);
  return Response.json(detail);
}

function parseAction(body: Record<string, unknown>): AdminUserAction | null {
  if (body.action === "suspend") {
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    return { action: "suspend", reason: reason || undefined };
  }
  if (body.action === "reactivate") return { action: "reactivate" };
  if (body.action === "set_role" && (ASSIGNABLE_ROLES as readonly string[]).includes(String(body.role))) {
    return { action: "set_role", role: body.role as AssignableRole };
  }
  return null;
}

export async function PATCH(request: Request, { params }: Params) {
  const admin = await requireSuperAdmin(request);
  if (admin instanceof Response) return admin;
  const body = await readJson(request);
  const action = body && parseAction(body);
  if (!action) return badRequest("invalid_action");
  const id = (await params).id;
  try {
    await applyUserAction(admin, id, action);
  } catch (error) {
    return adminErrorResponse(error);
  }
  return Response.json(await getUserDetail(id));
}
