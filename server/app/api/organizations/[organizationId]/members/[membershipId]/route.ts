import { z } from "zod";

import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { revokeOrganizationMember, setMemberDisciplines } from "@/lib/team-management";

const disciplinesSchema = z.object({
  disciplines: z.array(z.enum(["coach", "nutritionist"])).min(1).max(2),
});

const STATUS_BY_ERROR: Record<string, number> = {
  organization_manage_denied: 403,
  member_not_found: 404,
  assignment_not_found: 404,
  last_owner: 409,
  discipline_has_active_assignments: 409,
};

/** PATCH { disciplines } — change which disciplines a member can practise. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ organizationId: string; membershipId: string }> },
) {
  const session = await getSessionUser(request);
  if (!session) return unauthorized();
  const parsed = disciplinesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });

  const { organizationId, membershipId } = await params;
  const result = await setMemberDisciplines({
    actorUserId: session.id,
    organizationId,
    membershipId,
    disciplines: parsed.data.disciplines,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: STATUS_BY_ERROR[result.error] ?? 400 });
  return Response.json({ disciplines: result.disciplines });
}

/** DELETE — deactivate the member and release their athletes. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ organizationId: string; membershipId: string }> },
) {
  const session = await getSessionUser(request);
  if (!session) return unauthorized();
  const { organizationId, membershipId } = await params;

  const result = await revokeOrganizationMember({ actorUserId: session.id, organizationId, membershipId });
  if (!result.ok) return Response.json({ error: result.error }, { status: STATUS_BY_ERROR[result.error] ?? 400 });
  // `uncovered` lists athletes who just lost their primary — the caller is
  // expected to surface it, not to treat the revocation as fully complete.
  return Response.json({ ok: true, releasedAssignments: result.releasedAssignments, uncovered: result.uncovered });
}
