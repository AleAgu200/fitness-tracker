import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { communityBarcodeProducts } from "@/db/schema";
import { communityProductSchema, draftFromCommunity, type CommunityProduct } from "@/lib/community-product";
import type { NutritionDraft } from "@/lib/nutrition-draft";

// PULSO's shared barcode catalog: products athletes added (by reading the
// label or typing it) for a code Open Food Facts doesn't have. Only product
// data is kept — no photo, nothing about the athlete beyond who contributed.

export { communityProductSchema };

/** The most recent contribution for this code, as a draft to review. */
export async function findCommunityProduct(barcode: string): Promise<NutritionDraft | null> {
  const [row] = await db.select({ product: communityBarcodeProducts.product })
    .from(communityBarcodeProducts)
    .where(eq(communityBarcodeProducts.barcode, barcode))
    .orderBy(desc(communityBarcodeProducts.updatedAt))
    .limit(1);
  const parsed = row ? communityProductSchema.safeParse(row.product) : null;
  return parsed?.success ? draftFromCommunity(barcode, parsed.data) : null;
}

/** Adds or replaces this athlete's own contribution for the code. */
export async function contributeCommunityProduct(barcode: string, userId: string, product: CommunityProduct, now = Date.now()): Promise<void> {
  await db.insert(communityBarcodeProducts)
    .values({ barcode, userId, product, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [communityBarcodeProducts.barcode, communityBarcodeProducts.userId],
      set: { product, updatedAt: now },
    });
}
