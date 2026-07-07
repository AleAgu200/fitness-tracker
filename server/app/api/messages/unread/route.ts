import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { unreadCounts } from "@/lib/messaging";

/** GET /api/messages/unread — unread totals grouped by sender */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  return Response.json(unreadCounts(user.id));
}
