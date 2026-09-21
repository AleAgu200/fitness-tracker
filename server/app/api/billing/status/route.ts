import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { canGeneratePlan, getEntitlement } from "@/lib/entitlements";
import { applyEntitlement, fetchSubscriber } from "@/lib/revenuecat";

/** GET — what this athlete is currently entitled to, and their free AI quota. */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  const [entitlement, allowance] = await Promise.all([
    getEntitlement(user.id),
    canGeneratePlan(user.id),
  ]);
  return Response.json({ entitlement, allowance });
}

/**
 * POST — re-read RevenueCat for this user and store the result.
 *
 * Called by the app right after a purchase or restore. The webhook is
 * asynchronous, so without this an athlete who just paid could still be
 * refused. Nothing from the request body is trusted: the entitlement is
 * fetched server-side with the secret key, keyed on the session's own user id.
 */
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  const entitlement = await fetchSubscriber(user.id);
  if (!entitlement) {
    return Response.json({ error: "billing_unavailable" }, { status: 503 });
  }

  await applyEntitlement({ userId: user.id, entitlement, payload: { source: "client_sync" } });
  const [current, allowance] = await Promise.all([
    getEntitlement(user.id),
    canGeneratePlan(user.id),
  ]);
  return Response.json({ entitlement: current, allowance });
}
