import { z } from "zod";

import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { setAthleteSharingConsent } from "@/lib/team-management";

const consentSchema = z.object({
  organizationId: z.string().min(1).max(128),
  category: z.enum(["training", "nutrition", "metrics", "checkins", "photos"]),
  granted: z.boolean(),
});

export async function PUT(request: Request) {
  const session = await getSessionUser(request);
  if (!session) return unauthorized();
  if (session.role !== "athlete") return Response.json({ error: "athlete_only" }, { status: 403 });
  const parsed = consentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  const consent = await setAthleteSharingConsent({ athleteUserId: session.id, ...parsed.data });
  if (!consent) return Response.json({ error: "organization_client_not_found" }, { status: 404 });
  return Response.json({ consent });
}
