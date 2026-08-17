import { z } from "zod";

import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { assignProfessional } from "@/lib/team-management";

const assignmentSchema = z.object({
  organizationId: z.string().min(1).max(128),
  athleteId: z.string().min(1).max(128),
  professionalMembershipId: z.string().min(1).max(128),
  discipline: z.enum(["coach", "nutritionist"]),
  primary: z.boolean().default(false),
});

export async function POST(request: Request) {
  const session = await getSessionUser(request);
  if (!session) return unauthorized();
  const parsed = assignmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  const result = await assignProfessional({ actorUserId: session.id, ...parsed.data });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.error === "organization_manage_denied" ? 403 : 409 });
  return Response.json({ assignment: result.assignment }, { status: 201 });
}
