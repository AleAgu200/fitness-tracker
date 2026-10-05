import { readJson } from "@/lib/admin-http";
import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { leaveProfessional } from "@/lib/team-leave";

/** POST /api/links/leave { professionalId } — the athlete leaves that professional's team */
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  const professionalId = (await readJson(request))?.professionalId;
  if (typeof professionalId !== "string" || !professionalId) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await leaveProfessional(user.id, professionalId);
  if (!result.ok) return Response.json({ error: result.error }, { status: 404 });
  return Response.json({ ok: true });
}
