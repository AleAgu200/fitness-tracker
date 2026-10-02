import { listProfessionals } from "@/lib/admin";
import { requireSuperAdmin } from "@/lib/api-auth";

const STATUSES = ["pending", "approved", "rejected", "all"] as const;

export async function GET(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (admin instanceof Response) return admin;
  const status = new URL(request.url).searchParams.get("status") ?? "pending";
  const filter = (STATUSES as readonly string[]).includes(status) ? status as typeof STATUSES[number] : "pending";
  return Response.json({ professionals: await listProfessionals(filter) });
}
