import { z } from "zod";

import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { getEntitlement, PULSO_PLUS } from "@/lib/entitlements";
import {
  LabelServiceUnavailableError,
  LabelUnreadableError,
  labelReadingConfigured,
  readNutritionLabel,
} from "@/lib/nutrition-label";

// Label photos are read online and never stored: the image lives only in this
// request, is not logged, and is not retried automatically. Reading labels is
// a PULSO Plus capability with no per-period quota; the one-at-a-time lock and
// size limit are capacity protections, not a hidden allowance.

/** ~4 MB of JPEG once decoded; the app resizes to 1600 px before sending. */
const MAX_BASE64_LENGTH = 5_600_000;
const inFlight = new Set<string>();

const bodySchema = z.object({
  image: z.string().min(100).max(MAX_BASE64_LENGTH).regex(/^[A-Za-z0-9+/=]+$/),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

/** GET — whether label reading is available to this athlete, before they take a photo. */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  const entitlement = await getEntitlement(user.id);
  return Response.json({ available: labelReadingConfigured(), entitled: entitlement.entitled });
}

/** POST { image: base64, mediaType } → { draft } to review before saving or logging. */
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  if (!labelReadingConfigured()) return Response.json({ error: "label_service_unavailable" }, { status: 503 });

  const entitlement = await getEntitlement(user.id);
  if (!entitlement.entitled) {
    return Response.json({ error: "subscription_required", reason: "label_reading", entitlement: PULSO_PLUS }, { status: 402 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_image" }, { status: 400 });

  if (inFlight.has(user.id)) return Response.json({ error: "label_in_progress" }, { status: 429 });
  inFlight.add(user.id);
  try {
    const draft = await readNutritionLabel(parsed.data.image, parsed.data.mediaType);
    return Response.json({ draft });
  } catch (error) {
    if (error instanceof LabelUnreadableError) return Response.json({ error: error.message }, { status: 422 });
    if (error instanceof LabelServiceUnavailableError) return Response.json({ error: error.message }, { status: 503 });
    console.error("[nutrition-label] unexpected failure", { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: "label_failed" }, { status: 500 });
  } finally {
    inFlight.delete(user.id);
  }
}
