import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { communityProductSchema, contributeCommunityProduct } from "@/lib/community-barcodes";
import { isValidBarcode } from "@/lib/nutrition-draft";
import { lookupBarcode } from "@/lib/open-food-facts";

/**
 * GET /api/nutrition/barcode/:code — a product draft to review before saving
 * or logging. Free for every athlete: it only reads public and shared data
 * (Open Food Facts first, then what PULSO athletes contributed).
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  const { code } = await params;
  const result = await lookupBarcode(code.trim());
  switch (result.status) {
    case "found": return Response.json({ draft: result.draft });
    case "invalid": return Response.json({ error: "invalid_barcode" }, { status: 400 });
    case "not_found": return Response.json({ error: "not_found" }, { status: 404 });
    case "unavailable": return Response.json({ error: "catalog_unavailable" }, { status: 503 });
  }
}

/**
 * POST /api/nutrition/barcode/:code — adds the product this athlete reviewed
 * for a code the catalog didn't have, so the next scan finds it for everyone.
 * Each athlete only replaces their own contribution.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  const code = (await params).code.trim();
  if (!isValidBarcode(code)) return Response.json({ error: "invalid_barcode" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = communityProductSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_product" }, { status: 400 });

  await contributeCommunityProduct(code, user.id, parsed.data);
  return Response.json({ ok: true }, { status: 201 });
}
