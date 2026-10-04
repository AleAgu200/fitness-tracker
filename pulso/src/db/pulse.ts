// Reads local training data into the pure shapes used by lib/pulse-engine and
// lib/weekly-summary, and persists what those rules produce (session cards and
// closed-week summaries). Nothing here touches the network; the only outbox
// writes are cards the athlete explicitly shares with their team.

import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import { addDays, dateStr, mondayOf } from '@/lib/dates';
import { nanoid } from '@/lib/id';
import { DetailedMuscleKey, inferEquipment, inferExerciseMuscles, POPULAR_EXERCISES } from '@/lib/muscles';
import {
  LibraryExercise,
  normalizeName,
  selectSessionCard,
  SessionCardMetric,
  SessionCardType,
  TrainingSession,
} from '@/lib/pulse-engine';
import { buildWeeklySummary, hasWeeklyData, WeeklyCheckIn, WeeklySummary, WEEKLY_SUMMARY_VERSION } from '@/lib/weekly-summary';
import { db } from './index';
import { enqueueSyncMutation } from './sync';
import {
  dailyCheckIns,
  exercises,
  localSharingConsents,
  loggedExercises,
  loggedSets,
  sessionCards,
  templateExerciseSlots,
  weeklySummaries,
  workoutSessions,
  workoutTemplates,
} from './schema';

// ── training history ────────────────────────────────────────────────────────

/** Sessions (with their logged sets) started on or after `since`, oldest first. */
export async function getTrainingSessions(athleteId: string, since: Date): Promise<TrainingSession[]> {
  const sessionRows = await db
    .select({
      id: workoutSessions.id,
      status: workoutSessions.status,
      startedAt: workoutSessions.startedAt,
      createdAt: workoutSessions.createdAt,
      finishedAt: workoutSessions.finishedAt,
      kind: workoutTemplates.kind,
    })
    .from(workoutSessions)
    .leftJoin(workoutTemplates, eq(workoutSessions.templateId, workoutTemplates.id))
    .where(and(eq(workoutSessions.athleteId, athleteId), gte(workoutSessions.createdAt, since)))
    .orderBy(asc(workoutSessions.createdAt));
  if (!sessionRows.length) return [];
  return attachSets(sessionRows);
}

export async function getTrainingSession(sessionId: string): Promise<TrainingSession | null> {
  const rows = await db
    .select({
      id: workoutSessions.id,
      status: workoutSessions.status,
      startedAt: workoutSessions.startedAt,
      createdAt: workoutSessions.createdAt,
      finishedAt: workoutSessions.finishedAt,
      kind: workoutTemplates.kind,
    })
    .from(workoutSessions)
    .leftJoin(workoutTemplates, eq(workoutSessions.templateId, workoutTemplates.id))
    .where(eq(workoutSessions.id, sessionId))
    .limit(1);
  if (!rows.length) return null;
  return (await attachSets(rows))[0];
}

type SessionRow = {
  id: string;
  status: TrainingSession['status'];
  startedAt: Date | null;
  createdAt: Date;
  finishedAt: Date | null;
  kind: 'plan' | 'free' | null;
};

async function attachSets(sessionRows: SessionRow[]): Promise<TrainingSession[]> {
  const setRows = await db
    .select({
      sessionId: loggedExercises.sessionId,
      exerciseId: loggedExercises.exerciseId,
      exerciseOrder: loggedExercises.exerciseOrder,
      name: exercises.name,
      muscleGroup: exercises.muscleGroup,
      equipment: exercises.equipment,
      setNumber: loggedSets.setNumber,
      weightKg: loggedSets.weightKg,
      reps: loggedSets.reps,
      rpe: loggedSets.rpe,
      setType: loggedSets.setType,
    })
    .from(loggedSets)
    .innerJoin(loggedExercises, eq(loggedSets.loggedExerciseId, loggedExercises.id))
    .innerJoin(exercises, eq(loggedExercises.exerciseId, exercises.id))
    .where(inArray(loggedExercises.sessionId, sessionRows.map(row => row.id)))
    .orderBy(asc(loggedExercises.exerciseOrder), asc(loggedSets.setNumber));

  const bySession = new Map<string, TrainingSession>();
  for (const row of sessionRows) {
    bySession.set(row.id, {
      id: row.id,
      status: row.status,
      kind: row.kind ?? 'plan',
      startedAt: (row.startedAt ?? row.createdAt).getTime(),
      finishedAt: row.finishedAt?.getTime() ?? null,
      exercises: [],
    });
  }
  for (const row of setRows) {
    const session = bySession.get(row.sessionId);
    if (!session) continue;
    let exercise = session.exercises.find(item => item.exerciseId === row.exerciseId);
    if (!exercise) {
      exercise = {
        exerciseId: row.exerciseId,
        name: row.name,
        muscles: inferExerciseMuscles(row.name, row.muscleGroup),
        equipment: row.equipment,
        sets: [],
      };
      session.exercises.push(exercise);
    }
    exercise.sets.push({ weightKg: row.weightKg, reps: row.reps, rpe: row.rpe, warmup: row.setType === 'warmup' });
  }
  return [...bySession.values()];
}

