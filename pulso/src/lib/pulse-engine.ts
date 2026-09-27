// Pure rules behind the PULSO loop: core state, set comparison, the card revealed
// at the end of a session, muscle load, strength trend and free-session
// generation. Everything is derived from local training data on demand — no
// athlete "score" is ever persisted as truth.
//
// Keep this module free of React Native / database imports (relative, pure
// modules only) so it runs under `npm test` with plain Node.

import { dayStart, mondayOf } from './dates';
import type { DetailedMuscleKey, EquipmentKind } from './muscles';

const DAY_MS = 24 * 60 * 60 * 1000;

// ── training data shape ─────────────────────────────────────────────────────

export interface TrainingSetEntry {
  weightKg: number;
  reps: number;
  rpe: number | null;
}

export interface TrainingExercise {
  exerciseId: string;
  name: string;
  /** First item is the primary muscle; the rest are secondary. */
  muscles: DetailedMuscleKey[];
  sets: TrainingSetEntry[];
}

export interface TrainingSession {
  id: string;
  status: 'in_progress' | 'completed' | 'skipped';
  kind: 'plan' | 'free';
  startedAt: number;
  finishedAt: number | null;
  exercises: TrainingExercise[];
}

/** Epley estimated one-rep max. Bodyweight sets (0 kg) have no e1RM. */
export function e1rm(weightKg: number, reps: number): number {
  return weightKg > 0 ? weightKg * (1 + reps / 30) : 0;
}

export function sessionTime(session: TrainingSession): number {
  return session.finishedAt ?? session.startedAt;
}

function completed(sessions: TrainingSession[]): TrainingSession[] {
  return sessions.filter(session => session.status === 'completed');
}

function calendarDaysBetween(from: number, to: number): number {
  return Math.round((dayStart(new Date(to)).getTime() - dayStart(new Date(from)).getTime()) / DAY_MS);
}

function sessionSetCount(session: TrainingSession): number {
  return session.exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
}

function sessionVolume(session: TrainingSession): number {
  return session.exercises.reduce((total, exercise) => total + exerciseVolume(exercise), 0);
}

function exerciseVolume(exercise: TrainingExercise): number {
  return exercise.sets.reduce((total, set) => total + set.weightKg * set.reps, 0);
}

function averageRpe(sets: TrainingSetEntry[]): number | null {
  const rated = sets.filter(set => set.rpe != null);
  if (!rated.length) return null;
  return rated.reduce((total, set) => total + (set.rpe ?? 0), 0) / rated.length;
}

/** Best set by e1RM, or by reps when the exercise is bodyweight. */
export function bestSet(sets: TrainingSetEntry[]): TrainingSetEntry | null {
  if (!sets.length) return null;
  const loaded = sets.some(set => set.weightKg > 0);
  return sets.reduce((best, set) => {
    const score = loaded ? e1rm(set.weightKg, set.reps) : set.reps;
    const bestScore = loaded ? e1rm(best.weightKg, best.reps) : best.reps;
    return score > bestScore ? set : best;
  });
}

// ── previous pulse (in-set comparison) ──────────────────────────────────────

export interface PreviousPulseRef {
  bestSet: TrainingSetEntry;
  at: number;
}

export type PulseComparisonMode =
  | 'first'
  | 'return'
  | 'beat'
  | 'control'
  | 'match'
  | 'close'
  | 'consolidate';

export interface PulseComparison {
  mode: PulseComparisonMode;
  /** Reps still needed at the current weight to beat the reference (mode 'close'). */
  repsToBeat: number | null;
  /** True only when the current input already beats the reference. */
  beating: boolean;
}

/** An exercise not done for this long is a comeback: completing it is the goal. */
export const RETURN_AFTER_DAYS = 14;

/**
 * Compares what the athlete is about to log with their previous pulse on the
 * same exercise. Never suggests adding load: the only nudge is reps at the
 * weight the athlete already chose.
 */
