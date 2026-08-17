import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { pullChanges } from "@/lib/sync";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  const params = new URL(request.url).searchParams;
  const requestedAthleteId = params.get("athleteId");
  if (requestedAthleteId && requestedAthleteId !== user.id) {
    return Response.json({ error: "cross_user_sync_forbidden" }, { status: 403 });
  }
  const ackRaw = params.get("ackSequence");
  const ackSequence = ackRaw == null ? null : Number(ackRaw);
  if (ackSequence != null && (!Number.isSafeInteger(ackSequence) || ackSequence < 0)) {
    return Response.json({ error: "invalid_ack_sequence" }, { status: 400 });
  }
  const limit = Number(params.get("limit") ?? 100);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return Response.json({ error: "invalid_limit" }, { status: 400 });
  }
  const result = await pullChanges({
    athleteId: user.id,
    cursor: params.get("cursor"),
    deviceId: params.get("deviceId"),
    ackSequence,
    limit,
  });
  if (!result) return Response.json({ error: "invalid_cursor" }, { status: 400 });
  return Response.json(result);
}
