import { listUsers, USER_STATUS_FILTERS, UserStatusFilter } from "@/lib/admin";
import { pageParam } from "@/lib/admin-http";
import { requireSuperAdmin } from "@/lib/api-auth";

export async function GET(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (admin instanceof Response) return admin;
  const params = new URL(request.url).searchParams;
  const status = params.get("status") ?? "all";
  return Response.json(await listUsers({
    q: params.get("q") ?? "",
    role: params.get("role") ?? "all",
    status: (USER_STATUS_FILTERS as readonly string[]).includes(status) ? status as UserStatusFilter : "all",
    page: pageParam(params.get("page")),
  }));
}
