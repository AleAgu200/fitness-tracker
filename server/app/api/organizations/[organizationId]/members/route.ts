import { z } from "zod";

import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { addOrganizationMember, listOrganizationMembers } from "@/lib/team-management";

const memberSchema = z.object({
  email: z.string().trim().email().max(320),
  orgRole: z.enum(["admin", "professional"]).default("professional"),
  disciplines: z.array(z.enum(["coach", "nutritionist"])).min(1).max(2),
});

export async function GET(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const session = await getSessionUser(request);
  if (!session) return unauthorized();
  const { organizationId } = await params;
  const members = await listOrganizationMembers(session.id, organizationId);
  if (!members) return Response.json({ error: "organization_manage_denied" }, { status: 403 });
  return Response.json({ members });
}

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const session = await getSessionUser(request);
  if (!session) return unauthorized();
  const parsed = memberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  const { organizationId } = await params;
  const result = await addOrganizationMember({ actorUserId: session.id, organizationId, ...parsed.data });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.error === "professional_must_register_first" ? 404 : 403 });
  return Response.json({ member: result.member }, { status: 201 });
}
