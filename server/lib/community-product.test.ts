import assert from "node:assert/strict";
import test from "node:test";

import { COMMUNITY_ATTRIBUTION, communityProductSchema, draftFromCommunity } from "./community-product";

const nutrients = { kcal: 380, proteinG: 11, carbsG: 68, fatG: 6.5, fiberG: 9, sugarsG: 12, saturatedFatG: 1.2, sodiumMg: 450 };
const product = {
  productName: "Avena integral",
  brand: null,
  basis: { amount: 100, unit: "g" as const },
  serving: { label: "1 taza", amount: 30 },
  nutrients,
};

test("a reviewed product with nutrition can be shared", () => {
  assert.equal(communityProductSchema.safeParse(product).success, true);
});

test("a product without energy or macros, a name, or a sane basis is refused", () => {
  const empty = { ...nutrients, kcal: null, proteinG: null, carbsG: null, fatG: null };
  assert.equal(communityProductSchema.safeParse({ ...product, nutrients: empty }).success, false);
  assert.equal(communityProductSchema.safeParse({ ...product, productName: "  " }).success, false);
  assert.equal(communityProductSchema.safeParse({ ...product, basis: { amount: 0, unit: "g" } }).success, false);
  assert.equal(communityProductSchema.safeParse({ ...product, nutrients: { ...nutrients, kcal: -5 } }).success, false);
});

test("a shared product comes back as a barcode draft that says where it is from", () => {
  const draft = draftFromCommunity("7613034627476", communityProductSchema.parse(product));
  assert.equal(draft.source, "barcode");
  assert.equal(draft.sourceRef, "7613034627476");
  assert.equal(draft.attribution, COMMUNITY_ATTRIBUTION);
  assert.deepEqual(draft.nutrients, nutrients);
});

test("optional nutrients the app didn't send count as unknown", () => {
  const parsed = communityProductSchema.parse({ ...product, nutrients: { kcal: 380, proteinG: 11, carbsG: 68, fatG: 6.5 } });
  assert.equal(parsed.nutrients.fiberG, null);
  assert.equal(parsed.nutrients.sodiumMg, null);
});
