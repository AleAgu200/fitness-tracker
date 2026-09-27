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

/** Trimmed plan name, or null when empty. Names are capped for list rows. */
export function normalizePlanName(name: string): string | null {
  const trimmed = name.replace(/\s+/g, ' ').trim().slice(0, 40);
  return trimmed || null;
}

/** "Plan personal", then "Plan personal 2", "3"… skipping names in use. */
export function nextPlanName(base: string, taken: string[]): string {
  const used = new Set(taken.map(name => name.trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

/** Name for a copy: "Fuerza (copia)", "Fuerza (copia 2)"… */
export function copyPlanName(source: string, taken: string[]): string {
  const base = `${source.replace(/ \(copia(?: \d+)?\)$/, '')} (copia)`.slice(0, 40);
  const used = new Set(taken.map(name => name.trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = base.replace(/\)$/, ` ${n})`);
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}
