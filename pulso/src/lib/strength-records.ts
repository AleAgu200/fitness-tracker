/**
 * Strength records derived from completed sets. Pure, so it is unit tested and
 * can be rerun over surviving sets after any edit, deletion, import or restore.
 *
 * Three separate records per exercise, because they answer different questions:
 * - heaviest: the most external load lifted (any rep count);
 * - best estimated 1RM: a lighter set with more reps may be the stronger one;
 * - rep records: the heaviest load for each exact rep count (1–10).
 *
 * The estimate is shown as an estimate, never as a weight to lift.
 */

export type SetKind = 'working' | 'warmup';

/** Equipment classes where external load is not the measure of the set. */
const NO_ESTIMATE_EQUIPMENT = new Set(['bodyweight', 'assisted', 'timed', 'distance']);

export const MAX_ESTIMATE_REPS = 10;

export interface RecordSet {
  weightKg: number;
  reps: number;
  completedAt: number;
  /** Missing means a working set: warm-ups were never logged before this field existed. */
  kind?: SetKind;
  sessionId?: string | null;
}

/**
 * Estimated one-rep max, or null when the set is not eligible: load must be a
 * finite positive number and reps an integer from 1 to 10. One rep is the load
 * itself; 2–10 use Epley, load × (1 + reps / 30).
 */
export function estimateOneRepMax(weightKg: number, reps: number): number | null {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null;
  if (!Number.isInteger(reps) || reps < 1 || reps > MAX_ESTIMATE_REPS) return null;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

/** Whether an exercise's equipment allows a load-based estimate at all. */
export function supportsEstimate(equipment: string | null | undefined): boolean {
  return !NO_ESTIMATE_EQUIPMENT.has(equipment ?? '');
}

export interface RecordValue {
  weightKg: number;
  reps: number;
  at: number;
  sessionId: string | null;
}

export interface ExerciseRecords {
  heaviest: RecordValue | null;
  bestEstimate: (RecordValue & { e1rm: number }) | null;
  /** Heaviest load per exact rep count, for loaded working sets with 1–10 reps. */
  repRecords: Record<number, RecordValue>;
  /** Most reps in one working set: the record that matters for bodyweight work. */
  mostReps: RecordValue | null;
}

function value(set: RecordSet): RecordValue {
  return { weightKg: set.weightKg, reps: set.reps, at: set.completedAt, sessionId: set.sessionId ?? null };
}

/**
 * Records from every surviving completed set of one exercise. Ties keep the
 * earliest set, so recomputing over the same history gives the same dates.
 */
export function computeExerciseRecords(sets: RecordSet[], equipment: string | null | undefined): ExerciseRecords {
  const working = sets
    .filter(set => (set.kind ?? 'working') === 'working' && Number.isFinite(set.weightKg) && Number.isInteger(set.reps) && set.reps > 0)
    .sort((a, b) => a.completedAt - b.completedAt);
  const estimable = supportsEstimate(equipment);

  let heaviest: RecordValue | null = null;
  let bestEstimate: (RecordValue & { e1rm: number }) | null = null;
  let mostReps: RecordValue | null = null;
  const repRecords: Record<number, RecordValue> = {};

  for (const set of working) {
    if (set.weightKg > 0 && (!heaviest || set.weightKg > heaviest.weightKg)) heaviest = value(set);
    if (!mostReps || set.reps > mostReps.reps) mostReps = value(set);
    if (!estimable) continue;
    const estimate = estimateOneRepMax(set.weightKg, set.reps);
    if (estimate == null) continue;
    if (!bestEstimate || estimate > bestEstimate.e1rm) bestEstimate = { ...value(set), e1rm: estimate };
    const current = repRecords[set.reps];
    if (!current || set.weightKg > current.weightKg) repRecords[set.reps] = value(set);
  }

  return { heaviest, bestEstimate, repRecords, mostReps };
}

/** Whether a new set beats the stored records; the first set ever is a baseline, not a record. */
export function newSetImproves(
  records: ExerciseRecords,
  set: RecordSet,
  equipment: string | null | undefined,
): { heavier: boolean; strongerEstimate: boolean } {
  if ((set.kind ?? 'working') !== 'working') return { heavier: false, strongerEstimate: false };
  const heavier = records.heaviest != null && set.weightKg > records.heaviest.weightKg;
  const estimate = supportsEstimate(equipment) ? estimateOneRepMax(set.weightKg, set.reps) : null;
  const strongerEstimate = estimate != null && records.bestEstimate != null && estimate > records.bestEstimate.e1rm;
  return { heavier, strongerEstimate };
}
