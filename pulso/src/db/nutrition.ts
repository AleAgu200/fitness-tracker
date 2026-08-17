import { and, asc, eq } from 'drizzle-orm';

import { nanoid } from '@/lib/id';
import { todayStr } from '@/lib/dates';
import { db } from './index';
import { enqueueSyncMutation } from './sync';
import {
  dailyNutritionLogs,
  mealLogEntries,
  mealPlans,
  mealSlots,
  waterLogs,
} from './schema';

export type MealStatusDb = 'completed' | 'substituted' | 'pending';

/** Weekdays a meal plan covers, 1 = Monday. */
export const DAYS_PER_WEEK = 7;

export interface MealSlotUI {
  id: string;
  label: string;
  time: string;
  n: string;
  kcal: number;
  p: number;
  c: number;
  g: number;
}

export interface MealDraft {
  label: string;
  time: string;
  n: string;
  kcal: number;
  p: number;
  c: number;
  g: number;
}

async function getOrCreateMealPlan(athleteId: string): Promise<string> {
  const rows = await db
    .select({ id: mealPlans.id })
    .from(mealPlans)
    .where(and(eq(mealPlans.athleteId, athleteId), eq(mealPlans.active, true)))
    .limit(1);
  if (rows[0]) return rows[0].id;

  const id = nanoid();
  await db.insert(mealPlans).values({
    id,
    athleteId,
    coachId: null,
    name: 'Plan personal',
    targetKcal: 0,
    targetProteinG: 0,
    targetCarbsG: 0,
    targetFatG: 0,
    active: true,
    createdAt: new Date(),
  });
  return id;
}

/** The plan's targets describe a *day*, not the week, so the per-slot figures
 *  are averaged over the days that actually have meals. Summing every slot
 *  outright would report seven times the daily calorie goal. */
async function syncPlanTargets(mealPlanId: string): Promise<void> {
  const slots = await db.select().from(mealSlots).where(eq(mealSlots.mealPlanId, mealPlanId));
  const dayCount = new Set(slots.map(s => s.weekday)).size || 1;
  const perDay = (pick: (s: typeof slots[number]) => number | null) =>
    Math.round(slots.reduce((a, s) => a + (pick(s) ?? 0), 0) / dayCount);

  await db.update(mealPlans).set({
    targetKcal:     perDay(s => s.targetKcal),
    targetProteinG: perDay(s => s.targetProteinG),
    targetCarbsG:   perDay(s => s.targetCarbsG),
    targetFatG:     perDay(s => s.targetFatG),
  }).where(eq(mealPlans.id, mealPlanId));
}

export async function getMealPlan(
  athleteId: string,
  weekday: number,
): Promise<{ mealPlanId: string; meals: MealSlotUI[] }> {
  // Plans written before meals had a weekday are spread across the week by
  // migration 0005, not here: doing it lazily on read cannot tell those rows
  // apart from a new plan whose only meal happens to fall on the default day,
  // and would silently copy that one meal onto all seven.
  const mealPlanId = await getOrCreateMealPlan(athleteId);

  const slots = await db
    .select()
    .from(mealSlots)
    .where(and(eq(mealSlots.mealPlanId, mealPlanId), eq(mealSlots.weekday, weekday)))
    .orderBy(asc(mealSlots.slotOrder));
  return {
    mealPlanId,
    meals: slots.map(s => ({
      id: s.id,
      label: s.name,
      time: s.scheduledTime ?? '',
      n: s.defaultName,
      kcal: s.targetKcal ?? 0,
      p: s.targetProteinG ?? 0,
      c: s.targetCarbsG ?? 0,
      g: s.targetFatG ?? 0,
    })),
  };
}

export interface MealWeekdaySummary {
  weekday: number;
  mealCount: number;
}

