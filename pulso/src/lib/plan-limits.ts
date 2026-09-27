/**
 * Plan library rules shared by training and nutrition. Pure on purpose: no
 * database or React imports, so the rules are unit-tested (tests/plan-limits).
 *
 * Plans assigned by a professional and the AI plan never count and are never
 * locked — PULSO Plus unlocks keeping *own* alternatives, not following a plan.
 */

/** Own plans a free account can keep usable. */
export const FREE_OWN_PLAN_LIMIT = 1;

export interface LimitedPlan {
  id: string;
  /** Only 'own' plans are limited. */
  origin: string;
  createdAt: number;
  lastActivatedAt: number | null;
}

export function ownPlans<T extends LimitedPlan>(plans: T[]): T[] {
  return plans.filter(plan => plan.origin === 'own');
}

/** Whether another own plan can be created (empty or as a copy). */
export function canCreateOwnPlan(plans: LimitedPlan[], entitled: boolean): boolean {
  return entitled || ownPlans(plans).length < FREE_OWN_PLAN_LIMIT;
}

/**
 * Own plans that are read-only because Plus is not active. The usable ones are
 * the most recently activated (so the plan in force never locks under the
 * athlete), falling back to the oldest for plans never activated.
 */
export function lockedPlanIds(plans: LimitedPlan[], entitled: boolean): Set<string> {
  if (entitled) return new Set();
  const own = [...ownPlans(plans)].sort((a, b) =>
    (b.lastActivatedAt ?? -1) - (a.lastActivatedAt ?? -1) || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return new Set(own.slice(FREE_OWN_PLAN_LIMIT).map(plan => plan.id));
}

/** Longest plan name kept, so list rows never wrap into a paragraph. */
export const MAX_PLAN_NAME_LENGTH = 40;

/** Trimmed plan name, or null when empty. Names are capped for list rows. */
export function normalizePlanName(name: string): string | null {
  const trimmed = name.replace(/\s+/g, ' ').trim().slice(0, MAX_PLAN_NAME_LENGTH);
  return trimmed || null;
}

/** The stem shortened so the suffix always fits: a distinct suffix per
 *  attempt then guarantees a distinct name, however long the stem. */
function withSuffix(stem: string, suffix: string): string {
  return `${stem.slice(0, MAX_PLAN_NAME_LENGTH - suffix.length).trimEnd()}${suffix}`;
}

function firstFree(taken: string[], candidate: (attempt: number) => string): string {
  const used = new Set(taken.map(name => name.trim().toLowerCase()));
  for (let attempt = 1; ; attempt++) {
    const name = candidate(attempt);
    if (!used.has(name.toLowerCase())) return name;
  }
}

/** "Plan personal", then "Plan personal 2", "3"… skipping names in use. */
export function nextPlanName(base: string, taken: string[]): string {
  return firstFree(taken, n => n === 1 ? base.slice(0, MAX_PLAN_NAME_LENGTH) : withSuffix(base, ` ${n}`));
}

/** Name for a copy: "Fuerza (copia)", "Fuerza (copia 2)"… */
export function copyPlanName(source: string, taken: string[]): string {
  const stem = source.replace(/ \(copia(?: \d+)?\)$/, '');
  return firstFree(taken, n => withSuffix(stem, n === 1 ? ' (copia)' : ` (copia ${n})`));
}

/** Thrown by the creation operations when the free own-plan quota is used. */
export const OWN_PLAN_LIMIT_ERROR = 'own_plan_limit';
