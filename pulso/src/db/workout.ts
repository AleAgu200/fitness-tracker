import { and, asc, desc, eq, gte, isNotNull, isNull, lt, sql } from 'drizzle-orm';

import { nanoid } from '@/lib/id';
import { dayStart, weekdayOf } from '@/lib/dates';
import type { PreviousPulseRef } from '@/lib/pulse-engine';
import { computeExerciseRecords, newSetImproves, RecordSet, SetKind } from '@/lib/strength-records';
import { getPlan, getTemplateExercises, PlanExercise, resolveExerciseId } from './plan';
import { enqueueSyncMutation } from './sync';
import { db } from './index';
import {
  exercises,
  loggedExercises,
  loggedSets,
  personalRecords,
  syncOutbox,
  templateExerciseSlots,
  watchCommands,
  workoutSessions,
  workoutTemplates,
} from './schema';

export interface LoggedSetRow {
  reps: number;
  peso: number;
  rpe: number;
  pr: boolean;
  workingSeconds: number | null;
}

export interface TodaySession {
  sessionId: string;
  completed: boolean;
  templateId: string | null;
  /** 'free' when today's session was generated from the body map. */
  kind: 'plan' | 'free';
  /** Label of a free session (e.g. "PECHO + CUÁDRICEPS"); null for plan days. */
  label: string | null;
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

/** Adapts a previous session to the comparison input of lib/pulse-engine. */
export function previousPulseRef(previous: PreviousExerciseSession): PreviousPulseRef {
  return {
    bestSet: { weightKg: previous.bestSet.peso, reps: previous.bestSet.reps, rpe: previous.bestSet.rpe },
    at: previous.completedAt.getTime(),
  };
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
      workingSeconds: loggedSets.workingSeconds,
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
    workingSeconds: row.workingSeconds,
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
      workingSeconds: loggedSets.workingSeconds,
      setNumber: loggedSets.setNumber,
    })
    .from(loggedSets)
    .innerJoin(loggedExercises, eq(loggedSets.loggedExerciseId, loggedExercises.id))
    .where(eq(loggedExercises.sessionId, session.id))
    .orderBy(asc(loggedSets.setNumber));

  const log: Record<string, LoggedSetRow[]> = {};
  for (const r of rows) {
    if (!r.slotId) continue;
    (log[r.slotId] ??= []).push({ reps: r.reps, peso: r.peso, rpe: r.rpe ?? 8, pr: r.pr, workingSeconds: r.workingSeconds });
  }
  const [template] = session.templateId
    ? await db.select({ kind: workoutTemplates.kind, name: workoutTemplates.name })
      .from(workoutTemplates).where(eq(workoutTemplates.id, session.templateId)).limit(1)
    : [];
  const kind = template?.kind ?? 'plan';
  return {
    sessionId: session.id,
    completed: session.status === 'completed',
    templateId: template ? session.templateId : null,
    kind,
    label: kind === 'free' ? template?.name ?? null : null,
    log,
  };
}

export interface TodayPlan {
  templateId: string;
  exercises: PlanExercise[];
  /** Non-null while today's session is a free one generated from the body map. */
  free: { label: string } | null;
  session: TodaySession | null;
}

/** What Entreno trains today: a free session if one was started, otherwise
 *  the active plan's template for today's weekday. */
export async function getTodayPlan(athleteId: string): Promise<TodayPlan> {
  const session = await getTodaySession(athleteId);
  if (session?.kind === 'free' && session.templateId) {
    return {
      templateId: session.templateId,
      exercises: await getTemplateExercises(athleteId, session.templateId),
      free: { label: session.label ?? 'SESIÓN LIBRE' },
      session,
    };
  }
  const plan = await getPlan(athleteId, weekdayOf(new Date()));
  return { ...plan, free: null, session };
}

export interface FreeSessionExercise {
  nombre: string;
  target: number;
  reps: number;
  peso: number;
  step: number;
}

/**
 * Starts today's session from a body-map selection. The exercises live in a
 * one-off 'free' template outside every weekly plan, so neither the athlete's
 * plan nor a coach's is modified. Refuses once today already has logged sets.
 */
