import { z } from "zod";

import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { reviewCheckin } from "@/lib/checkins";

const reviewSchema = z.object({
  action: z.enum(["message", "task", "plan_adjustment", "no_changes"]),
  note: z.string().trim().max(2000).optional(),
  message: z.string().trim().max(4000).optional(),
  taskTitle: z.string().trim().max(200).optional(),
  taskDueAt: z.number().int().positive().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getSessionUser(request);
  if (!session) return unauthorized();
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  const { requestId } = await params;
  const review = await reviewCheckin({ professionalUserId: session.id, requestId, ...parsed.data });
  if (!review) return Response.json({ error: "checkin_review_denied" }, { status: 403 });
  return Response.json({ review });
}