export function comparePulse(
  previous: PreviousPulseRef | null,
  current: TrainingSetEntry,
  now: number,
): PulseComparison {
  if (!previous) return { mode: 'first', repsToBeat: null, beating: false };
  if (calendarDaysBetween(previous.at, now) >= RETURN_AFTER_DAYS) {
    return { mode: 'return', repsToBeat: null, beating: false };
  }

  const ref = previous.bestSet;
  const loaded = ref.weightKg > 0 || current.weightKg > 0;
  const refScore = loaded ? e1rm(ref.weightKg, ref.reps) : ref.reps;
  const curScore = loaded ? e1rm(current.weightKg, current.reps) : current.reps;
  const tolerance = loaded ? 0.05 : 0;

  if (curScore > refScore + tolerance) return { mode: 'beat', repsToBeat: null, beating: true };

  // Smallest rep count at the chosen weight that clears the reference.
  const repsNeeded = loaded && current.weightKg > 0
    ? Math.floor(30 * ((refScore + tolerance) / current.weightKg - 1)) + 1
    : ref.reps + 1;
  const missing = Math.max(1, repsNeeded - current.reps);

  if (Math.abs(curScore - refScore) <= tolerance) {
    const easier = current.rpe != null && ref.rpe != null && current.rpe < ref.rpe;
    return { mode: easier ? 'control' : 'match', repsToBeat: missing, beating: false };
  }
  if (missing <= 2) return { mode: 'close', repsToBeat: missing, beating: false };
  return { mode: 'consolidate', repsToBeat: null, beating: false };
}

// ── session card (one reveal per closed session) ────────────────────────────

export type SessionCardType = 'new_pulse' | 'control' | 'return' | 'consistency';

/** Highest priority first — only the top one is revealed. */
export const CARD_PRIORITY: SessionCardType[] = ['new_pulse', 'control', 'return', 'consistency'];

export interface SessionCardMetric {
  exerciseName: string | null;
  weightKg: number | null;
  reps: number | null;
  /** new_pulse: % over the previous best (e1RM, or reps for bodyweight). */
  deltaPct: number | null;
  /** control: average RPE drop vs the previous session of that exercise. */
  rpeDrop: number | null;
  /** return: calendar days since the previous completed session. */
  daysAway: number | null;
  completedSets: number;
  targetSets: number | null;
  volumeKg: number;
  avgRpe: number | null;
  durationMin: number | null;
  muscles: DetailedMuscleKey[];
}

export interface SessionCardDraft {
  type: SessionCardType;
  metric: SessionCardMetric;
}

export interface SessionCardInput {
  session: TrainingSession;
  /** Completed sessions before this one (any order). */
  history: TrainingSession[];
  /** Target sets of the plan this session followed; null for free sessions. */
  plannedTargetSets: number | null;
}

/** A tiny gain ground out at maximal effort isn't celebrated as a record. */
const MIN_DELTA_AT_MAX_RPE = 2.5;
export const RETURN_GAP_DAYS = 7;

export function sessionMuscles(session: TrainingSession, limit = 3): DetailedMuscleKey[] {
  const weight = new Map<DetailedMuscleKey, number>();
  for (const exercise of session.exercises) {
    exercise.muscles.forEach((muscle, index) => {
      weight.set(muscle, (weight.get(muscle) ?? 0) + exercise.sets.length * (index === 0 ? 1 : 0.5));
    });
  }
  return [...weight.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([muscle]) => muscle);
}

/**
 * Picks the single most meaningful result of a finished session, or null when
 * nothing notable happened — the close screen then shows the plain summary
 * instead of inventing an achievement.
 */