export async function startFreeSession(
  athleteId: string,
  label: string,
  items: FreeSessionExercise[],
): Promise<void> {
  const today = await getTodaySession(athleteId);
  if (today && Object.keys(today.log).length > 0) throw new Error('session_in_progress');

  const exerciseIds: string[] = [];
  for (const item of items) exerciseIds.push(await resolveExerciseId(athleteId, item.nombre));

  const now = new Date();
  const templateId = nanoid();
  await db.transaction(async tx => {
    await tx.insert(workoutTemplates).values({
      id: templateId,
      programId: null,
      coachId: null,
      name: label,
      sessionLabel: 'LIBRE',
      type: null,
      templateOrder: null,
      weekday: null,
      kind: 'free',
      createdAt: now,
    });
    await tx.insert(templateExerciseSlots).values(items.map((item, index) => ({
      id: nanoid(),
      templateId,
      exerciseId: exerciseIds[index],
      slotOrder: index,
      targetSets: item.target,
      targetReps: item.reps,
      targetWeightKg: item.peso,
      restSeconds: 90,
      stepKg: item.step,
    })));
    if (today) {
      await tx.update(workoutSessions)
        .set({ templateId, status: 'in_progress', finishedAt: null, startedAt: now })
        .where(eq(workoutSessions.id, today.sessionId));
    } else {
      await tx.insert(workoutSessions).values({
        id: nanoid(), athleteId, templateId, startedAt: now, status: 'in_progress', totalTonnageKg: 0, createdAt: now,
      });
    }
  });
  if (today?.kind === 'free' && today.templateId) await deleteFreeTemplate(today.templateId);
}

/** Drops today's free session while nothing was logged, so the plan day returns. */
export async function discardFreeSession(athleteId: string): Promise<void> {
  const today = await getTodaySession(athleteId);
  if (!today || today.kind !== 'free' || Object.keys(today.log).length > 0) return;
  await db.delete(workoutSessions).where(eq(workoutSessions.id, today.sessionId));
  if (today.templateId) await deleteFreeTemplate(today.templateId);
}

async function deleteFreeTemplate(templateId: string): Promise<void> {
  await db.transaction(async tx => {
    await tx.delete(templateExerciseSlots).where(eq(templateExerciseSlots.templateId, templateId));
    await tx.delete(workoutTemplates).where(and(eq(workoutTemplates.id, templateId), eq(workoutTemplates.kind, 'free')));
  });
}