/** Meal count per day of the week, for showing which days already have a plan. */
export async function getMealWeekSummary(athleteId: string): Promise<MealWeekdaySummary[]> {
  const mealPlanId = await getOrCreateMealPlan(athleteId);
  const slots = await db
    .select({ weekday: mealSlots.weekday })
    .from(mealSlots)
    .where(eq(mealSlots.mealPlanId, mealPlanId));

  const countByWeekday = new Map<number, number>();
  for (const s of slots) countByWeekday.set(s.weekday, (countByWeekday.get(s.weekday) ?? 0) + 1);

  const result: MealWeekdaySummary[] = [];
  for (let weekday = 1; weekday <= DAYS_PER_WEEK; weekday++) {
    result.push({ weekday, mealCount: countByWeekday.get(weekday) ?? 0 });
  }
  return result;
}

export async function addMealSlot(
  mealPlanId: string,
  weekday: number,
  draft: MealDraft,
): Promise<string> {
  const existing = await db
    .select({ id: mealSlots.id })
    .from(mealSlots)
    .where(and(eq(mealSlots.mealPlanId, mealPlanId), eq(mealSlots.weekday, weekday)));
  const id = nanoid();
  await db.insert(mealSlots).values({
    id,
    mealPlanId,
    weekday,
    name: draft.label,
    scheduledTime: draft.time || null,
    slotOrder: existing.length,
    defaultName: draft.n,
    targetKcal: draft.kcal,
    targetProteinG: draft.p,
    targetCarbsG: draft.c,
    targetFatG: draft.g,
  });
  await syncPlanTargets(mealPlanId);
  return id;
}

export async function updateMealSlot(mealPlanId: string, slotId: string, draft: MealDraft): Promise<void> {
  await db.update(mealSlots).set({
    name: draft.label,
    scheduledTime: draft.time || null,
    defaultName: draft.n,
    targetKcal: draft.kcal,
    targetProteinG: draft.p,
    targetCarbsG: draft.c,
    targetFatG: draft.g,
  }).where(eq(mealSlots.id, slotId));
  await syncPlanTargets(mealPlanId);
}

export async function deleteMealSlot(mealPlanId: string, slotId: string): Promise<void> {
  // Entries reference slots with onDelete: restrict — clear them first
  await db.delete(mealLogEntries).where(eq(mealLogEntries.slotId, slotId));
  await db.delete(mealSlots).where(eq(mealSlots.id, slotId));
  await syncPlanTargets(mealPlanId);
}

/** Replace one weekday's meals. Only that day's logged statuses reset — the
 *  other six keep theirs, which matters now that a replacement touches seven
 *  days instead of one. */
export async function replaceMealSlots(
  mealPlanId: string,
  weekday: number,
  meals: MealDraft[],
): Promise<void> {
  const where = and(eq(mealSlots.mealPlanId, mealPlanId), eq(mealSlots.weekday, weekday));
  const slots = await db.select({ id: mealSlots.id }).from(mealSlots).where(where);
  for (const s of slots) {
    // Entries reference slots with onDelete: restrict — clear them first.
    await db.delete(mealLogEntries).where(eq(mealLogEntries.slotId, s.id));
  }
  await db.delete(mealSlots).where(where);

  if (meals.length > 0) {
    await db.insert(mealSlots).values(
      meals.map((m, i) => ({
        id: nanoid(),
        mealPlanId,
        weekday,
        name: m.label,
        scheduledTime: m.time || null,
        slotOrder: i,
        defaultName: m.n,
        targetKcal: m.kcal,
        targetProteinG: m.p,
        targetCarbsG: m.c,
        targetFatG: m.g,
      })),
    );
  }
  await syncPlanTargets(mealPlanId);
}

/** Replace the full week in one pass, for an assigned or generated plan.
 *  Days missing from `week` are cleared, so a plan with fewer days cannot leave
 *  meals from a previous plan stranded on the untouched weekdays. */
export async function replaceWeekMealSlots(
  mealPlanId: string,
  week: { weekday: number; meals: MealDraft[] }[],
): Promise<void> {
  const byWeekday = new Map(week.map(day => [day.weekday, day.meals]));
  for (let weekday = 1; weekday <= DAYS_PER_WEEK; weekday++) {
    await replaceMealSlots(mealPlanId, weekday, byWeekday.get(weekday) ?? []);
  }
}

