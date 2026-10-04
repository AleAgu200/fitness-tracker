/**
 * Health data rules shared by Health Connect and Apple Health. Pure (no React
 * Native, no database, no provider SDK) so every rule runs under `node --test`.
 *
 * - Identity is provider + the provider's record ID. Equal values from two
 *   providers are never assumed to be the same observation.
 * - Daily steps and sleep come from one provider per date (the preferred one);
 *   summaries of different providers are never added together.
 * - Sleep counts the union of overlapping asleep intervals and belongs to the
 *   local date the athlete woke up. No data is not zero.
 */

export type ProviderId = 'health_connect' | 'apple_health';
export type SleepStage = 'asleep' | 'light' | 'deep' | 'rem' | 'awake' | 'in_bed' | 'out_of_bed' | 'unknown';

const ASLEEP: ReadonlySet<SleepStage> = new Set(['asleep', 'light', 'deep', 'rem']);

export function isAsleep(stage: SleepStage): boolean {
  return ASLEEP.has(stage);
}

/** Health Connect SleepStageType → our stage. */
export function healthConnectStage(stage: number): SleepStage {
  switch (stage) {
    case 1: return 'awake';
    case 2: return 'asleep';
    case 3: return 'out_of_bed';
    case 4: return 'light';
    case 5: return 'deep';
    case 6: return 'rem';
    default: return 'unknown';
  }
}

/** HealthKit CategoryValueSleepAnalysis → our stage. */
export function healthKitStage(value: number): SleepStage {
  switch (value) {
    case 0: return 'in_bed';
    case 1: return 'asleep';
    case 2: return 'awake';
    case 3: return 'light'; // "core" sleep
    case 4: return 'deep';
    case 5: return 'rem';
    default: return 'unknown';
  }
}

export interface Interval {
  start: number;
  end: number;
}

/** Merge overlapping or touching intervals; drops empty or inverted ones. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter(interval => Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.end > interval.start)
    .sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged;
}

export function unionMinutes(intervals: Interval[]): number {
  return Math.round(mergeIntervals(intervals).reduce((total, interval) => total + (interval.end - interval.start), 0) / 60_000);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Local calendar date (YYYY-MM-DD) of an instant, in the offset it was
 * recorded in when known (so a trip or a DST change does not move it),
 * otherwise in the phone's offset at that instant.
 */
