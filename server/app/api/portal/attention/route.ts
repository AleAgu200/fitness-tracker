import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { listAttentionSignals } from "@/lib/attention";

export async function GET(request: Request) {
  const session = await getSessionUser(request);
  if (!session) return unauthorized();
  if (session.role !== "coach" && session.role !== "nutritionist") {
    return Response.json({ error: "professional_only" }, { status: 403 });
  }
  const params = new URL(request.url).searchParams;
  const limit = Number(params.get("limit") ?? 50);
  const offset = Number(params.get("offset") ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) {
    return Response.json({ error: "invalid_pagination" }, { status: 400 });
  }
  const status = params.getAll("status");
  const signals = await listAttentionSignals(session.id, { limit, offset, status });
  return Response.json({ signals, pagination: { limit: Math.min(100, Math.max(1, limit)), offset, hasMore: signals.length === limit } });
}
