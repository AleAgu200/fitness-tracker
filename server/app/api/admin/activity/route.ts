import { recentAdminActivity } from "@/lib/admin";
import { requireSuperAdmin } from "@/lib/api-auth";

export async function GET(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (admin instanceof Response) return admin;
  const limit = Math.min(200, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 50));
  return Response.json({ events: await recentAdminActivity(limit) });
}
