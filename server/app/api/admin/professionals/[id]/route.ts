import { reviewProfessional } from "@/lib/admin";
import { adminErrorResponse, badRequest, readJson } from "@/lib/admin-http";
import { requireSuperAdmin } from "@/lib/api-auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdmin(request);
  if (admin instanceof Response) return admin;
  const body = await readJson(request);
  const decision = body?.decision;
  if (decision !== "approve" && decision !== "reject") return badRequest("invalid_decision");
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
  try {
    await reviewProfessional(admin, (await params).id, decision, reason || undefined);
  } catch (error) {
    return adminErrorResponse(error);
  }
  return Response.json({ ok: true });
}
