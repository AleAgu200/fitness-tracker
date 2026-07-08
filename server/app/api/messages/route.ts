import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { areLinked, getConversation, sendMessage } from "@/lib/messaging";
import { pushProfessionalMessage } from "@/lib/push-notifications";

const MAX_CONTENT = 2000;

/** GET /api/messages?with=<userId>&since=<ms> — conversation with a linked user */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const other = url.searchParams.get("with");
  const since = Number(url.searchParams.get("since") ?? 0) || 0;
  if (!other) return Response.json({ error: "missing_with" }, { status: 400 });
  if (!areLinked(user.id, other)) return Response.json({ error: "not_linked" }, { status: 403 });

  return Response.json({ messages: getConversation(user.id, other, since) });
}

/** POST /api/messages { to, content } */
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  let to: unknown, content: unknown;
  try {
    ({ to, content } = await request.json());
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  if (typeof to !== "string" || typeof content !== "string" || !content.trim()) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  if (content.length > MAX_CONTENT) {
    return Response.json({ error: "content_too_long" }, { status: 400 });
  }
  if (!areLinked(user.id, to)) return Response.json({ error: "not_linked" }, { status: 403 });

  const cleanContent = content.trim();
  const message = sendMessage(user.id, to, cleanContent);
  try {
    await pushProfessionalMessage(user.id, to, cleanContent);
  } catch (error) {
    // The message is already persisted; push delivery is best-effort.
    console.error("[push-message]", error);
  }
  return Response.json({ message });
}