export function localDateOf(ms: number, offsetMin: number | null, deviceOffsetMin: (ms: number) => number): string {
  const offset = offsetMin ?? deviceOffsetMin(ms);
  const shifted = new Date(ms + offset * 60_000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** The phone's UTC offset in minutes at an instant (east positive), DST-aware. */
export function deviceOffsetMin(ms: number): number {
  return -new Date(ms).getTimezoneOffset();
}

export interface SleepInterval extends Interval {
  stage: SleepStage;
  tzOffsetMin: number | null;
}

/** A gap longer than this splits two sleeps (a night and a later nap). */
const SAME_SLEEP_GAP_MS = 3 * 60 * 60 * 1000;

/**
 * Minutes asleep per wake-up date. Intervals are grouped into sleeps (gaps
 * under 3 h stay together), each sleep belongs to the local date of its last
 * asleep moment, and overlapping intervals — from stages or several apps
 * writing to the same provider — count once.
 */
export function sleepByWakeDate(intervals: SleepInterval[], offsetFor: (ms: number) => number = deviceOffsetMin): Map<string, number> {
  const asleep = intervals.filter(interval => isAsleep(interval.stage) && interval.end > interval.start)
    .sort((a, b) => a.start - b.start);
  const sleeps: SleepInterval[][] = [];
  let current: SleepInterval[] = [];
  let currentEnd = -Infinity;
  for (const interval of asleep) {
    if (current.length && interval.start - currentEnd > SAME_SLEEP_GAP_MS) {
      sleeps.push(current);
      current = [];
    }
    current.push(interval);
    currentEnd = Math.max(currentEnd, interval.end);
  }
  if (current.length) sleeps.push(current);

  const byDate = new Map<string, Interval[]>();
  for (const sleep of sleeps) {
    const last = sleep.reduce((latest, interval) => (interval.end > latest.end ? interval : latest));
    const date = localDateOf(last.end, last.tzOffsetMin, offsetFor);
    byDate.set(date, [...(byDate.get(date) ?? []), ...sleep]);
  }
  const minutes = new Map<string, number>();
  for (const [date, list] of byDate) minutes.set(date, unionMinutes(list));
  return minutes;
}

export interface SourcedValue {
  value: number;
  source: ProviderId | 'manual';
}

/**
 * One provider's summary for a date: the preferred one if it has data,
 * otherwise the first that does. Never a sum across providers.
 */
export function pickProviderSummary(
  byProvider: Partial<Record<ProviderId, number>>,
  preferred: ProviderId | null,
): SourcedValue | null {
  if (preferred && byProvider[preferred] != null) return { value: byProvider[preferred], source: preferred };
  for (const provider of ['health_connect', 'apple_health'] as const) {
    const value = byProvider[provider];
    if (value != null) return { value, source: provider };
  }
  return null;
}

/**
 * Sleep shown for a wake-up date: a manual entry overrides the provider
 * summary (without touching or adding to it); removing it returns the date
 * to the provider. Null means no data, which is not the same as zero.
 */
export function sleepForDate(
  manualMinutes: number | null,
  byProvider: Partial<Record<ProviderId, number>>,
  preferred: ProviderId | null,
): SourcedValue | null {
  if (manualMinutes != null) return { value: manualMinutes, source: 'manual' };
  return pickProviderSummary(byProvider, preferred);
}

/** The platform's own store is the default source; a restored other one stays selectable. */
export function defaultProvider(platform: string): ProviderId | null {
  return platform === 'android' ? 'health_connect' : platform === 'ios' ? 'apple_health' : null;
}

// ── units and plausibility ──────────────────────────────────────────────────

const MASS_TO_KG: Record<string, number> = {
  kilograms: 1, kg: 1,
  grams: 0.001, g: 0.001,
  pounds: 0.45359237, lb: 0.45359237,
  ounces: 0.028349523125, oz: 0.028349523125,
};

/** Weight in kg, or null for an unknown unit or an implausible body weight. */
export function weightKg(value: number, unit: string): number | null {
  const factor = MASS_TO_KG[unit];
  if (factor == null || !Number.isFinite(value)) return null;
  const kg = value * factor;
  return kg >= 20 && kg <= 400 ? Math.round(kg * 100) / 100 : null;
}

/** Heart rate in bpm, or null outside a human range. */
export function heartRateBpm(value: number): number | null {
  return Number.isFinite(value) && value >= 20 && value <= 250 ? Math.round(value) : null;
}

/** A daily step total, or null when it cannot be one. */
export function dailySteps(value: number): number | null {
  return Number.isFinite(value) && value >= 0 && value <= 200_000 ? Math.round(value) : null;
}

// ── workout export ──────────────────────────────────────────────────────────

export interface CompletedSession {
  id: string;
  status: string;
  startedAt: number | null;
  finishedAt: number | null;
  title: string | null;
}

export interface WorkoutExport {
  /** Stable per session: retries and edits update the same provider record. */
  clientRecordId: string;
  start: number;
  end: number;
  title: string;
}

/** Only real, completed sessions with a positive duration; no invented calories or distance. */
export function workoutExportFor(session: CompletedSession): WorkoutExport | null {
  if (session.status !== 'completed' || session.startedAt == null || session.finishedAt == null) return null;
  if (!(session.finishedAt > session.startedAt)) return null;
  // Health stores reject absurd durations; a session left open for days is not a workout.
  if (session.finishedAt - session.startedAt > 12 * 60 * 60 * 1000) return null;
  return {
    clientRecordId: `pulso-session-${session.id}`,
    start: session.startedAt,
    end: session.finishedAt,
    title: session.title?.trim() || 'Entreno PULSO',
  };
}

/** Records PULSO itself wrote must never come back in as imports. */
export function isOwnRecord(input: { clientRecordId?: string | null; sourceApp?: string | null }, ownApps: string[]): boolean {
  if (input.clientRecordId?.startsWith('pulso-')) return true;
  return input.sourceApp != null && ownApps.includes(input.sourceApp);
}
