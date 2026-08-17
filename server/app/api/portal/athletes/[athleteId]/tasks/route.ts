import { z } from "zod";

import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { createFollowUpTask } from "@/lib/overview";

const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  detail: z.string().trim().max(2000).optional(),
  dueAt: z.number().int().positive().optional(),
  attentionSignalId: z.string().max(128).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ athleteId: string }> }) {
  const session = await getSessionUser(request);
  if (!session) return unauthorized();
  const parsed = taskSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  const { athleteId } = await params;
  const task = await createFollowUpTask({ professionalUserId: session.id, athleteId, ...parsed.data });
  if (!task) return Response.json({ error: "task_access_denied" }, { status: 403 });
  return Response.json({ task }, { status: 201 });
}
