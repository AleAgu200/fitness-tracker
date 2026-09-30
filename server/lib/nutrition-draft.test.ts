import assert from "node:assert/strict";
import test from "node:test";

import { draftFromLabel, draftFromOpenFoodFacts, isValidBarcode, LabelExtraction, NotALabelError } from "@/lib/nutrition-draft";

test("barcodes need a valid GTIN check digit", () => {
  assert.equal(isValidBarcode("7501055303786"), true);
  assert.equal(isValidBarcode("7501055303787"), false);
  assert.equal(isValidBarcode("96385074"), true);
  assert.equal(isValidBarcode("12345"), false);
  assert.equal(isValidBarcode("abc"), false);
});

test("Open Food Facts drinks are per 100 ml and sodium goes from g to mg", () => {
  const draft = draftFromOpenFoodFacts({
    product_name: "Leche entera",
    brands: "Sula, Otra",
    quantity: "1 L",
    serving_quantity: 250,
    serving_size: "1 vaso (250 ml)",
    nutriments: { "energy-kcal_100g": 61, proteins_100g: 3.2, carbohydrates_100g: 4.8, fat_100g: 3.3, sodium_100g: 0.044 },
  }, "7421000000000");
  assert.deepEqual(draft.basis, { amount: 100, unit: "ml" });
  assert.equal(draft.brand, "Sula");
  assert.equal(draft.nutrients.sodiumMg, 44);
  assert.equal(draft.nutrients.fiberG, null, "missing stays unknown, not zero");
  assert.deepEqual(draft.serving, { label: "1 vaso (250 ml)", amount: 250 });
});

test("Open Food Facts energy only in kJ is converted and reported as derived", () => {
  const draft = draftFromOpenFoodFacts({ quantity: "200 g", nutriments: { "energy-kj_100g": 418.4, salt_100g: 1 } }, "7421000000000");
  assert.equal(draft.nutrients.kcal, 100);
  assert.equal(draft.nutrients.sodiumMg, 393);
  assert.equal(draft.derived.length, 2);
});

const label = (overrides: Partial<LabelExtraction> = {}): LabelExtraction => ({
  isNutritionLabel: true,
  productName: "Yogur griego",
  brand: null,
  basisAmount: 100,
  basisUnit: "g",
  servingLabel: "1 envase",
  servingAmount: 150,
  energyValue: 97,
  energyUnit: "kcal",
  proteinG: 9,
  carbsG: 4,
  fatG: 5,
  fiberG: null,
  sugarsG: 4,
  saturatedFatG: 3,
  sodiumMg: null,
  saltG: 0.1,
  uncertainFields: ["fatG", "notAField"],
  ...overrides,
});

test("a label keeps its basis, flags uncertain fields and derives sodium from salt", () => {
  const draft = draftFromLabel(label());
  assert.deepEqual(draft.basis, { amount: 100, unit: "g" });
  assert.deepEqual(draft.uncertain, ["fatG"]);
  assert.equal(draft.nutrients.sodiumMg, 39.3);
  assert.equal(draft.energyInconsistent, false);
});

test("kJ is converted in code and energy typed as kJ-in-kcal is flagged", () => {
  assert.equal(draftFromLabel(label({ energyValue: 418.4, energyUnit: "kJ" })).nutrients.kcal, 100);
  assert.equal(draftFromLabel(label({ energyValue: 406 })).energyInconsistent, true);
});

test("a per-serving label uses the serving as basis", () => {
  const draft = draftFromLabel(label({ basisAmount: null, basisUnit: "ml", servingAmount: 250 }));
  assert.deepEqual(draft.basis, { amount: 250, unit: "ml" });
});

test("something that is not a nutrition label is rejected", () => {
  assert.throws(() => draftFromLabel(label({ isNutritionLabel: false })), NotALabelError);
});
