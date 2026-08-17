import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';

import { nanoid } from '@/lib/id';
import { dayStart } from '@/lib/dates';
import { enqueueSyncMutation } from './sync';
import { db } from './index';
import {
  exercises,
  loggedExercises,
  loggedSets,
  personalRecords,
  workoutSessions,
} from './schema';

export interface LoggedSetRow {
  reps: number;
  peso: number;
  rpe: number;
  pr: boolean;
}

export interface TodaySession {
  sessionId: string;
  completed: boolean;
  /** sets grouped by plan slot id */
  log: Record<string, LoggedSetRow[]>;
}

export interface PreviousExerciseSession {
  sessionId: string;
  completedAt: Date;
  sets: LoggedSetRow[];
  bestSet: LoggedSetRow;
  bestE1rm: number;
  totalVolumeKg: number;
}

/** Most recent completed session before today that contains this exercise. */
export async function getPreviousExerciseSession(
  athleteId: string,
  exerciseId: string,
): Promise<PreviousExerciseSession | null> {
  const priorExercises = await db
    .select({
      sessionId: workoutSessions.id,
      completedAt: workoutSessions.finishedAt,
    })
    .from(loggedExercises)
    .innerJoin(workoutSessions, eq(loggedExercises.sessionId, workoutSessions.id))
    .where(and(
      eq(workoutSessions.athleteId, athleteId),
      eq(workoutSessions.status, 'completed'),
      eq(loggedExercises.exerciseId, exerciseId),
      lt(workoutSessions.createdAt, dayStart(new Date())),
    ))
    .orderBy(desc(workoutSessions.finishedAt))
    .limit(1);
  const prior = priorExercises[0];
  if (!prior?.completedAt) return null;

  const rows = await db
    .select({
      reps: loggedSets.reps,
      peso: loggedSets.weightKg,
      rpe: loggedSets.rpe,
      pr: loggedSets.isPR,
      setNumber: loggedSets.setNumber,
    })
    .from(loggedSets)
    .innerJoin(loggedExercises, eq(loggedSets.loggedExerciseId, loggedExercises.id))
    .where(and(
      eq(loggedExercises.sessionId, prior.sessionId),
      eq(loggedExercises.exerciseId, exerciseId),
    ))
    .orderBy(asc(loggedSets.setNumber));
  if (!rows.length) return null;

  const sets: LoggedSetRow[] = rows.map(row => ({
    reps: row.reps,
    peso: row.peso,
    rpe: row.rpe ?? 8,
    pr: row.pr,
  }));
  const e1rm = (set: LoggedSetRow) => set.peso * (1 + set.reps / 30);
  const bestSet = sets.reduce((best, set) => e1rm(set) > e1rm(best) ? set : best);

  return {
    sessionId: prior.sessionId,
    completedAt: prior.completedAt,
    sets,
    bestSet,
    bestE1rm: +e1rm(bestSet).toFixed(1),
    totalVolumeKg: sets.reduce((total, set) => total + set.peso * set.reps, 0),
  };
}

export async function getTodaySession(athleteId: string): Promise<TodaySession | null> {
  const start = dayStart(new Date());
  const sessions = await db
    .select()
    .from(workoutSessions)
    .where(and(
      eq(workoutSessions.athleteId, athleteId),
      gte(workoutSessions.createdAt, start),
    ))
    .limit(1);
  const session = sessions[0];
  if (!session) return null;

  const rows = await db
    .select({
      slotId: loggedExercises.slotId,
      reps: loggedSets.reps,
      peso: loggedSets.weightKg,
      rpe: loggedSets.rpe,
      pr: loggedSets.isPR,
      setNumber: loggedSets.setNumber,
    })
    .from(loggedSets)
    .innerJoin(loggedExercises, eq(loggedSets.loggedExerciseId, loggedExercises.id))
    .where(eq(loggedExercises.sessionId, session.id))
    .orderBy(asc(loggedSets.setNumber));

  const log: Record<string, LoggedSetRow[]> = {};
  for (const r of rows) {
    if (!r.slotId) continue;
    (log[r.slotId] ??= []).push({ reps: r.reps, peso: r.peso, rpe: r.rpe ?? 8, pr: r.pr });
  }
  return { sessionId: session.id, completed: session.status === 'completed', log };
}

export interface LogSetResult {
  sessionId: string;
  isPR: boolean;
}

