import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { lookupBarcode } from "@/lib/open-food-facts";

/**
 * GET /api/nutrition/barcode/:code — a product draft to review before saving
 * or logging. Free for every athlete: it only reads a public catalog.
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
