import { requireSuperAdmin } from "@/lib/api-auth";
import { listReports, type ReportStatusFilter } from "@/lib/user-reports";

const STATUSES: readonly ReportStatusFilter[] = ["open", "resolved", "dismissed", "all"];

export async function GET(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (admin instanceof Response) return admin;
  const status = new URL(request.url).searchParams.get("status") ?? "open";
  const filter = (STATUSES as readonly string[]).includes(status) ? status as ReportStatusFilter : "open";
  return Response.json({ reports: await listReports(filter) });
}