export async function getTodayMealEntries(
  athleteId: string,
): Promise<{ status: Record<string, MealStatusDb>; notes: Record<string, string> }> {
  const date = todayStr();
  const logs = await db
    .select({ id: dailyNutritionLogs.id })
    .from(dailyNutritionLogs)
    .where(and(eq(dailyNutritionLogs.athleteId, athleteId), eq(dailyNutritionLogs.date, date)))
    .limit(1);
  if (!logs[0]) return { status: {}, notes: {} };

  const entries = await db
    .select()
    .from(mealLogEntries)
    .where(eq(mealLogEntries.dailyLogId, logs[0].id));

  const status: Record<string, MealStatusDb> = {};
  const notes: Record<string, string> = {};
  for (const e of entries) {
    status[e.slotId] = e.status;
    if (e.substituteNote) notes[e.slotId] = e.substituteNote;
  }
  return { status, notes };
}

export async function setMealEntry(
  athleteId: string,
  mealPlanId: string,
  slotId: string,
  data: { status?: MealStatusDb; note?: string },
): Promise<void> {
  await db.transaction(async tx => {
    const date = todayStr();
    let [dailyLog] = await tx.select().from(dailyNutritionLogs)
      .where(and(eq(dailyNutritionLogs.athleteId, athleteId), eq(dailyNutritionLogs.date, date))).limit(1);
    if (!dailyLog) {
      const id = nanoid();
      await tx.insert(dailyNutritionLogs).values({ id, athleteId, date, mealPlanId, createdAt: new Date() });
      [dailyLog] = await tx.select().from(dailyNutritionLogs).where(eq(dailyNutritionLogs.id, id)).limit(1);
    }
    const [existing] = await tx.select().from(mealLogEntries)
      .where(and(eq(mealLogEntries.dailyLogId, dailyLog.id), eq(mealLogEntries.slotId, slotId))).limit(1);
    const now = new Date();
    const id = existing?.id ?? nanoid();
    const version = (existing?.syncVersion ?? 0) + 1;
    const status = data.status ?? existing?.status ?? 'pending';
    const note = data.note !== undefined ? data.note : existing?.substituteNote ?? null;
    if (existing) {
      await tx.update(mealLogEntries).set({ status, substituteNote: note, loggedAt: now, syncVersion: version })
        .where(eq(mealLogEntries.id, id));
    } else {
      await tx.insert(mealLogEntries).values({
        id, dailyLogId: dailyLog.id, slotId, status, substituteNote: note, loggedAt: now, syncVersion: version,
      });
    }
    await enqueueSyncMutation(tx, {
      athleteId,
      entityType: 'nutrition_entry',
      entityId: id,
      operation: existing && existing.syncVersion > 0 ? 'update' : 'create',
      baseVersion: existing && existing.syncVersion > 0 ? existing.syncVersion : null,
      occurredAt: now,
      payload: { mealKey: slotId, status, note, occurredAt: now.getTime(), version },
    });
  });
}

export async function getTodayWater(athleteId: string): Promise<number> {
  const rows = await db
    .select({ glasses: waterLogs.glasses })
    .from(waterLogs)
    .where(and(eq(waterLogs.athleteId, athleteId), eq(waterLogs.date, todayStr())))
    .limit(1);
  return rows[0]?.glasses ?? 0;
}

export async function setTodayWater(athleteId: string, glasses: number): Promise<void> {
  const date = todayStr();
  const mlTotal = glasses * 350;
  const rows = await db
    .select({ id: waterLogs.id })
    .from(waterLogs)
    .where(and(eq(waterLogs.athleteId, athleteId), eq(waterLogs.date, date)))
    .limit(1);
  if (rows[0]) {
    await db.update(waterLogs).set({ glasses, mlTotal }).where(eq(waterLogs.id, rows[0].id));
  } else {
    await db.insert(waterLogs).values({ id: nanoid(), athleteId, date, glasses, mlTotal });
  }
}