// ── session cards ───────────────────────────────────────────────────────────

export interface SessionCard {
  id: string;
  sessionId: string;
  type: SessionCardType;
  metric: SessionCardMetric;
  /** Running number of the athlete's cards ("PULSO / 014"). */
  serial: number;
  earnedAt: Date;
  sharedWithTeamAt: Date | null;
}

type StoredMetric = SessionCardMetric & { serial: number };

function toCard(row: typeof sessionCards.$inferSelect): SessionCard {
  const { serial, ...metric } = JSON.parse(row.metricJson) as StoredMetric;
  return {
    id: row.id,
    sessionId: row.sessionId,
    type: row.type,
    metric,
    serial,
    earnedAt: row.earnedAt,
    sharedWithTeamAt: row.sharedWithTeamAt,
  };
}

/** How far back a record/return is looked for. Old enough to span a long break. */
const CARD_HISTORY_DAYS = 365;

/**
 * Evaluates a finished session once and stores its card, if it earned one.
 * Idempotent: a session keeps the card it got the first time it closed.
 */
export async function createSessionCard(athleteId: string, sessionId: string): Promise<SessionCard | null> {
  const existing = await getSessionCard(sessionId);
  if (existing) return existing;

  const session = await getTrainingSession(sessionId);
  if (!session || session.status !== 'completed') return null;
  const history = (await getTrainingSessions(athleteId, addDays(new Date(session.startedAt), -CARD_HISTORY_DAYS)))
    .filter(item => item.id !== sessionId && item.status === 'completed');
  const draft = selectSessionCard({ session, history, plannedTargetSets: await getPlannedTargetSets(sessionId) });
  if (!draft) return null;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(sessionCards)
    .where(eq(sessionCards.athleteId, athleteId));
  const metric: StoredMetric = { ...draft.metric, serial: Number(count) + 1 };
  await db.insert(sessionCards).values({
    id: nanoid(),
    athleteId,
    sessionId,
    type: draft.type,
    metricJson: JSON.stringify(metric),
    earnedAt: new Date(session.finishedAt ?? Date.now()),
  }).onConflictDoNothing();
  return getSessionCard(sessionId);
}

