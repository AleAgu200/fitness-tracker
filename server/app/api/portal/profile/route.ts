import { z } from "zod";

import { forbidden, getSessionUser, unauthorized } from "@/lib/api-auth";
import { appendAuditEvent, legacyMembershipId, legacyOrganizationId } from "@/lib/organizations";
import {
  getProfessionalProfile,
  initializeProfessionalAccount,
  updateProfessionalProfile,
} from "@/lib/professional-profile";

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  organizationName: z.string().trim().min(2).max(100),
  headline: z.string().trim().max(120),
  bio: z.string().trim().max(1200),
  phone: z.string().trim().max(30).nullable(),
  location: z.string().trim().max(100).nullable(),
  timezone: z.string().trim().min(1).max(80),
  credentials: z.string().trim().max(500),
});

function isProfessional(role: string): role is "coach" | "nutritionist" {
  return role === "coach" || role === "nutritionist";
}

export async function GET(request: Request) {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser) return unauthorized();
  if (!isProfessional(sessionUser.role)) return forbidden();
  await initializeProfessionalAccount({
    userId: sessionUser.id,
    name: sessionUser.name,
    discipline: sessionUser.role,
  });
  return Response.json({ profile: await getProfessionalProfile(sessionUser.id) });
}

export async function PUT(request: Request) {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser) return unauthorized();
  if (!isProfessional(sessionUser.role)) return forbidden();
  let input: z.infer<typeof profileSchema>;
  try {
    input = profileSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  await initializeProfessionalAccount({
    userId: sessionUser.id,
    name: sessionUser.name,
    discipline: sessionUser.role,
  });
  await updateProfessionalProfile(sessionUser.id, input);
  await appendAuditEvent({
    organizationId: legacyOrganizationId(sessionUser.id),
    actorMembershipId: legacyMembershipId(sessionUser.id),
    actorUserId: sessionUser.id,
    action: "professional_profile.updated",
    subjectType: "professional",
    subjectId: sessionUser.id,
  });
  return Response.json({ profile: await getProfessionalProfile(sessionUser.id) });
}
