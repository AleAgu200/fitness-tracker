import { and, asc, eq, gte, sql } from 'drizzle-orm';

import { nanoid } from '@/lib/id';
import { dayStart } from '@/lib/dates';
import { db } from './index';
import {
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

async function getOrCreateSession(athleteId: string, templateId: string | null): Promise<string> {
  const existing = await getTodaySession(athleteId);
  if (existing) {
    // Logging a set into a finished session reopens it
    if (existing.completed) {
      await db.update(workoutSessions)
        .set({ status: 'in_progress', finishedAt: null })
        .where(eq(workoutSessions.id, existing.sessionId));
    }
    return existing.sessionId;
  }
  const id = nanoid();
  const now = new Date();
  await db.insert(workoutSessions).values({
    id,
    athleteId,
    templateId,
    startedAt: now,
    status: 'in_progress',
    totalTonnageKg: 0,
    createdAt: now,
  });
  return id;
}

async function getOrCreateLoggedExercise(sessionId: string, exerciseId: string, slotId: string): Promise<string> {
  const rows = await db
    .select({ id: loggedExercises.id })
    .from(loggedExercises)
    .where(and(eq(loggedExercises.sessionId, sessionId), eq(loggedExercises.slotId, slotId)))
    .limit(1);
  if (rows[0]) return rows[0].id;

  const existing = await db
    .select({ id: loggedExercises.id })
    .from(loggedExercises)
    .where(eq(loggedExercises.sessionId, sessionId));
  const id = nanoid();
  await db.insert(loggedExercises).values({
    id,
    sessionId,
    exerciseId,
    slotId,
    exerciseOrder: existing.length,
  });
  return id;
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
  const sessionId = await getOrCreateSession(athleteId, templateId);
  const loggedExerciseId = await getOrCreateLoggedExercise(sessionId, slot.exerciseId, slot.slotId);

  const prior = await db
    .select({ n: sql<number>`count(*)` })
    .from(loggedSets)
    .where(eq(loggedSets.loggedExerciseId, loggedExerciseId));
  const setNumber = (prior[0]?.n ?? 0) + 1;

  // PR check against the persisted record for this exercise
  const prRows = await db
    .select()
    .from(personalRecords)
    .where(and(
      eq(personalRecords.athleteId, athleteId),
      eq(personalRecords.exerciseId, slot.exerciseId),
    ))
    .limit(1);
  // First set on an exercise establishes a baseline record silently; only beating it is a PR
  const hasRecord = !!prRows[0];
  const isPR = hasRecord && set.peso > prRows[0].weightKg;
  const now = new Date();

  await db.insert(loggedSets).values({
    id: nanoid(),
    loggedExerciseId,
    setNumber,
    weightKg: set.peso,
    reps: set.reps,
    rpe: set.rpe,
    isPR,
    completedAt: now,
  });

  if (isPR || !hasRecord) {
    const e1rm = +(set.peso * (1 + set.reps / 30)).toFixed(1);
    if (prRows[0]) {
      await db.update(personalRecords)
        .set({ weightKg: set.peso, reps: set.reps, e1rm, achievedAt: now, sessionId })
        .where(eq(personalRecords.id, prRows[0].id));
    } else {
      await db.insert(personalRecords).values({
        id: nanoid(),
        athleteId,
        exerciseId: slot.exerciseId,
        weightKg: set.peso,
        reps: set.reps,
        e1rm,
        achievedAt: now,
        sessionId,
      });
    }
  }

  await db.update(workoutSessions)
    .set({ totalTonnageKg: sql`${workoutSessions.totalTonnageKg} + ${set.peso * set.reps}` })
    .where(eq(workoutSessions.id, sessionId));

  return { sessionId, isPR };
}

export async function finishSession(sessionId: string): Promise<void> {
  await db.update(workoutSessions)
    .set({ status: 'completed', finishedAt: new Date() })
    .where(eq(workoutSessions.id, sessionId));
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
