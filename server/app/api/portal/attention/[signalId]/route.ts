import { z } from "zod";

import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { updateAttentionSignal } from "@/lib/attention";

const updateSchema = z.object({
  status: z.enum(["acknowledged", "resolved", "dismissed"]),
  note: z.string().trim().max(1000).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ signalId: string }> }) {
  const session = await getSessionUser(request);
  if (!session) return unauthorized();
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  const { signalId } = await params;
  const ok = await updateAttentionSignal({ professionalUserId: session.id, signalId, ...parsed.data });
  if (!ok) return Response.json({ error: "signal_update_denied" }, { status: 403 });
  return Response.json({ ok: true });
}