export interface LogSetResult {
  sessionId: string;
  setId: string;
  /** Heavier external load than any earlier working set of this exercise. */
  isPR: boolean;
  /** Better estimated 1RM than any earlier eligible set (may be a lighter set). */
  isEstimatePR: boolean;
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type RecordReader = Pick<typeof db, 'select'> | Pick<Transaction, 'select'>;
type RecordWriter = Pick<Transaction, 'select' | 'insert' | 'update' | 'delete'>;

/** Every surviving logged set of one exercise for this athlete, in any session. */
async function loadRecordSets(reader: RecordReader, athleteId: string, exerciseId: string): Promise<RecordSet[]> {
  const rows = await reader
    .select({
      weightKg: loggedSets.weightKg,
      reps: loggedSets.reps,
      completedAt: loggedSets.completedAt,
      kind: loggedSets.setType,
      sessionId: loggedExercises.sessionId,
    })
    .from(loggedSets)
    .innerJoin(loggedExercises, eq(loggedSets.loggedExerciseId, loggedExercises.id))
    .innerJoin(workoutSessions, eq(loggedExercises.sessionId, workoutSessions.id))
    .where(and(eq(workoutSessions.athleteId, athleteId), eq(loggedExercises.exerciseId, exerciseId)));
  return rows.map(row => ({ ...row, completedAt: row.completedAt.getTime() }));
}

async function exerciseEquipment(reader: RecordReader, exerciseId: string): Promise<string | null> {
  const [row] = await reader.select({ equipment: exercises.equipment }).from(exercises).where(eq(exercises.id, exerciseId)).limit(1);
  return row?.equipment ?? null;
}

/**
 * Rewrites the stored record row of one exercise from the given sets. The row
 * is derived data: callers pass every surviving set, so an edit, deletion,
 * import or restore can never leave a record that no set supports.
 */
async function writeExerciseRecord(
  tx: RecordWriter,
  athleteId: string,
  exerciseId: string,
  sets: RecordSet[],
  equipment: string | null,
): Promise<void> {
  const records = computeExerciseRecords(sets, equipment);
  const top = records.heaviest ?? records.mostReps;
  const [existing] = await tx.select({ id: personalRecords.id }).from(personalRecords).where(and(
    eq(personalRecords.athleteId, athleteId), eq(personalRecords.exerciseId, exerciseId),
  )).limit(1);
  if (!top) {
    if (existing) await tx.delete(personalRecords).where(eq(personalRecords.id, existing.id));
    return;
  }
  const estimate = records.bestEstimate;
  const values = {
    weightKg: records.heaviest?.weightKg ?? 0,
    reps: top.reps,
    achievedAt: new Date(top.at),
    sessionId: top.sessionId,
    e1rm: estimate ? +estimate.e1rm.toFixed(1) : null,
    e1rmWeightKg: estimate?.weightKg ?? null,
    e1rmReps: estimate?.reps ?? null,
    e1rmAchievedAt: estimate ? new Date(estimate.at) : null,
  };
  if (existing) await tx.update(personalRecords).set(values).where(eq(personalRecords.id, existing.id));
  else await tx.insert(personalRecords).values({ id: nanoid(), athleteId, exerciseId, ...values });
}

/** Recomputes one exercise's record from its surviving sets. */
export async function recomputeExerciseRecord(athleteId: string, exerciseId: string): Promise<void> {
  await db.transaction(async tx => {
    const [sets, equipment] = await Promise.all([loadRecordSets(tx, athleteId, exerciseId), exerciseEquipment(tx, exerciseId)]);
    await writeExerciseRecord(tx, athleteId, exerciseId, sets, equipment);
  });
}

/**
 * Recomputes every exercise the athlete has sets for, and drops records no set
 * supports. Used after a restore or import, and once to replace records
 * written before heaviest load and best estimate were kept apart.
 */
export async function recomputeAllRecords(athleteId: string): Promise<void> {
  const logged = await db
    .selectDistinct({ exerciseId: loggedExercises.exerciseId })
    .from(loggedExercises)
    .innerJoin(workoutSessions, eq(loggedExercises.sessionId, workoutSessions.id))
    .where(eq(workoutSessions.athleteId, athleteId));
  const stored = await db.select({ exerciseId: personalRecords.exerciseId }).from(personalRecords)
    .where(eq(personalRecords.athleteId, athleteId));
  const ids = new Set([...logged.map(row => row.exerciseId), ...stored.map(row => row.exerciseId)]);
  for (const exerciseId of ids) await recomputeExerciseRecord(athleteId, exerciseId);
}

/**
 * Records stored before migration 0015 took their estimate from the heaviest
 * set. Such rows have an e1rm but no e1rm set; recomputing clears that state
 * (to a real estimate set, or to no estimate), so this runs only once.
 */
export async function upgradeLegacyRecords(athleteId: string): Promise<void> {
  const [legacy] = await db.select({ id: personalRecords.id }).from(personalRecords).where(and(
    eq(personalRecords.athleteId, athleteId),
    isNotNull(personalRecords.e1rm),
    isNull(personalRecords.e1rmWeightKg),
  )).limit(1);
  if (legacy) await recomputeAllRecords(athleteId);
}

export async function logSet(
  athleteId: string,
  templateId: string | null,
  slot: { slotId: string; exerciseId: string },
  set: { peso: number; reps: number; rpe: number; workingSeconds?: number | null; kind?: SetKind },
  /** A watch command that logged this set: recorded in the same transaction (exactly once). */
  origin?: { watchCommandId: string },
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
    const now = new Date();
    const kind = set.kind ?? 'working';
    const [history, equipment] = await Promise.all([
      loadRecordSets(tx, athleteId, slot.exerciseId),
      exerciseEquipment(tx, slot.exerciseId),
    ]);
    const newSet: RecordSet = { weightKg: set.peso, reps: set.reps, completedAt: now.getTime(), kind, sessionId };
    const improves = newSetImproves(computeExerciseRecords(history, equipment), newSet, equipment);
    const isPR = improves.heavier;
    const setId = nanoid();
    await tx.insert(loggedSets).values({
      id: setId, loggedExerciseId: loggedExercise.id, setNumber, weightKg: set.peso,
      reps: set.reps, rpe: set.rpe, isPR, setType: kind, workingSeconds: set.workingSeconds ?? null, completedAt: now,
    });
    await writeExerciseRecord(tx, athleteId, slot.exerciseId, [...history, newSet], equipment);
    if (origin) {
      await tx.insert(watchCommands).values({
        commandId: origin.watchCommandId, athleteId, type: 'log_set', status: 'saved', reason: null, setId, receivedAt: now,
      });
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
    return { sessionId, setId, isPR, isEstimatePR: improves.strongerEstimate };
  });
}

