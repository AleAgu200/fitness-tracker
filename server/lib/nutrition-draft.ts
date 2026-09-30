/**
 * A scanned product as a *draft* the athlete reviews before anything is
 * saved or logged. Pure mapping code (no I/O) so it is unit-tested
 * (nutrition-draft.test.ts).
 *
 * Rules shared with the app's nutrition-math: an unknown value is null, never
 * zero; grams and millilitres are never converted into each other; values
 * the source did not state directly are listed in `derived`, and those the
 * reader was unsure about in `uncertain`, so the review screen can flag them.
 */

export const NUTRIENT_KEYS = ["kcal", "proteinG", "carbsG", "fatG", "fiberG", "sugarsG", "saturatedFatG", "sodiumMg"] as const;
export type NutrientKey = typeof NUTRIENT_KEYS[number];
export type Nutrients = Record<NutrientKey, number | null>;

export interface NutritionDraft {
  source: "barcode" | "label";
  /** Barcode, when there is one. */
  sourceRef: string | null;
  productName: string | null;
  brand: string | null;
  basis: { amount: number; unit: "g" | "ml" };
  serving: { label: string | null; amount: number } | null;
  nutrients: Nutrients;
  uncertain: NutrientKey[];
  derived: string[];
  energyInconsistent: boolean;
  attribution: string | null;
}

const KJ_PER_KCAL = 4.184;
/** 1 g of salt carries ~393 mg of sodium (NaCl mass fraction 0.393). */
const SODIUM_MG_PER_SALT_G = 393;

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

