import { badRequest, readJson } from "@/lib/admin-http";
import { requireSuperAdmin } from "@/lib/api-auth";
import { closeReport } from "@/lib/user-reports";

/** POST /api/admin/reports/:id { decision: "resolved" | "dismissed", note? } */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdmin(request);
  if (admin instanceof Response) return admin;
  const body = await readJson(request);
  const decision = body?.decision;
  if (decision !== "resolved" && decision !== "dismissed") return badRequest("invalid_decision");
  const note = typeof body?.note === "string" ? body.note : undefined;
  const closed = await closeReport(admin, (await params).id, decision, note);
  if (!closed) return Response.json({ error: "report_not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
