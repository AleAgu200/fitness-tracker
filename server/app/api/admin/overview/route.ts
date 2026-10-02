import { adminOverview } from "@/lib/admin";
import { requireSuperAdmin } from "@/lib/api-auth";

export async function GET(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (admin instanceof Response) return admin;
  return Response.json(await adminOverview());
}