export function selectSessionCard({ session, history, plannedTargetSets }: SessionCardInput): SessionCardDraft | null {
  const past = completed(history).filter(item => item.id !== session.id && sessionTime(item) <= sessionTime(session));
  const allSets = session.exercises.flatMap(exercise => exercise.sets);
  if (!allSets.length) return null;

  const base: SessionCardMetric = {
    exerciseName: null,
    weightKg: null,
    reps: null,
    deltaPct: null,
    rpeDrop: null,
    daysAway: null,
    completedSets: allSets.length,
    targetSets: plannedTargetSets,
    volumeKg: sessionVolume(session),
    avgRpe: averageRpe(allSets),
    durationMin: session.finishedAt != null
      ? Math.max(1, Math.round((session.finishedAt - session.startedAt) / 60_000))
      : null,
    muscles: sessionMuscles(session),
  };

  const newPulse = findNewPulse(session, past);
  if (newPulse) return { type: 'new_pulse', metric: { ...base, ...newPulse } };

  const control = findControl(session, past);
  if (control) return { type: 'control', metric: { ...base, ...control } };

  const previousAt = past.reduce<number | null>((latest, item) => {
    const at = sessionTime(item);
    return latest == null || at > latest ? at : latest;
  }, null);
  if (previousAt != null) {
    const daysAway = calendarDaysBetween(previousAt, session.startedAt);
    if (daysAway >= RETURN_GAP_DAYS) return { type: 'return', metric: { ...base, daysAway } };
  }

  if (session.kind === 'plan' && plannedTargetSets != null && plannedTargetSets > 0 && allSets.length >= plannedTargetSets) {
    return { type: 'consistency', metric: base };
  }
  return null;
}

function findNewPulse(session: TrainingSession, past: TrainingSession[]): Partial<SessionCardMetric> | null {
  let winner: Partial<SessionCardMetric> | null = null;
  for (const exercise of session.exercises) {
    const top = bestSet(exercise.sets);
    if (!top) continue;
    const previousSets = past.flatMap(item =>
      item.exercises.filter(other => other.exerciseId === exercise.exerciseId).flatMap(other => other.sets));
    if (!previousSets.length) continue; // first time is a baseline, not a record

    const loaded = top.weightKg > 0;
    const previousBest = loaded
      ? Math.max(...previousSets.map(set => e1rm(set.weightKg, set.reps)))
      : Math.max(...previousSets.map(set => set.reps));
    const current = loaded ? e1rm(top.weightKg, top.reps) : top.reps;
    if (previousBest <= 0 || current <= previousBest + (loaded ? 0.05 : 0)) continue;

    const deltaPct = (current / previousBest - 1) * 100;
    if (top.rpe != null && top.rpe >= 10 && deltaPct < MIN_DELTA_AT_MAX_RPE) continue;
    if (!winner || deltaPct > (winner.deltaPct ?? 0)) {
      winner = { exerciseName: exercise.name, weightKg: top.weightKg, reps: top.reps, deltaPct: round1(deltaPct) };
    }
  }
  return winner;
}

