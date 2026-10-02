import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";
import { billingIssueEmail, emailEnabled, plusActivatedEmail, sendEmail, subscriptionEndedEmail } from "@/lib/email";
import { applyEntitlement, normalizeEvent, recordEvent, verifyWebhookAuthorization } from "@/lib/revenuecat";
import { billingEmailFor } from "@/lib/revenuecat-events";

export const runtime = "nodejs";

/**
 * RevenueCat webhook. The app user id is the PULSO user id (set via
 * Purchases.logIn), which is how an event maps back to an account.
 *
 * Always answers 200 for deliveries we understand but cannot act on — a 4xx
 * makes RevenueCat retry forever on events that will never become valid.
 */
export async function POST(request: Request) {
  if (!verifyWebhookAuthorization(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { event?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const event = body.event;
  const eventId = typeof event?.id === "string" ? event.id : null;
  const eventType = typeof event?.type === "string" ? event.type : null;
  const appUserId = typeof event?.app_user_id === "string" ? event.app_user_id : null;
  if (!event || !eventId || !eventType) {
    return Response.json({ error: "invalid_event" }, { status: 400 });
  }

  const [account] = appUserId
    ? await db.select({ id: user.id, email: user.email, name: user.name }).from(user).where(eq(user.id, appUserId)).limit(1)
    : [];

  const fresh = await recordEvent({
    eventId,
    userId: account?.id ?? null,
    eventType,
    appUserId,
    payload: event,
  });
  // A replayed delivery has already been applied; acknowledging is enough.
  if (!fresh) return Response.json({ ok: true, duplicate: true });

  if (!account) return Response.json({ ok: true, ignored: "unknown_app_user" });

  const entitlement = normalizeEvent(event);
  if (!entitlement) return Response.json({ ok: true, ignored: "unmapped_event_type" });

  await applyEntitlement({ userId: account.id, entitlement, eventId, payload: event });

  // Only fresh deliveries reach this point, so a retried webhook never mails twice.
  const kind = billingEmailFor(eventType);
  if (kind && emailEnabled()) {
    const ends = entitlement.currentPeriodEndsAt;
    await sendEmail(
      kind === "activated" ? plusActivatedEmail(account.email, account.name, ends, false)
        : kind === "billing_issue" ? billingIssueEmail(account.email, account.name, ends)
          : subscriptionEndedEmail(account.email, account.name, kind, ends),
    );
  }
  return Response.json({ ok: true });
}
