/**
 * Planning rules shared by Plan, the scanner and Mis alimentos: which meals a
 * date has, comparing two products and simulating an addition. Pure on purpose
 * (tests/nutrition-planning.test.ts); nothing here writes.
 */

import {
  Basis,
  CORE_NUTRIENTS,
  NUTRIENT_KEYS,
  NutrientKey,
  Nutrients,
  NutrientTotals,
  PhysicalUnit,
  scaleNutrients,
  sumNutrients,
  UnitMismatchError,
} from './nutrition-math';

// ── plan of a concrete date ─────────────────────────────────────────────────

export interface PlanSlotRow {
  id: string;
  weekday: number;
  /** Null = usual week; a date = that day only. */
  planDate: string | null;
  slotOrder: number;
  scheduledTime: string | null;
}

/**
 * Meals planned for `date`: the usual week's meals for its weekday, minus the
 * ones skipped on that date, plus the ones planned for that date only. Timed
 * meals go by time; untimed ones keep their order, usual week first.
 */
export function resolveDayMeals<T extends PlanSlotRow>(
  slots: T[],
  skippedSlotIds: ReadonlySet<string>,
  date: string,
  weekday: number,
): { meals: T[]; skipped: T[] } {
  const weekly = slots.filter(slot => slot.planDate == null && slot.weekday === weekday);
  const dated = slots.filter(slot => slot.planDate === date);
  const rank = (slot: T) => [slot.scheduledTime || '99:99', slot.planDate == null ? 0 : 1, slot.slotOrder] as const;
  const meals = [...weekly.filter(slot => !skippedSlotIds.has(slot.id)), ...dated].sort((a, b) => {
    const [ta, da, oa] = rank(a);
    const [tb, db, ob] = rank(b);
    return ta.localeCompare(tb) || da - db || oa - ob;
  });
  return { meals, skipped: weekly.filter(slot => skippedSlotIds.has(slot.id)) };
}

// ── comparing two products ──────────────────────────────────────────────────

export interface ComparableFood {
  name: string;
  basis: Basis;
  nutrients: Nutrients;
}

export interface ComparisonRow {
  key: NutrientKey;
  a: number | null;
  b: number | null;
  /** b − a; null when either side is unknown. */
  difference: number | null;
}

export interface Comparison {
  unit: PhysicalUnit;
  amountA: number;
  amountB: number;
  rows: ComparisonRow[];
}

/**
 * Both products side by side for the given amounts (the same reference, e.g.
 * 100 g, or each one's own portion). Grams and millilitres are never compared
 * without a known density: that throws. No score is derived — only values.
 */
export function compareFoods(a: ComparableFood, b: ComparableFood, amountA: number, amountB: number = amountA): Comparison {
  if (a.basis.unit !== b.basis.unit) throw new UnitMismatchError();
  const unit = a.basis.unit;
  const scaledA = scaleNutrients(a.nutrients, a.basis, amountA, unit);
  const scaledB = scaleNutrients(b.nutrients, b.basis, amountB, unit);
  const value = (n: Nutrients, key: NutrientKey) => (typeof n[key] === 'number' && Number.isFinite(n[key]) ? n[key]! : null);
  const rows: ComparisonRow[] = [];
  for (const key of NUTRIENT_KEYS) {
    const va = value(scaledA, key);
    const vb = value(scaledB, key);
    // Optional nutrients neither label reports are left out; the core four
    // always show, as "—" when unknown.
    if (va == null && vb == null && !CORE_NUTRIENTS.includes(key)) continue;
    rows.push({ key, a: va, b: vb, difference: va != null && vb != null ? vb - va : null });
  }
  return { unit, amountA, amountB, rows };
}

// ── simulating an addition ──────────────────────────────────────────────────

/**
 * - `consumed`: what was really eaten that day; the day's plan is the reference.
 * - `planned`: what is planned for that day; the plan itself is what changes.
 * The two are never added together, so a planned meal already confirmed is not
 * counted twice.
 */
export type SimulationBasis = 'consumed' | 'planned';

export interface Simulation {
  basis: SimulationBasis;
  before: NutrientTotals;
  after: NutrientTotals;
  /** The day's planned totals, only when simulating consumption against a plan. */
  reference: Record<NutrientKey, number> | null;
}

export function simulateAddition(input: {
  basis: SimulationBasis;
  /** Consumed items (without plain water) or planned meals of the date. */
  baseline: Nutrients[];
  addition: Nutrients;
  /** Planned meals of the date, used as the reference for `consumed`. */
  planned?: Nutrients[];
}): Simulation {
  const before = sumNutrients(input.baseline);
  const after = sumNutrients([...input.baseline, input.addition]);
  const reference = input.basis === 'consumed' && input.planned?.length ? sumNutrients(input.planned).totals : null;
  return { basis: input.basis, before, after, reference };
}