function findControl(session: TrainingSession, past: TrainingSession[]): Partial<SessionCardMetric> | null {
  let winner: Partial<SessionCardMetric> | null = null;
  const ordered = [...past].sort((a, b) => sessionTime(b) - sessionTime(a));
  for (const exercise of session.exercises) {
    const previous = ordered
      .map(item => item.exercises.find(other => other.exerciseId === exercise.exerciseId))
      .find((match): match is TrainingExercise => match != null);
    if (!previous) continue;
    const currentRpe = averageRpe(exercise.sets);
    const previousRpe = averageRpe(previous.sets);
    if (currentRpe == null || previousRpe == null) continue;

    const currentTop = bestSet(exercise.sets);
    const previousTop = bestSet(previous.sets);
    if (!currentTop || !previousTop) continue;
    const loaded = previousTop.weightKg > 0;
    const sameWork = loaded
      ? exerciseVolume(exercise) >= exerciseVolume(previous) * 0.98
        && e1rm(currentTop.weightKg, currentTop.reps) >= e1rm(previousTop.weightKg, previousTop.reps) * 0.98
      : exercise.sets.reduce((t, s) => t + s.reps, 0) >= previous.sets.reduce((t, s) => t + s.reps, 0);
    const rpeDrop = previousRpe - currentRpe;
    if (!sameWork || rpeDrop < 1) continue;
    if (!winner || rpeDrop > (winner.rpeDrop ?? 0)) {
      winner = { exerciseName: exercise.name, weightKg: currentTop.weightKg, reps: currentTop.reps, rpeDrop: round1(rpeDrop) };
    }
  }
  return winner;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// ── muscle load ─────────────────────────────────────────────────────────────

export type LoadLevel = 'BAJA' | 'MEDIA' | 'ALTA';

export interface MuscleLoadEntry {
  /** Effective sets: 1 per set as primary mover, 0.5 as secondary. */
  sets: number;
  lastAt: number | null;
  /** 0..1 relative to the most loaded muscle in the window. */
  relative: number;
  /** Trained hard in the last 48 h — shown as recovery context, never a diagnosis. */
  recovering: boolean;
}

export interface MuscleLoad {
  byMuscle: Partial<Record<DetailedMuscleKey, MuscleLoadEntry>>;
  totalSets: number;
  level: LoadLevel;
}

const RECOVERY_WINDOW_MS = 48 * 60 * 60 * 1000;
const RECOVERY_MIN_SETS = 6;

export function computeMuscleLoad(sessions: TrainingSession[], now: number, days = 7): MuscleLoad {
  const since = dayStart(new Date(now)).getTime() - (days - 1) * DAY_MS;
  const sets = new Map<DetailedMuscleKey, number>();
  const recent = new Map<DetailedMuscleKey, number>();
  const lastAt = new Map<DetailedMuscleKey, number>();
  let rawSets = 0;

  for (const session of sessions) {
    if (session.status === 'skipped') continue;
    const at = sessionTime(session);
    if (at < since || at > now) continue;
    for (const exercise of session.exercises) {
      if (!exercise.sets.length) continue;
      rawSets += exercise.sets.length;
      exercise.muscles.forEach((muscle, index) => {
        const effective = exercise.sets.length * (index === 0 ? 1 : 0.5);
        sets.set(muscle, (sets.get(muscle) ?? 0) + effective);
        lastAt.set(muscle, Math.max(lastAt.get(muscle) ?? 0, at));
        if (now - at <= RECOVERY_WINDOW_MS) recent.set(muscle, (recent.get(muscle) ?? 0) + effective);
      });
    }
  }

  const max = Math.max(0, ...sets.values());
  const byMuscle: MuscleLoad['byMuscle'] = {};
  for (const [muscle, value] of sets) {
    byMuscle[muscle] = {
      sets: round1(value),
      lastAt: lastAt.get(muscle) ?? null,
      relative: max > 0 ? value / max : 0,
      recovering: (recent.get(muscle) ?? 0) >= RECOVERY_MIN_SETS,
    };
  }
  // Scaled to the window so a 28-day view isn't always "ALTA".
  const perWeek = rawSets * (7 / days);
  const level: LoadLevel = perWeek < 15 ? 'BAJA' : perWeek < 45 ? 'MEDIA' : 'ALTA';
  return { byMuscle, totalSets: rawSets, level };
}

// ── core state ──────────────────────────────────────────────────────────────

export type PulseCoreState = 'LATENTE' | 'ACTIVO' | 'CARGADO' | 'RECUPERANDO' | 'ESTABLE' | 'REACTIVANDO';
/** action = yellow/accent, context = cyan, continuity = orange, idle = neutral. */
export type PulseTone = 'action' | 'context' | 'continuity' | 'idle';

export interface PulseCoreInput {
  now: number;
  /** Recent sessions (≥ 14 days), any status. */
  sessions: TrainingSession[];
  streakDays: number;
  /** Days with exercises in the active weekly plan; 0 when there's no plan. */
  plannedDaysPerWeek: number;
  /** Share of today's planned meals done (0..100); null without a meal plan. */
  nutritionPct: number | null;
  hydrationPct: number;
}

export interface PulseCoreComponent {
  key: 'sessions' | 'continuity' | 'nutrition' | 'hydration' | 'balance';
  value: number; // 0..100
}

export interface PulseCore {
  state: PulseCoreState;
  tone: PulseTone;
  /** Only meaningful states glow: activity or a fresh result. */
  halo: boolean;
  /** Completed sessions this week (Monday → now). */
  weekSessions: number;
  /** Planned days this week, or null without a plan. */
  weekTarget: number | null;
  /** 0..100 — shown only in the detail view, never as the headline. */
  momentum: number;
  components: PulseCoreComponent[];
}

export const REACTIVATE_AFTER_DAYS = 4;

export function computePulseCore(input: PulseCoreInput): PulseCore {
  const { now } = input;
  const done = completed(input.sessions);
  const weekStart = mondayOf(new Date(now)).getTime();
  const weekSessions = done.filter(session => sessionTime(session) >= weekStart).length;
  const weekTarget = input.plannedDaysPerWeek > 0 ? input.plannedDaysPerWeek : null;
  const sessions7d = done.filter(session => now - sessionTime(session) < 7 * DAY_MS).length;
  const sessions72h = done.filter(session => now - sessionTime(session) < 3 * DAY_MS);
  const recentSets = sessions72h.reduce((total, session) => total + sessionSetCount(session), 0);
  const highLoad = sessions72h.length >= 3 || recentSets >= 45;
  const lastAt = done.reduce((latest, session) => Math.max(latest, sessionTime(session)), 0);

  let state: PulseCoreState;
  if (!done.length) {
    state = input.streakDays > 0 ? 'ACTIVO' : 'LATENTE';
  } else if (calendarDaysBetween(lastAt, now) === 0) {
    state = 'CARGADO';
  } else if (calendarDaysBetween(lastAt, now) >= REACTIVATE_AFTER_DAYS) {
    state = 'REACTIVANDO';
  } else if (highLoad) {
    state = 'RECUPERANDO';
  } else if (weekTarget != null && weekSessions >= weekTarget) {
    state = 'ESTABLE';
  } else {
    state = 'ACTIVO';
  }

  const tone: PulseTone = state === 'LATENTE' ? 'idle'
    : state === 'RECUPERANDO' ? 'context'
      : state === 'REACTIVANDO' ? 'continuity'
        : 'action';

  const components: PulseCoreComponent[] = [
    { key: 'sessions', value: pct(sessions7d / Math.max(1, weekTarget ?? 3)) },
    { key: 'continuity', value: pct(input.streakDays / 7) },
    { key: 'hydration', value: pct(input.hydrationPct / 100) },
    { key: 'balance', value: highLoad ? 40 : 100 },
  ];
  if (input.nutritionPct != null) components.splice(2, 0, { key: 'nutrition', value: pct(input.nutritionPct / 100) });

  // Weights from the engagement plan; missing components are left out and the
  // rest renormalized instead of counting as zero.
  const weights: Record<PulseCoreComponent['key'], number> = {
    sessions: 40, continuity: 20, nutrition: 15, hydration: 15, balance: 10,
  };
  const totalWeight = components.reduce((total, component) => total + weights[component.key], 0);
  const momentum = done.length || input.streakDays
    ? Math.round(components.reduce((total, component) => total + component.value * weights[component.key], 0) / totalWeight)
    : 0;

  return {
    state,
    tone,
    halo: state === 'ACTIVO' || state === 'CARGADO',
    weekSessions,
    weekTarget,
    momentum,
    components,
  };
}

function pct(ratio: number): number {
  return Math.round(Math.max(0, Math.min(1, ratio)) * 100);
}

// ── strength trend ──────────────────────────────────────────────────────────

export type TrendRange = 7 | 28 | 90;

export interface MovementTrend {
  exerciseId: string;
  name: string;
  currentE1rm: number;
  deltaPct: number;
  points: number;
}

export interface StrengthTrend {
  /** Mean % change across movements with ≥ 2 sessions in range; null without data. */
  deltaPct: number | null;
  /** Relative strength index per bucket (1 = first value in range); null = no data. */
  buckets: (number | null)[];
  movements: MovementTrend[];
}

export function computeStrengthTrend(sessions: TrainingSession[], now: number, range: TrendRange): StrengthTrend {
  const start = dayStart(new Date(now)).getTime() - (range - 1) * DAY_MS;
  const bucketCount = range === 7 ? 7 : range === 28 ? 4 : 13;
  const bucketSize = (now - start) / bucketCount;
  const inRange = completed(sessions)
    .filter(session => sessionTime(session) >= start && sessionTime(session) <= now)
    .sort((a, b) => sessionTime(a) - sessionTime(b));

  const series = new Map<string, { name: string; points: { at: number; value: number }[] }>();
  for (const session of inRange) {
    for (const exercise of session.exercises) {
      const top = bestSet(exercise.sets);
      if (!top || top.weightKg <= 0) continue;
      const entry = series.get(exercise.exerciseId) ?? { name: exercise.name, points: [] };
      entry.points.push({ at: sessionTime(session), value: e1rm(top.weightKg, top.reps) });
      series.set(exercise.exerciseId, entry);
    }
  }

  const movements: MovementTrend[] = [];
  const bucketSums: number[] = Array(bucketCount).fill(0);
  const bucketCounts: number[] = Array(bucketCount).fill(0);
  for (const [exerciseId, { name, points }] of series) {
    const first = points[0].value;
    const last = points[points.length - 1].value;
    if (points.length >= 2) {
      movements.push({ exerciseId, name, currentE1rm: round1(last), deltaPct: round1((last / first - 1) * 100), points: points.length });
    }
    for (const point of points) {
      const index = Math.min(bucketCount - 1, Math.max(0, Math.floor((point.at - start) / bucketSize)));
      bucketSums[index] += point.value / first;
      bucketCounts[index] += 1;
    }
  }

  movements.sort((a, b) => b.points - a.points || Math.abs(b.deltaPct) - Math.abs(a.deltaPct) || a.name.localeCompare(b.name, 'es'));
  const deltaPct = movements.length
    ? round1(movements.reduce((total, movement) => total + movement.deltaPct, 0) / movements.length)
    : null;
  return {
    deltaPct,
    buckets: bucketSums.map((sum, index) => bucketCounts[index] ? sum / bucketCounts[index] : null),
    movements: movements.slice(0, 5),
  };
}

// ── free session generator ──────────────────────────────────────────────────

export interface LibraryExercise {
  /** Local exercise id; null for built-in suggestions not yet in the library. */
  exerciseId: string | null;
  name: string;
  muscles: DetailedMuscleKey[];
  equipment: EquipmentKind | null;
  /** How many completed sessions included it — familiar exercises come first. */
  timesPerformed: number;
  last: { sets: number; reps: number; weightKg: number } | null;
  defaults: { sets: number; reps: number; weightKg: number; stepKg: number };
}

export interface FreeSessionItem {
  exerciseId: string | null;
  name: string;
  muscle: DetailedMuscleKey;
  sets: number;
  reps: number;
  /** Last weight the athlete used — never increased automatically. */
  weightKg: number;
  stepKg: number;
}

export interface FreeSessionInput {
  selected: DetailedMuscleKey[];
  library: LibraryExercise[];
  /** Null or empty = any equipment. Unknown equipment only passes with no filter. */
  equipment: EquipmentKind[] | null;
  maxExercises?: number;
}

/** Deterministic: the same selection and library always yield the same session. */
export function generateFreeSession({ selected, library, equipment, maxExercises = 6 }: FreeSessionInput): FreeSessionItem[] {
  if (!selected.length) return [];
  const filter = equipment?.length ? new Set(equipment) : null;
  const eligible = library.filter(item => !filter || (item.equipment != null && filter.has(item.equipment)));
  const perMuscle = selected.length === 1 ? 3 : selected.length <= 3 ? 2 : 1;
  const limit = Math.min(maxExercises, selected.length * perMuscle);

  const ranked = selected.map(muscle => {
    const primary = eligible.filter(item => item.muscles[0] === muscle);
    const secondary = eligible.filter(item => item.muscles[0] !== muscle && item.muscles.includes(muscle));
    const order = (a: LibraryExercise, b: LibraryExercise) =>
      b.timesPerformed - a.timesPerformed || a.name.localeCompare(b.name, 'es');
    return { muscle, candidates: [...primary.sort(order), ...secondary.sort(order)] };
  });

  const used = new Set<string>();
  const items: FreeSessionItem[] = [];
  for (let round = 0; round < perMuscle && items.length < limit; round++) {
    for (const { muscle, candidates } of ranked) {
      if (items.length >= limit) break;
      const next = candidates.find(item => !used.has(normalizeName(item.name)));
      if (!next) continue;
      used.add(normalizeName(next.name));
      items.push({
        exerciseId: next.exerciseId,
        name: next.name,
        muscle,
        sets: next.last?.sets ?? next.defaults.sets,
        reps: next.last?.reps ?? next.defaults.reps,
        weightKg: next.last?.weightKg ?? next.defaults.weightKg,
        stepKg: next.defaults.stepKg,
      });
    }
  }
  return items;
}

export function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase('es');
}
