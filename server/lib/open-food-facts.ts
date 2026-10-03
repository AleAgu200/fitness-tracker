import { eq } from "drizzle-orm";

import { db } from "@/db";
import { foodBarcodeCache } from "@/db/schema";
import { findCommunityProduct } from "@/lib/community-barcodes";
import { draftFromOpenFoodFacts, isValidBarcode, NutritionDraft, OpenFoodFactsProduct } from "@/lib/nutrition-draft";

// Barcode lookup against Open Food Facts (public, ODbL). Server-side so the
// app sends only the code, results are cached for everyone, and nothing about
// the athlete — never their photos — reaches the catalog.

const FOUND_TTL_MS = 30 * 86_400_000;
const MISS_TTL_MS = 3 * 86_400_000;
const TIMEOUT_MS = 6000;
const FIELDS = "product_name,product_name_es,brands,quantity,product_quantity_unit,serving_size,serving_quantity,nutriments";

export type BarcodeLookup =
  | { status: "found"; draft: NutritionDraft }
  | { status: "not_found" }
  | { status: "invalid" }
  | { status: "unavailable" };

async function fetchProduct(barcode: string): Promise<{ found: boolean; product: OpenFoodFactsProduct | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${FIELDS}`, {
      // Open Food Facts asks every client to identify itself.
      headers: { "User-Agent": "PULSO/1.0 (pulso@pulsofitness.tech)" },
      signal: controller.signal,
    });
    if (res.status === 404) return { found: false, product: null };
    if (!res.ok) throw new Error(`off_http_${res.status}`);
    const body = await res.json() as { status?: number; product?: OpenFoodFactsProduct };
    return body.status === 1 && body.product ? { found: true, product: body.product } : { found: false, product: null };
  } finally {
    clearTimeout(timer);
  }
}

/** A product with no energy and no macros is as good as not found. */
function hasNutrition(draft: NutritionDraft): boolean {
  return ["kcal", "proteinG", "carbsG", "fatG"].some(key => draft.nutrients[key as keyof typeof draft.nutrients] != null);
}

/**
 * Open Food Facts first; when it doesn't have the product (or can't be
 * reached), what PULSO athletes contributed for that code.
 */
export async function lookupBarcode(barcode: string, now = Date.now()): Promise<BarcodeLookup> {
  if (!isValidBarcode(barcode)) return { status: "invalid" };
  const fromCatalog = await lookupOpenFoodFacts(barcode, now);
  if (fromCatalog.status === "found") return fromCatalog;
  const fromCommunity = await findCommunityProduct(barcode);
  return fromCommunity ? { status: "found", draft: fromCommunity } : fromCatalog;
}

async function lookupOpenFoodFacts(barcode: string, now: number): Promise<BarcodeLookup> {
  const [cached] = await db.select().from(foodBarcodeCache).where(eq(foodBarcodeCache.barcode, barcode)).limit(1);
  const fresh = cached && now - cached.fetchedAt < (cached.found ? FOUND_TTL_MS : MISS_TTL_MS);
  let found = cached?.found ?? false;
  let product = (cached?.product ?? null) as OpenFoodFactsProduct | null;

  if (!fresh) {
    try {
      ({ found, product } = await fetchProduct(barcode));
      await db.insert(foodBarcodeCache).values({ barcode, found, product, fetchedAt: now })
        .onConflictDoUpdate({ target: foodBarcodeCache.barcode, set: { found, product, fetchedAt: now } });
    } catch (error) {
      console.warn("[open-food-facts] lookup failed", { barcode, error: error instanceof Error ? error.message : String(error) });
      // A stale answer beats none; with nothing cached the app offers the label or manual entry.
      if (!cached) return { status: "unavailable" };
    }
  }
  if (!found || !product) return { status: "not_found" };
  const draft = draftFromOpenFoodFacts(product, barcode);
  return hasNutrition(draft) ? { status: "found", draft } : { status: "not_found" };
}
