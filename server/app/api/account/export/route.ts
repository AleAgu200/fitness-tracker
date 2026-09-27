import { exportAccountData } from "@/lib/account";
import { getSessionUser, unauthorized } from "@/lib/api-auth";

/** GET /api/account/export — everything the server holds about the caller. Free, never paywalled. */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  const data = await exportAccountData(user.id);
  if (!data) return unauthorized();
  return Response.json(
    { exportedAt: Date.now(), source: "server", ...data },
    { headers: { "Cache-Control": "no-store" } },
  );
}
