import { z } from "zod";

import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { createCheckinRequest } from "@/lib/checkins";

const requestSchema = z.object({
  athleteId: z.string().min(1).max(128),
  dueAt: z.number().int().positive(),
  discipline: z.enum(["coach", "nutritionist"]).optional(),
});

export async function POST(request: Request) {
  const session = await getSessionUser(request);
  if (!session) return unauthorized();
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  const checkin = await createCheckinRequest({ professionalUserId: session.id, ...parsed.data });
  if (!checkin) return Response.json({ error: "checkin_access_denied" }, { status: 403 });
  return Response.json({ checkin }, { status: 201 });
}