/** Today's last logged set of a plan slot, and whether it has not left the phone yet. */
export async function lastSetOfSlot(athleteId: string, slotId: string): Promise<{ setId: string; unsynced: boolean } | null> {
  const [row] = await db.select({ id: loggedSets.id })
    .from(loggedSets)
    .innerJoin(loggedExercises, eq(loggedSets.loggedExerciseId, loggedExercises.id))
    .innerJoin(workoutSessions, eq(loggedExercises.sessionId, workoutSessions.id))
    .where(and(
      eq(workoutSessions.athleteId, athleteId),
      gte(workoutSessions.createdAt, dayStart(new Date())),
      eq(loggedExercises.slotId, slotId),
    ))
    .orderBy(desc(loggedSets.setNumber))
    .limit(1);
  if (!row) return null;
  // Acknowledged mutations are removed from the outbox: a create still queued
  // (or rejected) means the server never stored this set.
  const [queued] = await db.select({ id: syncOutbox.mutationId }).from(syncOutbox)
    .where(and(eq(syncOutbox.athleteId, athleteId), eq(syncOutbox.entityType, 'training_set'), eq(syncOutbox.entityId, row.id)))
    .limit(1);
  return { setId: row.id, unsynced: queued != null };
}

export async function slotOfSet(setId: string): Promise<string | null> {
  const [row] = await db.select({ slotId: loggedExercises.slotId })
    .from(loggedSets)
    .innerJoin(loggedExercises, eq(loggedSets.loggedExerciseId, loggedExercises.id))
    .where(eq(loggedSets.id, setId))
    .limit(1);
  return row?.slotId ?? null;
}

export class UndoRefusedError extends Error {}

/**
 * Removes a set that is still only on this phone and still the last of its
 * exercise: its queued create is dropped with it, the session volume and the
 * exercise's records are recomputed. A set the server already has is refused —
 * training sets are immutable there.
 */
export async function undoSet(
  athleteId: string,
  slotId: string,
  setId: string,
  origin?: { watchCommandId: string },
): Promise<void> {
  await db.transaction(async tx => {
    const [row] = await tx.select({
      id: loggedSets.id, weightKg: loggedSets.weightKg, reps: loggedSets.reps,
      sessionId: loggedExercises.sessionId, exerciseId: loggedExercises.exerciseId, loggedExerciseId: loggedExercises.id,
    })
      .from(loggedSets)
      .innerJoin(loggedExercises, eq(loggedSets.loggedExerciseId, loggedExercises.id))
      .innerJoin(workoutSessions, eq(loggedExercises.sessionId, workoutSessions.id))
      .where(and(eq(loggedSets.id, setId), eq(workoutSessions.athleteId, athleteId), eq(loggedExercises.slotId, slotId)))
      .limit(1);
    if (!row) throw new UndoRefusedError('not_found');
    const [last] = await tx.select({ id: loggedSets.id }).from(loggedSets)
      .where(eq(loggedSets.loggedExerciseId, row.loggedExerciseId))
      .orderBy(desc(loggedSets.setNumber)).limit(1);
    if (last?.id !== setId) throw new UndoRefusedError('conflict');
    const queued = await tx.select({ id: syncOutbox.mutationId }).from(syncOutbox)
      .where(and(eq(syncOutbox.athleteId, athleteId), eq(syncOutbox.entityType, 'training_set'), eq(syncOutbox.entityId, setId)));
    if (!queued.length) throw new UndoRefusedError('already_synced');

    await tx.delete(syncOutbox).where(and(eq(syncOutbox.athleteId, athleteId), eq(syncOutbox.entityType, 'training_set'), eq(syncOutbox.entityId, setId)));
    await tx.delete(loggedSets).where(eq(loggedSets.id, setId));
    await tx.update(workoutSessions)
      .set({ totalTonnageKg: sql`max(0, ${workoutSessions.totalTonnageKg} - ${row.weightKg * row.reps})` })
      .where(eq(workoutSessions.id, row.sessionId));
    const [history, equipment] = await Promise.all([loadRecordSets(tx, athleteId, row.exerciseId), exerciseEquipment(tx, row.exerciseId)]);
    await writeExerciseRecord(tx, athleteId, row.exerciseId, history, equipment);
    if (origin) {
      await tx.insert(watchCommands).values({
        commandId: origin.watchCommandId, athleteId, type: 'undo_set', status: 'saved', reason: null, setId, receivedAt: new Date(),
      });
    }
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
  /** Heaviest external load; 0 for bodyweight work, where reps is the record. */
  weightKg: number;
  reps: number;
  achievedAt: Date;
  /** Best estimated 1RM and the set it came from; null when no set qualifies. */
  estimate: { e1rm: number; weightKg: number; reps: number; achievedAt: Date } | null;
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
      estimate: r.e1rm != null && r.e1rmWeightKg != null && r.e1rmReps != null && r.e1rmAchievedAt != null
        ? { e1rm: r.e1rm, weightKg: r.e1rmWeightKg, reps: r.e1rmReps, achievedAt: r.e1rmAchievedAt }
        : null,
    }));
}