function round(value: number | null, digits = 2): number | null {
  if (value == null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function energyInconsistent(nutrients: Nutrients, tolerance = 0.2): boolean {
  const { kcal, proteinG, carbsG, fatG } = nutrients;
  if (kcal == null || proteinG == null || carbsG == null || fatG == null) return false;
  const fromMacros = proteinG * 4 + carbsG * 4 + fatG * 9;
  if (kcal < 5 && fromMacros < 5) return false;
  return Math.abs(fromMacros - kcal) / Math.max(kcal, fromMacros) > tolerance;
}

/** EAN-8, UPC-A (12), EAN-13 and GTIN-14 with a valid check digit. */
export function isValidBarcode(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

// ── Open Food Facts ──────────────────────────────────────────────────────────

export interface OpenFoodFactsProduct {
  product_name?: string;
  product_name_es?: string;
  brands?: string;
  quantity?: string;
  product_quantity_unit?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, unknown>;
}

function looksLiquid(product: OpenFoodFactsProduct): boolean | null {
  const unit = product.product_quantity_unit?.toLowerCase();
  if (unit === "ml" || unit === "l" || unit === "cl") return true;
  if (unit === "g" || unit === "kg") return false;
  const quantity = product.quantity?.toLowerCase() ?? "";
  if (/\d\s*(ml|cl|l)\b/.test(quantity)) return true;
  if (/\d\s*(g|kg)\b/.test(quantity)) return false;
  return null;
}

/**
 * Open Food Facts keys every per-100 value as `_100g`, even for drinks,
 * whose values are per 100 ml. The product's own quantity unit decides which;
 * when it can't, grams are assumed and the basis is flagged for review.
 */
export function draftFromOpenFoodFacts(product: OpenFoodFactsProduct, barcode: string): NutritionDraft {
  const n = product.nutriments ?? {};
  const liquid = looksLiquid(product);
  const unit: "g" | "ml" = liquid ? "ml" : "g";
  const derived: string[] = [];
  const uncertain: NutrientKey[] = [];

  let kcal = num(n["energy-kcal_100g"]);
  if (kcal == null) {
    const kj = num(n["energy-kj_100g"]) ?? (n["energy_unit"] === "kJ" ? num(n["energy_100g"]) : null);
    if (kj != null) {
      kcal = kj / KJ_PER_KCAL;
      derived.push("kcal convertidas desde kJ");
    }
  }
  let sodiumMg = num(n["sodium_100g"]);
  if (sodiumMg != null) sodiumMg *= 1000; // OFF stores sodium in grams
  else {
    const salt = num(n["salt_100g"]);
    if (salt != null) {
      sodiumMg = salt * SODIUM_MG_PER_SALT_G;
      derived.push("sodio calculado desde la sal");
    }
  }

  const nutrients: Nutrients = {
    kcal: round(kcal),
    proteinG: round(num(n["proteins_100g"])),
    carbsG: round(num(n["carbohydrates_100g"])),
    fatG: round(num(n["fat_100g"])),
    fiberG: round(num(n["fiber_100g"])),
    sugarsG: round(num(n["sugars_100g"])),
    saturatedFatG: round(num(n["saturated-fat_100g"])),
    sodiumMg: round(sodiumMg, 1),
  };
  if (liquid == null) derived.push("no se pudo saber si es sólido o líquido: revisá g o ml");

  const servingAmount = num(product.serving_quantity);
  return {
    source: "barcode",
    sourceRef: barcode,
    productName: product.product_name_es?.trim() || product.product_name?.trim() || null,
    brand: product.brands?.split(",")[0]?.trim() || null,
    basis: { amount: 100, unit },
    serving: servingAmount ? { label: product.serving_size?.trim() || null, amount: servingAmount } : null,
    nutrients,
    uncertain,
    derived,
    energyInconsistent: energyInconsistent(nutrients),
    attribution: "Datos de Open Food Facts (ODbL)",
  };
}

// ── Label extraction ─────────────────────────────────────────────────────────

/** What the label reader transcribes; see nutrition-label.ts for the schema. */
export interface LabelExtraction {
  isNutritionLabel: boolean;
  productName: string | null;
  brand: string | null;
  basisAmount: number | null;
  basisUnit: "g" | "ml" | null;
  servingLabel: string | null;
  servingAmount: number | null;
  energyValue: number | null;
  energyUnit: "kcal" | "kJ" | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarsG: number | null;
  saturatedFatG: number | null;
  sodiumMg: number | null;
  saltG: number | null;
  uncertainFields: string[];
}

export class NotALabelError extends Error {
  constructor() {
    super("not_a_nutrition_label");
  }
}

/**
 * Turns a transcription into a draft. Unit conversions happen here, in code,
 * never in the model: kJ → kcal and salt → sodium are computed and listed as
 * derived. A missing basis falls back to the serving; with neither, 100 g is
 * assumed and flagged.
 */
export function draftFromLabel(extraction: LabelExtraction): NutritionDraft {
  if (!extraction.isNutritionLabel) throw new NotALabelError();
  const derived: string[] = [];
  const uncertain = new Set<NutrientKey>(
    extraction.uncertainFields.filter((field): field is NutrientKey => (NUTRIENT_KEYS as readonly string[]).includes(field)),
  );

  let basisAmount = extraction.basisAmount;
  let basisUnit = extraction.basisUnit;
  if (!basisAmount || !basisUnit) {
    if (extraction.servingAmount && basisUnit) {
      basisAmount = extraction.servingAmount;
    } else {
      basisAmount = 100;
      basisUnit = basisUnit ?? "g";
      derived.push("la etiqueta no indicaba la base: se asumió 100 g");
    }
  }

  let kcal = extraction.energyValue;
  if (kcal != null && extraction.energyUnit === "kJ") {
    kcal = kcal / KJ_PER_KCAL;
    derived.push("kcal convertidas desde kJ");
  } else if (kcal != null && extraction.energyUnit == null) {
    uncertain.add("kcal");
  }
  let sodiumMg = extraction.sodiumMg;
  if (sodiumMg == null && extraction.saltG != null) {
    sodiumMg = extraction.saltG * SODIUM_MG_PER_SALT_G;
    derived.push("sodio calculado desde la sal");
  }

  const nutrients: Nutrients = {
    kcal: round(kcal),
    proteinG: round(extraction.proteinG),
    carbsG: round(extraction.carbsG),
    fatG: round(extraction.fatG),
    fiberG: round(extraction.fiberG),
    sugarsG: round(extraction.sugarsG),
    saturatedFatG: round(extraction.saturatedFatG),
    sodiumMg: round(sodiumMg, 1),
  };
  return {
    source: "label",
    sourceRef: null,
    productName: extraction.productName?.trim() || null,
    brand: extraction.brand?.trim() || null,
    basis: { amount: basisAmount, unit: basisUnit },
    serving: extraction.servingAmount ? { label: extraction.servingLabel?.trim() || null, amount: extraction.servingAmount } : null,
    nutrients,
    uncertain: [...uncertain],
    derived,
    energyInconsistent: energyInconsistent(nutrients),
    attribution: null,
  };
}
