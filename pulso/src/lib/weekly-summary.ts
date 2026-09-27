// Deterministic weekly story ("Wrapped"), generated on the phone from local
// data. It returns structured pages only — copy lives in the screen — and it
// adapts to missing data: pages without content are omitted, never shown empty.
//
// Editorial rules: no body-weight page (a weight change means nothing without
// the athlete's goal), no injury or fatigue inference, recovery is framed as a
// training note, never a diagnosis.
//
// Pure module (relative imports only) so it runs under `npm test`.

import { addDays, dateStr } from './dates';
import type { DetailedMuscleKey } from './muscles';
import {
  CARD_PRIORITY,
  computeMuscleLoad,
  sessionTime,
  SessionCardDraft,
  TrainingSession,
} from './pulse-engine';

export const WEEKLY_SUMMARY_VERSION = 1;

export interface WeeklyCheckIn {
  date: string; // YYYY-MM-DD
  workoutCompleted: boolean;
  nutritionCompleted: boolean;
  hydrationCompleted: boolean;
}

export type WeeklyPage =
  | { kind: 'intro'; activeDays: number; sessions: number }
  | {
      kind: 'movement';
      sessions: number;
      sets: number;
      tonnageKg: number;
      previousTonnageKg: number | null;
      avgRpe: number | null;
      previousAvgRpe: number | null;
    }
  | { kind: 'muscles'; top: { muscle: DetailedMuscleKey; sets: number }[]; totalSets: number }
  | { kind: 'moment'; card: SessionCardDraft; sessionId: string }
  | { kind: 'consistency'; activeDays: number; workoutDays: number; nutritionDays: number; hydrationDays: number }
  | { kind: 'recovery'; muscles: DetailedMuscleKey[] }
  | { kind: 'next'; goal: 'reactivate' | 'add_one' | 'repeat'; target: number };

export interface WeeklySummary {
  version: number;
  weekStart: string;
  weekEnd: string;
  pages: WeeklyPage[];
}

export interface WeeklySummaryInput {
  /** Monday of the week being summarized (local time). */
  weekStart: Date;
  /** Sessions from at least the previous week through the end of this one. */
  sessions: TrainingSession[];
  checkIns: WeeklyCheckIn[];
  cards: { sessionId: string; draft: SessionCardDraft }[];
  /** Days with exercises in the active plan; 0 without a plan. */
  plannedDaysPerWeek: number;
}

/** A muscle with this many effective sets in the week gets a recovery note. */
const RECOVERY_NOTE_SETS = 12;

export function hasWeeklyData(input: Pick<WeeklySummaryInput, 'weekStart' | 'sessions' | 'checkIns'>): boolean {
  const { start, end } = bounds(input.weekStart);
  return weekSessions(input.sessions, start, end).length > 0
    || input.checkIns.some(checkIn => inWeek(checkIn, input.weekStart) && qualifies(checkIn));
}

export function buildWeeklySummary(input: WeeklySummaryInput): WeeklySummary {
  const { start, end } = bounds(input.weekStart);
  const sessions = weekSessions(input.sessions, start, end);
  const previous = weekSessions(input.sessions, start - 7 * 86_400_000, start);
  const checkIns = input.checkIns.filter(checkIn => inWeek(checkIn, input.weekStart));

  const activeDays = checkIns.filter(qualifies).length;
  const sets = sessions.flatMap(session => session.exercises.flatMap(exercise => exercise.sets));
  const pages: WeeklyPage[] = [{ kind: 'intro', activeDays, sessions: sessions.length }];

  if (sessions.length) {
    const previousSets = previous.flatMap(session => session.exercises.flatMap(exercise => exercise.sets));
    pages.push({
      kind: 'movement',
      sessions: sessions.length,
      sets: sets.length,
      tonnageKg: Math.round(tonnage(sets)),
      previousTonnageKg: previous.length ? Math.round(tonnage(previousSets)) : null,
      avgRpe: avgRpe(sets),
      previousAvgRpe: previous.length ? avgRpe(previousSets) : null,
    });
  }

  // `end - 1` keeps the load window inside the week being summarized.
  const load = computeMuscleLoad(sessions, end - 1, 7);
  const ranked = (Object.entries(load.byMuscle) as [DetailedMuscleKey, { sets: number }][])
    .sort((a, b) => b[1].sets - a[1].sets || a[0].localeCompare(b[0]));
  if (ranked.length) {
    pages.push({
      kind: 'muscles',
      top: ranked.slice(0, 4).map(([muscle, entry]) => ({ muscle, sets: entry.sets })),
      totalSets: sets.length,
    });
  }

  const best = input.cards
    .filter(card => sessions.some(session => session.id === card.sessionId))
    .sort((a, b) => CARD_PRIORITY.indexOf(a.draft.type) - CARD_PRIORITY.indexOf(b.draft.type))[0];
  if (best) pages.push({ kind: 'moment', card: best.draft, sessionId: best.sessionId });

  pages.push({
    kind: 'consistency',
    activeDays,
    workoutDays: checkIns.filter(checkIn => checkIn.workoutCompleted).length,
    nutritionDays: checkIns.filter(checkIn => checkIn.nutritionCompleted).length,
    hydrationDays: checkIns.filter(checkIn => checkIn.hydrationCompleted).length,
  });

  const heavy = ranked.filter(([, entry]) => entry.sets >= RECOVERY_NOTE_SETS).slice(0, 2).map(([muscle]) => muscle);
  if (heavy.length) pages.push({ kind: 'recovery', muscles: heavy });

  const planned = input.plannedDaysPerWeek;
  if (!sessions.length) {
    pages.push({ kind: 'next', goal: 'reactivate', target: 1 });
  } else if (planned > 0 && sessions.length < planned) {
    pages.push({ kind: 'next', goal: 'add_one', target: sessions.length + 1 });
  } else {
    pages.push({ kind: 'next', goal: 'repeat', target: sessions.length });
  }

  return {
    version: WEEKLY_SUMMARY_VERSION,
    weekStart: dateStr(input.weekStart),
    weekEnd: dateStr(addDays(input.weekStart, 6)),
    pages,
  };
}

function bounds(weekStart: Date): { start: number; end: number } {
  return { start: weekStart.getTime(), end: addDays(weekStart, 7).getTime() };
}

function weekSessions(sessions: TrainingSession[], start: number, end: number): TrainingSession[] {
  return sessions.filter(session =>
    session.status === 'completed' && sessionTime(session) >= start && sessionTime(session) < end);
}

function inWeek(checkIn: WeeklyCheckIn, weekStart: Date): boolean {
  return checkIn.date >= dateStr(weekStart) && checkIn.date <= dateStr(addDays(weekStart, 6));
}

function qualifies(checkIn: WeeklyCheckIn): boolean {
  return checkIn.workoutCompleted || checkIn.nutritionCompleted || checkIn.hydrationCompleted;
}

function tonnage(sets: { weightKg: number; reps: number }[]): number {
  return sets.reduce((total, set) => total + set.weightKg * set.reps, 0);
}

function avgRpe(sets: { rpe: number | null }[]): number | null {
  const rated = sets.filter(set => set.rpe != null);
  if (!rated.length) return null;
  return Math.round(rated.reduce((total, set) => total + (set.rpe ?? 0), 0) / rated.length * 10) / 10;
}
