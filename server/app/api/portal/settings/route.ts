import { z } from "zod";

import { forbidden, getSessionUser, profileDiscipline, unauthorized } from "@/lib/api-auth";
import { appendAuditEvent, legacyMembershipId, legacyOrganizationId } from "@/lib/organizations";
import {
  getProfessionalSettings,
  initializeProfessionalAccount,
  updateProfessionalSettings,
} from "@/lib/professional-profile";
import { availablePortalSections } from "@/lib/portal-access";

const settingsSchema = z.object({
  emailNotifications: z.boolean(),
  attentionDigest: z.boolean(),
  weeklySummary: z.boolean(),
  defaultPortalSection: z.enum(["attention", "athletes", "foods", "exercises"]),
});


export async function GET(request: Request) {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser) return unauthorized();
  const discipline = profileDiscipline(sessionUser);
  if (!discipline) return forbidden();
  await initializeProfessionalAccount({
    userId: sessionUser.id,
    name: sessionUser.name,
    discipline,
  });
  return Response.json({ settings: await getProfessionalSettings(sessionUser.id) });
}

export async function PUT(request: Request) {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser) return unauthorized();
  const discipline = profileDiscipline(sessionUser);
  if (!discipline) return forbidden();
  let input: z.infer<typeof settingsSchema>;
  try {
    input = settingsSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!availablePortalSections(discipline).includes(input.defaultPortalSection)) return forbidden();
  await initializeProfessionalAccount({
    userId: sessionUser.id,
    name: sessionUser.name,
    discipline,
  });
  await updateProfessionalSettings(sessionUser.id, input);
  await appendAuditEvent({
    organizationId: legacyOrganizationId(sessionUser.id),
    actorMembershipId: legacyMembershipId(sessionUser.id),
    actorUserId: sessionUser.id,
    action: "professional_settings.updated",
    subjectType: "professional",
    subjectId: sessionUser.id,
  });
  return Response.json({ settings: await getProfessionalSettings(sessionUser.id) });
}
