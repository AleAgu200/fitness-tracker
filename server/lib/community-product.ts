import { z } from "zod";

import { NUTRIENT_KEYS, NutritionDraft } from "@/lib/nutrition-draft";

// What a shared barcode contribution may contain, and how it becomes a draft.
// No I/O, so it is unit-tested (community-product.test.ts).

export const COMMUNITY_ATTRIBUTION = "Aportado por la comunidad PULSO · revisá los valores";

const amount = z.number().positive().max(10_000);
// The app omits optional nutrients nobody typed; missing means unknown, like null.
const nutrient = z.number().min(0).max(100_000).nullish().transform(value => value ?? null);

export const communityProductSchema = z.object({
  productName: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(200).nullable(),
  basis: z.object({ amount, unit: z.enum(["g", "ml"]) }),
  serving: z.object({ label: z.string().trim().max(120).nullable(), amount }).nullable(),
  nutrients: z.object(Object.fromEntries(NUTRIENT_KEYS.map(key => [key, nutrient])) as Record<typeof NUTRIENT_KEYS[number], typeof nutrient>),
}).refine(
  // A product nobody can log against helps no one.
  product => ["kcal", "proteinG", "carbsG", "fatG"].some(key => product.nutrients[key as keyof typeof product.nutrients] != null),
  { message: "needs_nutrition" },
);
export type CommunityProduct = z.infer<typeof communityProductSchema>;

export function draftFromCommunity(barcode: string, product: CommunityProduct): NutritionDraft {
  return {
    source: "barcode",
    sourceRef: barcode,
    productName: product.productName,
    brand: product.brand,
    basis: product.basis,
    serving: product.serving,
    nutrients: product.nutrients,
    uncertain: [],
    derived: [],
    energyInconsistent: false,
    attribution: COMMUNITY_ATTRIBUTION,
  };
}
