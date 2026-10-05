import { readJson } from "@/lib/admin-http";
import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { createReport, REPORT_REASONS, type ReportReason } from "@/lib/user-reports";

/** POST /api/reports { reportedUserId, reason, detail? } — report someone you talk to */
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  const body = await readJson(request);
  const reportedUserId = body?.reportedUserId;
  const reason = body?.reason;
  const detail = typeof body?.detail === "string" ? body.detail : null;
  if (typeof reportedUserId !== "string" || !reportedUserId || !(REPORT_REASONS as readonly unknown[]).includes(reason)) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await createReport({ reporterId: user.id, reportedUserId, reason: reason as ReportReason, detail });
  if (!result.ok) {
    const status = result.error === "too_many_reports" ? 429 : result.error === "not_related" ? 403 : 400;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json({ ok: true });
}