export async function logSet(
  athleteId: string,
  templateId: string | null,
  slot: { slotId: string; exerciseId: string },
  set: { peso: number; reps: number; rpe: number },
): Promise<LogSetResult> {
  return db.transaction(async tx => {
    const start = dayStart(new Date());
    let [session] = await tx.select().from(workoutSessions).where(and(
      eq(workoutSessions.athleteId, athleteId),
      gte(workoutSessions.createdAt, start),
    )).limit(1);
    if (!session) {
      const now = new Date();
      const id = nanoid();
      await tx.insert(workoutSessions).values({ id, athleteId, templateId, startedAt: now, status: 'in_progress', totalTonnageKg: 0, createdAt: now });
      [session] = await tx.select().from(workoutSessions).where(eq(workoutSessions.id, id)).limit(1);
    } else if (session.status === 'completed') {
      await tx.update(workoutSessions).set({ status: 'in_progress', finishedAt: null }).where(eq(workoutSessions.id, session.id));
    }
    const sessionId = session.id;

    let [loggedExercise] = await tx.select().from(loggedExercises).where(and(
      eq(loggedExercises.sessionId, sessionId), eq(loggedExercises.slotId, slot.slotId),
    )).limit(1);
    if (!loggedExercise) {
      const existing = await tx.select({ id: loggedExercises.id }).from(loggedExercises).where(eq(loggedExercises.sessionId, sessionId));
      const id = nanoid();
      await tx.insert(loggedExercises).values({ id, sessionId, exerciseId: slot.exerciseId, slotId: slot.slotId, exerciseOrder: existing.length });
      [loggedExercise] = await tx.select().from(loggedExercises).where(eq(loggedExercises.id, id)).limit(1);
    }

    const prior = await tx.select({ n: sql<number>`count(*)` }).from(loggedSets)
      .where(eq(loggedSets.loggedExerciseId, loggedExercise.id));
    const setNumber = (prior[0]?.n ?? 0) + 1;
    const prRows = await tx.select().from(personalRecords).where(and(
      eq(personalRecords.athleteId, athleteId), eq(personalRecords.exerciseId, slot.exerciseId),
    )).limit(1);
    const hasRecord = !!prRows[0];
    const isPR = hasRecord && set.peso > prRows[0].weightKg;
    const now = new Date();
    const setId = nanoid();
    await tx.insert(loggedSets).values({
      id: setId, loggedExerciseId: loggedExercise.id, setNumber, weightKg: set.peso,
      reps: set.reps, rpe: set.rpe, isPR, completedAt: now,
    });
    if (isPR || !hasRecord) {
      const e1rm = +(set.peso * (1 + set.reps / 30)).toFixed(1);
      if (prRows[0]) {
        await tx.update(personalRecords).set({ weightKg: set.peso, reps: set.reps, e1rm, achievedAt: now, sessionId })
          .where(eq(personalRecords.id, prRows[0].id));
      } else {
        await tx.insert(personalRecords).values({
          id: nanoid(), athleteId, exerciseId: slot.exerciseId, weightKg: set.peso,
          reps: set.reps, e1rm, achievedAt: now, sessionId,
        });
      }
    }
    await tx.update(workoutSessions)
      .set({ totalTonnageKg: sql`${workoutSessions.totalTonnageKg} + ${set.peso * set.reps}` })
      .where(eq(workoutSessions.id, sessionId));
    const [exercise] = await tx.select({ name: exercises.name }).from(exercises).where(eq(exercises.id, slot.exerciseId)).limit(1);
    await enqueueSyncMutation(tx, {
      athleteId, entityType: 'training_set', entityId: setId, operation: 'create', occurredAt: now,
      payload: {
        sessionId, exerciseName: exercise?.name ?? 'Ejercicio', setIndex: setNumber,
        reps: set.reps, weightKg: set.peso, isPersonalRecord: isPR,
        completedAt: now.getTime(), version: 1,
      },
    });
    return { sessionId, isPR };
  });
}

export async function finishSession(sessionId: string): Promise<void> {
  await db.transaction(async tx => {
    const [session] = await tx.select().from(workoutSessions).where(eq(workoutSessions.id, sessionId)).limit(1);
    if (!session || session.status === 'completed') return;
    const finishedAt = new Date();
    await tx.update(workoutSessions).set({ status: 'completed', finishedAt }).where(eq(workoutSessions.id, sessionId));
    const startedAt = session.startedAt ?? session.createdAt;
    await enqueueSyncMutation(tx, {
      athleteId: session.athleteId,
      entityType: 'training_session',
      entityId: session.id,
      operation: 'create',
      occurredAt: finishedAt,
      payload: {
        plannedSessionId: session.templateId,
        status: 'completed',
        startedAt: startedAt.getTime(),
        completedAt: finishedAt.getTime(),
        durationSeconds: Math.max(0, Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000)),
        totalVolumeKg: session.totalTonnageKg,
        version: 1,
      },
    });
  });
}

export interface PRHistoryItem {
  exerciseId: string;
  nombre: string;
  weightKg: number;
  reps: number;
  achievedAt: Date;
}

export async function getPRHistory(athleteId: string): Promise<PRHistoryItem[]> {
  const rows = await db.query.personalRecords.findMany({
    where: eq(personalRecords.athleteId, athleteId),
  });
  const allExercises = await db.query.exercises.findMany();
  const names = new Map(allExercises.map(e => [e.id, e.name]));
  return rows
    .sort((a, b) => b.achievedAt.getTime() - a.achievedAt.getTime())
    .map(r => ({
      exerciseId: r.exerciseId,
      nombre: names.get(r.exerciseId) ?? '—',
      weightKg: r.weightKg,
      reps: r.reps,
      achievedAt: r.achievedAt,
    }));
}
