/**
 * Deterministic nutrition arithmetic shared by logging, summaries and sync.
 * Pure on purpose — no database or React — so it is unit-tested
 * (tests/nutrition-math.test.ts).
 *
 * Rules from the nutrition plan:
 * - An unknown value is `null`, never zero, and it stays unknown in totals.
 * - Grams and millilitres never convert into each other without a known
 *   equivalence; scaling across units is refused.
 * - Decimals are kept; rounding only happens when displaying.
 */

export const NUTRIENT_KEYS = [
  'kcal', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'sugarsG', 'saturatedFatG', 'sodiumMg',
] as const;
export type NutrientKey = typeof NUTRIENT_KEYS[number];

/** The four values every plan and summary shows; the rest are optional. */
export const CORE_NUTRIENTS: readonly NutrientKey[] = ['kcal', 'proteinG', 'carbsG', 'fatG'];

export const NUTRIENT_UNIT: Record<NutrientKey, 'kcal' | 'g' | 'mg'> = {
  kcal: 'kcal',
  proteinG: 'g',
  carbsG: 'g',
  fatG: 'g',
  fiberG: 'g',
  sugarsG: 'g',
  saturatedFatG: 'g',
  sodiumMg: 'mg',
};

export const NUTRIENT_LABEL: Record<NutrientKey, string> = {
  kcal: 'Energía',
  proteinG: 'Proteína',
  carbsG: 'Carbohidratos',
  fatG: 'Grasas',
  fiberG: 'Fibra',
  sugarsG: 'Azúcares',
  saturatedFatG: 'Grasas saturadas',
  sodiumMg: 'Sodio',
};

/** Missing key or `null` = unknown. */
export type Nutrients = Partial<Record<NutrientKey, number | null>>;

export type PhysicalUnit = 'g' | 'ml';

export interface Basis {
  amount: number;
  unit: PhysicalUnit;
}

export class UnitMismatchError extends Error {
  constructor() {
    super('unit_mismatch');
  }
}

function known(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Nutrients for `amount` of a food described per `basis`. Throws when the
 * units differ: 100 ml of a drink says nothing about 100 g of it.
 */
export function scaleNutrients(perBasis: Nutrients, basis: Basis, amount: number, unit: PhysicalUnit): Nutrients {
  if (unit !== basis.unit) throw new UnitMismatchError();
  if (!(basis.amount > 0) || !(amount >= 0)) throw new RangeError('invalid_amount');
  const factor = amount / basis.amount;
  const scaled: Nutrients = {};
  for (const key of NUTRIENT_KEYS) {
    if (key in perBasis) scaled[key] = known(perBasis[key]) ? perBasis[key]! * factor : null;
  }
  return scaled;
}

export interface NutrientTotals {
  totals: Record<NutrientKey, number>;
  /** Keys at least one item did not know: the total for them is a floor. */
  incomplete: Set<NutrientKey>;
}

/** Sums what is known and remembers what wasn't, instead of counting it as 0. */
export function sumNutrients(items: Nutrients[]): NutrientTotals {
  const totals = Object.fromEntries(NUTRIENT_KEYS.map(key => [key, 0])) as Record<NutrientKey, number>;
  const incomplete = new Set<NutrientKey>();
  for (const item of items) {
    for (const key of NUTRIENT_KEYS) {
      const value = item[key];
      if (known(value)) totals[key] += value;
      else if (CORE_NUTRIENTS.includes(key) || key in item) incomplete.add(key);
    }
  }
  return { totals, incomplete };
}

/** Whether every core value (energy and the three macros) is known. */
export function hasCoreNutrients(nutrients: Nutrients): boolean {
  return CORE_NUTRIENTS.every(key => known(nutrients[key]));
}

export function kjToKcal(kj: number): number {
  return kj / 4.184;
}

/**
 * Flags a label whose energy disagrees with its macros by more than the
 * tolerance (4/4/9 kcal per gram). Only a hint to review — the label's own
 * energy is never overwritten.
 */
export function energyLooksInconsistent(nutrients: Nutrients, tolerance = 0.2): boolean {
  const { kcal, proteinG, carbsG, fatG } = nutrients;
  if (!known(kcal) || !known(proteinG) || !known(carbsG) || !known(fatG)) return false;
  const fromMacros = proteinG * 4 + carbsG * 4 + fatG * 9;
  if (kcal < 5 && fromMacros < 5) return false;
  return Math.abs(fromMacros - kcal) / Math.max(kcal, fromMacros) > tolerance;
}

export interface HydrationEntry {
  volumeMl: number | null;
  plainWater: boolean;
}

/** Total drinks and, separately, plain water. One entry counts once. */
export function hydrationTotals(entries: HydrationEntry[]): { totalMl: number; plainWaterMl: number } {
  let totalMl = 0;
  let plainWaterMl = 0;
  for (const entry of entries) {
    if (!known(entry.volumeMl) || entry.volumeMl <= 0) continue;
    totalMl += entry.volumeMl;
    if (entry.plainWater) plainWaterMl += entry.volumeMl;
  }
  return { totalMl, plainWaterMl };
}

/** Progress toward an optional goal; null when there is no goal to measure. */
export function goalProgress(value: number, goal: number | null | undefined): number | null {
  if (!known(goal) || goal <= 0) return null;
  return Math.max(0, value / goal);
}

/** "1,25 L" / "750 ml" — display only. */
export function formatVolume(ml: number): string {
  if (ml >= 1000) return `${(ml / 1000).toLocaleString('es-HN', { maximumFractionDigits: 2 })} L`;
  return `${Math.round(ml)} ml`;
}

/** A nutrient value for display: rounded, with its unit, or "—" when unknown. */
export function formatNutrient(key: NutrientKey, value: number | null | undefined): string {
  if (!known(value)) return '—';
  const unit = NUTRIENT_UNIT[key];
  const rounded = unit === 'kcal' || unit === 'mg' ? Math.round(value) : Math.round(value * 10) / 10;
  return unit === 'kcal' ? `${rounded} kcal` : `${rounded} ${unit}`;
}

/** Parses a user-typed number ("12,5", "12.5"); empty or invalid → null (unknown). */
export function parseAmount(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export interface ScalableComponent {
  nutrientsPerBasis: Nutrients;
  basis: Basis;
  amount: number;
  unit: PhysicalUnit;
}

/**
 * Consumed totals of several components. A nutrient any component doesn't
 * know becomes `null` (the total would be a guess); one nobody reported is
 * left out.
 */
export function combineNutrients(components: ScalableComponent[]): Nutrients {
  const scaled = components.map(c => scaleNutrients(c.nutrientsPerBasis, c.basis, c.amount, c.unit));
  const { totals, incomplete } = sumNutrients(scaled);
  const out: Nutrients = {};
  for (const key of NUTRIENT_KEYS) {
    if (incomplete.has(key)) out[key] = null;
    else if (scaled.some(n => known(n[key]))) out[key] = totals[key];
  }
  return out;
}
