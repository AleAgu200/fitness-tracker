import { and, asc, eq } from 'drizzle-orm';

import { nanoid } from '@/lib/id';
import { todayStr } from '@/lib/dates';
import { db } from './index';
import {
  dailyNutritionLogs,
  mealLogEntries,
  mealPlans,
  mealSlots,
  waterLogs,
} from './schema';

export type MealStatusDb = 'completed' | 'substituted' | 'pending';

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

async function syncPlanTargets(mealPlanId: string): Promise<void> {
  const slots = await db.select().from(mealSlots).where(eq(mealSlots.mealPlanId, mealPlanId));
  await db.update(mealPlans).set({
    targetKcal:     slots.reduce((a, s) => a + (s.targetKcal ?? 0), 0),
    targetProteinG: slots.reduce((a, s) => a + (s.targetProteinG ?? 0), 0),
    targetCarbsG:   slots.reduce((a, s) => a + (s.targetCarbsG ?? 0), 0),
    targetFatG:     slots.reduce((a, s) => a + (s.targetFatG ?? 0), 0),
  }).where(eq(mealPlans.id, mealPlanId));
}

export async function getMealPlan(athleteId: string): Promise<{ mealPlanId: string; meals: MealSlotUI[] }> {
  const mealPlanId = await getOrCreateMealPlan(athleteId);
  const slots = await db
    .select()
    .from(mealSlots)
    .where(eq(mealSlots.mealPlanId, mealPlanId))
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

export async function addMealSlot(mealPlanId: string, draft: MealDraft): Promise<string> {
  const existing = await db
    .select({ id: mealSlots.id })
    .from(mealSlots)
    .where(eq(mealSlots.mealPlanId, mealPlanId));
  const id = nanoid();
  await db.insert(mealSlots).values({
    id,
    mealPlanId,
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

/** Replace the whole plan with a nutritionist-assigned one. Today's per-slot statuses reset. */
export async function replaceMealSlots(mealPlanId: string, meals: MealDraft[]): Promise<void> {
  const slots = await db
    .select({ id: mealSlots.id })
    .from(mealSlots)
    .where(eq(mealSlots.mealPlanId, mealPlanId));
  for (const s of slots) {
    await db.delete(mealLogEntries).where(eq(mealLogEntries.slotId, s.id));
  }
  await db.delete(mealSlots).where(eq(mealSlots.mealPlanId, mealPlanId));

  if (meals.length > 0) {
    await db.insert(mealSlots).values(
      meals.map((m, i) => ({
        id: nanoid(),
        mealPlanId,
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

async function getOrCreateDailyLog(athleteId: string, mealPlanId: string): Promise<string> {
  const date = todayStr();
  const rows = await db
    .select({ id: dailyNutritionLogs.id })
    .from(dailyNutritionLogs)
    .where(and(eq(dailyNutritionLogs.athleteId, athleteId), eq(dailyNutritionLogs.date, date)))
    .limit(1);
  if (rows[0]) return rows[0].id;

  const id = nanoid();
  await db.insert(dailyNutritionLogs).values({
    id,
    athleteId,
    date,
    mealPlanId,
    createdAt: new Date(),
  });
  return id;
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
  const dailyLogId = await getOrCreateDailyLog(athleteId, mealPlanId);
  const existing = await db
    .select({ id: mealLogEntries.id })
    .from(mealLogEntries)
    .where(and(eq(mealLogEntries.dailyLogId, dailyLogId), eq(mealLogEntries.slotId, slotId)))
    .limit(1);

  if (existing[0]) {
    await db.update(mealLogEntries).set({
      ...(data.status !== undefined ? { status: data.status, loggedAt: new Date() } : {}),
      ...(data.note !== undefined ? { substituteNote: data.note } : {}),
    }).where(eq(mealLogEntries.id, existing[0].id));
  } else {
    await db.insert(mealLogEntries).values({
      id: nanoid(),
      dailyLogId,
      slotId,
      status: data.status ?? 'pending',
      substituteNote: data.note ?? null,
      loggedAt: new Date(),
    });
  }
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
