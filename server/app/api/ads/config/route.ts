import { getAdSettings } from "@/lib/ad-settings";

/**
 * GET /api/ads/config — where and how often the app shows ads. Public on purpose:
 * it only holds ad unit IDs (public in every build) and frequencies, and the app
 * needs it before sign-in too. Plus subscribers are filtered out on the device.
 */
export async function GET() {
  const { settings, updatedAt } = await getAdSettings();
  return Response.json({ ...settings, updatedAt }, { headers: { "cache-control": "public, max-age=300" } });
}
