import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { markConversationRead } from "@/lib/messaging";

/** POST /api/messages/read { with } — mark all incoming from that user as read */
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  let withId: unknown;
  try {
    ({ with: withId } = await request.json());
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  if (typeof withId !== "string") return Response.json({ error: "invalid_body" }, { status: 400 });

  await markConversationRead(user.id, withId);
  return Response.json({ ok: true });
}