/** Target sets of the plan day the session followed; null for free sessions. */
async function getPlannedTargetSets(sessionId: string): Promise<number | null> {
  const [row] = await db
    .select({ kind: workoutTemplates.kind, templateId: workoutTemplates.id })
    .from(workoutSessions)
    .innerJoin(workoutTemplates, eq(workoutSessions.templateId, workoutTemplates.id))
    .where(eq(workoutSessions.id, sessionId))
    .limit(1);
  if (!row || row.kind !== 'plan') return null;
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${templateExerciseSlots.targetSets}), 0)` })
    .from(templateExerciseSlots)
    .where(eq(templateExerciseSlots.templateId, row.templateId));
  return Number(total) || null;
}

/** Whether any linked team can receive training data (the only way a card leaves the phone). */
export async function canShareTrainingWithTeam(athleteId: string): Promise<boolean> {
  const [row] = await db.select({ id: localSharingConsents.id }).from(localSharingConsents).where(and(
    eq(localSharingConsents.athleteId, athleteId),
    eq(localSharingConsents.category, 'training'),
    eq(localSharingConsents.granted, true),
  )).limit(1);
  return row != null;
}

/**
 * Shares a card with the care team — an explicit choice per card. The mutation
 * waits in the outbox and only leaves while the training consent is granted.
 */
export async function shareSessionCard(athleteId: string, cardId: string): Promise<SessionCard | null> {
  const card = await getSessionCardById(cardId);
  if (!card || card.athleteId !== athleteId) return null;
  const sharedAt = new Date();
  const { serial: _serial, ...metric } = JSON.parse(card.metricJson) as StoredMetric;
  await db.transaction(async tx => {
    await tx.update(sessionCards).set({ sharedWithTeamAt: sharedAt }).where(eq(sessionCards.id, cardId));
    await enqueueSyncMutation(tx, {
      athleteId,
      entityType: 'session_card',
      entityId: cardId,
      operation: 'create',
      occurredAt: sharedAt,
      payload: {
        sessionId: card.sessionId,
        type: card.type,
        metric,
        earnedAt: card.earnedAt.getTime(),
        sharedAt: sharedAt.getTime(),
      },
    });
  });
  return getSessionCard(card.sessionId);
}

export async function unshareSessionCard(athleteId: string, cardId: string): Promise<SessionCard | null> {
  const card = await getSessionCardById(cardId);
  if (!card || card.athleteId !== athleteId) return null;
  const unsharedAt = new Date();
  await db.transaction(async tx => {
    await tx.update(sessionCards).set({ sharedWithTeamAt: null }).where(eq(sessionCards.id, cardId));
    await enqueueSyncMutation(tx, {
      athleteId,
      entityType: 'session_card',
      entityId: cardId,
      operation: 'delete',
      occurredAt: unsharedAt,
      payload: { unsharedAt: unsharedAt.getTime() },
    });
  });
  return getSessionCard(card.sessionId);
}

async function getSessionCardById(cardId: string) {
  const [row] = await db.select().from(sessionCards).where(eq(sessionCards.id, cardId)).limit(1);
  return row ?? null;
}

export async function getSessionCard(sessionId: string): Promise<SessionCard | null> {
  const [row] = await db.select().from(sessionCards).where(eq(sessionCards.sessionId, sessionId)).limit(1);
  return row ? toCard(row) : null;
}

export async function listSessionCards(athleteId: string, limit = 30): Promise<SessionCard[]> {
  const rows = await db
    .select()
    .from(sessionCards)
    .where(eq(sessionCards.athleteId, athleteId))
    .orderBy(desc(sessionCards.earnedAt))
    .limit(limit);
  return rows.map(toCard);
}

// ── weekly summaries ────────────────────────────────────────────────────────

export interface WeekEntry {
  weekStart: Date;
  summary: WeeklySummary;
  viewedAt: Date | null;
}

async function getCheckIns(athleteId: string, from: Date, to: Date): Promise<WeeklyCheckIn[]> {
  const rows = await db
    .select()
    .from(dailyCheckIns)
    .where(and(
      eq(dailyCheckIns.athleteId, athleteId),
      gte(dailyCheckIns.date, dateStr(from)),
      lt(dailyCheckIns.date, dateStr(to)),
    ));
  return rows.map(row => ({
    date: row.date,
    workoutCompleted: row.workoutCompleted,
    nutritionCompleted: row.nutritionCompleted,
    hydrationCompleted: row.hydrationCompleted,
  }));
}

/**
 * Summary of the week starting `weekStart` (a Monday). Closed weeks are built
 * once and cached; the current week is built live and never stored. Returns
 * null when the week has nothing to tell.
 */
export async function getWeeklySummary(
  athleteId: string,
  weekStart: Date,
  plannedDaysPerWeek: number,
): Promise<WeekEntry | null> {
  const key = dateStr(weekStart);
  const closed = addDays(weekStart, 7).getTime() <= mondayOf(new Date()).getTime();
  if (closed) {
    const [cached] = await db.select().from(weeklySummaries)
      .where(and(eq(weeklySummaries.athleteId, athleteId), eq(weeklySummaries.weekStart, key))).limit(1);
    if (cached) {
      const summary = JSON.parse(cached.summaryJson) as WeeklySummary;
      if (summary.version === WEEKLY_SUMMARY_VERSION) return { weekStart, summary, viewedAt: cached.viewedAt };
    }
  }

  const end = addDays(weekStart, 7);
  const [sessions, checkIns, cards] = await Promise.all([
    getTrainingSessions(athleteId, addDays(weekStart, -7)),
    getCheckIns(athleteId, weekStart, end),
    db.select().from(sessionCards).where(and(
      eq(sessionCards.athleteId, athleteId),
      gte(sessionCards.earnedAt, weekStart),
      lt(sessionCards.earnedAt, end),
    )),
  ]);
  if (!hasWeeklyData({ weekStart, sessions, checkIns })) return null;

  const summary = buildWeeklySummary({
    weekStart,
    sessions,
    checkIns,
    cards: cards.map(row => {
      const card = toCard(row);
      return { sessionId: card.sessionId, draft: { type: card.type, metric: card.metric } };
    }),
    plannedDaysPerWeek,
  });
  if (!closed) return { weekStart, summary, viewedAt: null };

  const generatedAt = new Date();
  await db.insert(weeklySummaries).values({
    id: nanoid(), athleteId, weekStart: key, summaryJson: JSON.stringify(summary), generatedAt,
  }).onConflictDoUpdate({
    target: [weeklySummaries.athleteId, weeklySummaries.weekStart],
    set: { summaryJson: JSON.stringify(summary), generatedAt },
  });
  const [stored] = await db.select({ viewedAt: weeklySummaries.viewedAt }).from(weeklySummaries)
    .where(and(eq(weeklySummaries.athleteId, athleteId), eq(weeklySummaries.weekStart, key))).limit(1);
  return { weekStart, summary, viewedAt: stored?.viewedAt ?? null };
}

/** Closed weeks with something to tell, most recent first. */
export async function listRecentWeeks(athleteId: string, plannedDaysPerWeek: number, weeks = 8): Promise<WeekEntry[]> {
  const thisMonday = mondayOf(new Date());
  const result: WeekEntry[] = [];
  for (let i = 1; i <= weeks; i++) {
    const entry = await getWeeklySummary(athleteId, addDays(thisMonday, -7 * i), plannedDaysPerWeek);
    if (entry) result.push(entry);
  }
  return result;
}

export async function markWeeklySummaryViewed(athleteId: string, weekStart: Date): Promise<void> {
  await db.update(weeklySummaries).set({ viewedAt: new Date() }).where(and(
    eq(weeklySummaries.athleteId, athleteId),
    eq(weeklySummaries.weekStart, dateStr(weekStart)),
  ));
}

// ── free-session library ────────────────────────────────────────────────────

/**
 * Exercises the free-session generator may use, offline: everything in the
 * local library (with the athlete's last numbers) plus the built-in popular
 * list for muscles the library doesn't cover yet.
 */
export async function getExerciseLibrary(athleteId: string): Promise<LibraryExercise[]> {
  const [local, history] = await Promise.all([
    db.select().from(exercises),
    getTrainingSessions(athleteId, addDays(new Date(), -180)),
  ]);

  const stats = new Map<string, { times: number; last: LibraryExercise['last'] }>();
  for (const session of history.filter(item => item.status === 'completed')) {
    for (const exercise of session.exercises) {
      if (!exercise.sets.length) continue;
      const top = exercise.sets.reduce((best, set) => set.weightKg > best.weightKg ? set : best);
      stats.set(exercise.exerciseId, {
        times: (stats.get(exercise.exerciseId)?.times ?? 0) + 1,
        last: { sets: exercise.sets.length, reps: top.reps, weightKg: top.weightKg },
      });
    }
  }

  const library: LibraryExercise[] = local.map(exercise => ({
    exerciseId: exercise.id,
    name: exercise.name,
    muscles: inferExerciseMuscles(exercise.name, exercise.muscleGroup),
    equipment: inferEquipment(exercise.name, exercise.equipment),
    timesPerformed: stats.get(exercise.id)?.times ?? 0,
    last: stats.get(exercise.id)?.last ?? null,
    defaults: { sets: 3, reps: 10, weightKg: 0, stepKg: 2.5 },
  })).filter(item => item.muscles.length > 0);

  const known = new Set(library.map(item => normalizeName(item.name)));
  for (const [muscle, list] of Object.entries(POPULAR_EXERCISES) as [DetailedMuscleKey, typeof POPULAR_EXERCISES[DetailedMuscleKey]][]) {
    for (const popular of list) {
      if (known.has(normalizeName(popular.name))) continue;
      known.add(normalizeName(popular.name));
      const inferred = inferExerciseMuscles(popular.name, null);
      library.push({
        exerciseId: null,
        name: popular.name,
        muscles: inferred.length ? inferred : [muscle],
        equipment: inferEquipment(popular.name, null),
        timesPerformed: 0,
        last: null,
        defaults: { sets: popular.sets, reps: popular.reps, weightKg: popular.weight, stepKg: popular.step },
      });
    }
  }
  return library;
}
