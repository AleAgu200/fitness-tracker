import { listSubscriptions } from "@/lib/admin";
import { pageParam } from "@/lib/admin-http";
import { requireSuperAdmin } from "@/lib/api-auth";

export async function GET(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (admin instanceof Response) return admin;
  const params = new URL(request.url).searchParams;
  return Response.json(await listSubscriptions({
    status: params.get("status") ?? "all",
    q: params.get("q") ?? "",
    includeSandbox: params.get("sandbox") === "1",
    page: pageParam(params.get("page")),
  }));
}
