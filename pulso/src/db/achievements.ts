import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';

import { nanoid } from '@/lib/id';
import { addDays, dateStr } from '@/lib/dates';
import { db } from './index';
import {
  achievementDefinitions,
  athleteAchievements,
  bodyMeasurements,
  dailyNutritionLogs,
  loggedExercises,
  loggedSets,
  mealLogEntries,
  mealSlots,
  personalRecords,
  workoutSessions,
} from './schema';
import { computeStreak } from './checkins';

export async function getCompletedSessionsCount(athleteId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(workoutSessions)
    .where(and(
      eq(workoutSessions.athleteId, athleteId),
      eq(workoutSessions.status, 'completed'),
    ));
  return rows[0]?.n ?? 0;
}

/** PR events = sets that actually beat a previous record (baseline records don't count) */
async function getPRCount(athleteId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(loggedSets)
    .innerJoin(loggedExercises, eq(loggedSets.loggedExerciseId, loggedExercises.id))
    .innerJoin(workoutSessions, eq(loggedExercises.sessionId, workoutSessions.id))
    .where(and(
      eq(workoutSessions.athleteId, athleteId),
      eq(loggedSets.isPR, true),
    ));
  return rows[0]?.n ?? 0;
}

async function getWeightLostKg(athleteId: string): Promise<number> {
  const first = await db
    .select({ w: bodyMeasurements.weightKg })
    .from(bodyMeasurements)
    .where(eq(bodyMeasurements.athleteId, athleteId))
    .orderBy(asc(bodyMeasurements.measuredAt))
    .limit(1);
  const last = await db
    .select({ w: bodyMeasurements.weightKg })
    .from(bodyMeasurements)
    .where(eq(bodyMeasurements.athleteId, athleteId))
    .orderBy(desc(bodyMeasurements.measuredAt))
    .limit(1);
  if (!first[0] || !last[0]) return 0;
  return first[0].w - last[0].w;
}

/** Average % of plan meals completed over the last 7 logged days */
async function getNutritionAdherence(athleteId: string): Promise<number> {
  const since = dateStr(addDays(new Date(), -7));
  const logs = await db
    .select()
    .from(dailyNutritionLogs)
    .where(and(
      eq(dailyNutritionLogs.athleteId, athleteId),
      gte(dailyNutritionLogs.date, since),
    ));
  if (logs.length === 0) return 0;

  let totalPct = 0;
  for (const log of logs) {
    if (!log.mealPlanId) continue;
    const slots = await db
      .select({ n: sql<number>`count(*)` })
      .from(mealSlots)
      .where(eq(mealSlots.mealPlanId, log.mealPlanId));
    const slotCount = slots[0]?.n ?? 0;
    if (slotCount === 0) continue;
    const done = await db
      .select({ n: sql<number>`count(*)` })
      .from(mealLogEntries)
      .where(and(
        eq(mealLogEntries.dailyLogId, log.id),
        sql`${mealLogEntries.status} in ('completed', 'substituted')`,
      ));
    totalPct += ((done[0]?.n ?? 0) / slotCount) * 100;
  }
  return totalPct / logs.length;
}

async function getSquatPR(athleteId: string): Promise<number> {
  const rows = await db
    .select({ w: personalRecords.weightKg })
    .from(personalRecords)
    .where(and(
      eq(personalRecords.athleteId, athleteId),
      eq(personalRecords.exerciseId, 'ex_sentadilla'),
    ))
    .limit(1);
  return rows[0]?.w ?? 0;
}

/** Evaluate all achievement conditions and persist newly earned ones. Returns earned map key → earnedAt ms. */
export async function evaluateAchievements(athleteId: string): Promise<Record<string, number>> {
  const defs = await db.select().from(achievementDefinitions);
  const earnedRows = await db
    .select()
    .from(athleteAchievements)
    .where(eq(athleteAchievements.athleteId, athleteId));
  const earnedByDef = new Map(earnedRows.map(r => [r.achievementId, r.earnedAt.getTime()]));

  const [prCount, streak, weightLost, sessions, adherence, squatPR] = await Promise.all([
    getPRCount(athleteId),
    computeStreak(athleteId),
    getWeightLostKg(athleteId),
    getCompletedSessionsCount(athleteId),
    getNutritionAdherence(athleteId),
    getSquatPR(athleteId),
  ]);

  const result: Record<string, number> = {};
  for (const def of defs) {
    const already = earnedByDef.get(def.id);
    if (already != null) {
      result[def.key] = already;
      continue;
    }
    const target = def.conditionValue ?? Infinity;
    let met = false;
    switch (def.conditionType) {
      case 'pr_count':            met = prCount >= target; break;
      case 'streak_days':         met = streak >= target; break;
      case 'weight_lost_kg':      met = weightLost >= target; break;
      case 'session_count':       met = sessions >= target; break;
      case 'nutrition_adherence': met = adherence >= target; break;
      case 'custom':              met = def.key === 'squat_140' && squatPR >= target; break;
    }
    if (met) {
      const now = new Date();
      await db.insert(athleteAchievements).values({
        id: nanoid(),
        athleteId,
        achievementId: def.id,
        earnedAt: now,
      }).onConflictDoNothing();
      result[def.key] = now.getTime();
    }
  }
  return result;
}
