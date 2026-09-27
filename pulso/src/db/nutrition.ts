import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import { nanoid } from '@/lib/id';
import { todayStr } from '@/lib/dates';
import { copyPlanName, nextPlanName, normalizePlanName } from '@/lib/plan-limits';
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

export type MealPlanOrigin = 'own' | 'nutritionist' | 'ai';

const DEFAULT_MEAL_PLAN_NAMES: Record<MealPlanOrigin, string> = {
  own: 'Plan personal',
  nutritionist: 'Plan de tu nutricionista',
  ai: 'Plan PULSO IA',
};

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The active meal plan; falls back to the oldest own plan, then creates one. */
async function getOrCreateMealPlan(athleteId: string): Promise<string> {
  const rows = await db
    .select({ id: mealPlans.id })
    .from(mealPlans)
    .where(and(eq(mealPlans.athleteId, athleteId), eq(mealPlans.active, true), isNull(mealPlans.archivedAt)))
    .limit(1);
  if (rows[0]) return rows[0].id;

  const [own] = await db.select({ id: mealPlans.id }).from(mealPlans)
    .where(and(eq(mealPlans.athleteId, athleteId), eq(mealPlans.origin, 'own'), isNull(mealPlans.archivedAt)))
    .orderBy(asc(mealPlans.createdAt))
    .limit(1);
  if (own) {
    await db.update(mealPlans).set({ active: true, lastActivatedAt: new Date() }).where(eq(mealPlans.id, own.id));
    return own.id;
  }
  const id = nanoid();
  await db.transaction(async tx => insertMealPlan(tx, athleteId, id, 'own', { active: true }));
  return id;
}

async function insertMealPlan(
  tx: Transaction,
  athleteId: string,
  id: string,
  origin: MealPlanOrigin,
  options: { active: boolean; name?: string },
): Promise<void> {
  const now = new Date();
  if (options.active) {
    await tx.update(mealPlans).set({ active: false }).where(eq(mealPlans.athleteId, athleteId));
  }
  await tx.insert(mealPlans).values({
    id,
    athleteId,
    coachId: null,
    name: options.name ?? DEFAULT_MEAL_PLAN_NAMES[origin],
    targetKcal: 0,
    targetProteinG: 0,
    targetCarbsG: 0,
    targetFatG: 0,
    active: options.active,
    origin,
    createdAt: now,
    lastActivatedAt: options.active ? now : null,
  });
  if (options.active) await recordMealPlanSelection(tx, athleteId, origin);
}

/**
 * Tells the care team whether the nutritionist's plan is the one in force —
 * never the content of the athlete's other plans. Only once a nutritionist
 * plan exists, and it leaves the phone only with the nutrition consent.
 */
async function recordMealPlanSelection(tx: Transaction, athleteId: string, activeOrigin: MealPlanOrigin): Promise<void> {
  const [assigned] = await tx.select({ id: mealPlans.id }).from(mealPlans)
    .where(and(eq(mealPlans.athleteId, athleteId), eq(mealPlans.origin, 'nutritionist'))).limit(1);
  if (!assigned) return;
  const now = new Date();
  await enqueueSyncMutation(tx, {
    athleteId,
    entityType: 'meal_plan_selection',
    entityId: `meal_plan_selection_${athleteId}`,
    operation: 'update',
    occurredAt: now,
    payload: { nutritionistPlanSelected: activeOrigin === 'nutritionist', selectedAt: now.getTime() },
  });
}

async function findMealPlan(athleteId: string, origin: MealPlanOrigin) {
  const [row] = await db.select().from(mealPlans)
    .where(and(eq(mealPlans.athleteId, athleteId), eq(mealPlans.origin, origin), isNull(mealPlans.archivedAt)))
    .orderBy(asc(mealPlans.createdAt))
    .limit(1);
  return row ?? null;
}

export interface MealPlanSummary {
  id: string;
  name: string;
  origin: MealPlanOrigin;
  active: boolean;
  createdAt: number;
  lastActivatedAt: number | null;
  targetKcal: number;
  /** Meal count per weekday (1 = Sunday .. 7 = Saturday). */
  dayCounts: Record<number, number>;
}

/** Every meal plan the athlete keeps on this phone, active first. */
export async function listMealPlans(athleteId: string): Promise<MealPlanSummary[]> {
  await getOrCreateMealPlan(athleteId);
  const rows = await db.select().from(mealPlans)
    .where(and(eq(mealPlans.athleteId, athleteId), isNull(mealPlans.archivedAt)));
  const slots = rows.length
    ? await db.select({ mealPlanId: mealSlots.mealPlanId, weekday: mealSlots.weekday }).from(mealSlots)
        .where(inArray(mealSlots.mealPlanId, rows.map(row => row.id)))
    : [];
  return rows.map(row => {
    const dayCounts: Record<number, number> = {};
    for (const slot of slots) {
      if (slot.mealPlanId === row.id) dayCounts[slot.weekday] = (dayCounts[slot.weekday] ?? 0) + 1;
    }
    return {
      id: row.id,
      name: row.name,
      origin: row.origin,
      active: row.active,
      createdAt: row.createdAt.getTime(),
      lastActivatedAt: row.lastActivatedAt?.getTime() ?? null,
      targetKcal: row.targetKcal,
      dayCounts,
    };
  }).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'es'));
}

/** Switches the athlete's meal plan. One active plan at a time, atomically.
 *  Meals already marked today stay in the log under the plan they belonged to. */
export async function activateMealPlan(athleteId: string, mealPlanId: string): Promise<void> {
  await db.transaction(async tx => {
    const [target] = await tx.select({ id: mealPlans.id, origin: mealPlans.origin }).from(mealPlans)
      .where(and(eq(mealPlans.id, mealPlanId), eq(mealPlans.athleteId, athleteId), isNull(mealPlans.archivedAt))).limit(1);
    if (!target) throw new Error('meal_plan_not_found');
    await tx.update(mealPlans).set({ active: false }).where(eq(mealPlans.athleteId, athleteId));
    await tx.update(mealPlans).set({ active: true, lastActivatedAt: new Date() }).where(eq(mealPlans.id, mealPlanId));
    await recordMealPlanSelection(tx, athleteId, target.origin);
  });
}

/** Creates another own meal plan — empty or a copy of any plan the athlete
 *  has — and activates it so it can be built in Dieta. The caller checks
 *  PULSO Plus with lib/plan-limits. */
export async function createOwnMealPlan(
  athleteId: string,
  options: { name?: string; sourceMealPlanId?: string | null },
): Promise<string> {
  const taken = (await db.select({ name: mealPlans.name }).from(mealPlans)
    .where(and(eq(mealPlans.athleteId, athleteId), isNull(mealPlans.archivedAt)))).map(row => row.name);
  const id = nanoid();
  await db.transaction(async tx => {
    let name = options.name ? normalizePlanName(options.name) : null;
    let sourceSlots: (typeof mealSlots.$inferSelect)[] = [];
    if (options.sourceMealPlanId) {
      const [source] = await tx.select({ name: mealPlans.name }).from(mealPlans)
        .where(and(eq(mealPlans.id, options.sourceMealPlanId), eq(mealPlans.athleteId, athleteId))).limit(1);
      if (!source) throw new Error('meal_plan_not_found');
      name ??= copyPlanName(source.name, taken);
      sourceSlots = await tx.select().from(mealSlots).where(eq(mealSlots.mealPlanId, options.sourceMealPlanId));
    }
    await insertMealPlan(tx, athleteId, id, 'own', {
      active: true,
      name: name ?? nextPlanName(DEFAULT_MEAL_PLAN_NAMES.own, taken),
    });
    if (sourceSlots.length) {
      await tx.insert(mealSlots).values(sourceSlots.map(slot => ({ ...slot, id: nanoid(), mealPlanId: id })));
    }
  });
  await syncPlanTargets(id);
  return id;
}

export async function renameMealPlan(athleteId: string, mealPlanId: string, name: string): Promise<void> {
  const clean = normalizePlanName(name);
  if (!clean) throw new Error('invalid_name');
  await db.update(mealPlans).set({ name: clean })
    .where(and(eq(mealPlans.id, mealPlanId), eq(mealPlans.athleteId, athleteId), eq(mealPlans.origin, 'own')));
}

/** "Deletes" an own, inactive meal plan by archiving it, so meals already
 *  logged against its slots keep their history. */
export async function archiveMealPlan(athleteId: string, mealPlanId: string): Promise<void> {
  const [row] = await db.select({ active: mealPlans.active, origin: mealPlans.origin }).from(mealPlans)
    .where(and(eq(mealPlans.id, mealPlanId), eq(mealPlans.athleteId, athleteId))).limit(1);
  if (!row || row.origin !== 'own') throw new Error('meal_plan_not_deletable');
  if (row.active) throw new Error('meal_plan_active');
  await db.update(mealPlans).set({ archivedAt: new Date() }).where(eq(mealPlans.id, mealPlanId));
}

export interface MealDayOutline {
  weekday: number;
  meals: { label: string; time: string; kcal: number }[];
}

/** Read-only content of any meal plan, per weekday, for previewing it. */
export async function getMealPlanOutline(athleteId: string, mealPlanId: string): Promise<MealDayOutline[]> {
  const [owner] = await db.select({ id: mealPlans.id }).from(mealPlans)
    .where(and(eq(mealPlans.id, mealPlanId), eq(mealPlans.athleteId, athleteId))).limit(1);
  if (!owner) return [];
  const slots = await db.select().from(mealSlots).where(eq(mealSlots.mealPlanId, mealPlanId)).orderBy(asc(mealSlots.slotOrder));
  return Array.from({ length: DAYS_PER_WEEK }, (_, i) => ({
    weekday: i + 1,
    meals: slots.filter(slot => slot.weekday === i + 1)
      .map(slot => ({ label: slot.name, time: slot.scheduledTime ?? '', kcal: slot.targetKcal ?? 0 })),
  }));
}

/** Whether the nutritionist's plan already lives in its own plan on this phone. */
export async function hasNutritionistMealPlan(athleteId: string): Promise<boolean> {
  return (await findMealPlan(athleteId, 'nutritionist')) != null;
}

/**
 * Stores the nutritionist's published plan in its own meal plan, so the
 * athlete's own plans are never overwritten. The first one becomes active;
 * later versions update it without switching plans.
 */
export async function applyNutritionistMealPlan(
  athleteId: string,
  assignment: { name: string | null; nutritionistName: string; week: { weekday: number; meals: MealDraft[] }[] },
): Promise<{ activated: boolean }> {
  const name = assignment.name?.trim() || `Plan de ${assignment.nutritionistName}`;
  const existing = await findMealPlan(athleteId, 'nutritionist');
  let mealPlanId = existing?.id;
  if (existing) {
    await db.update(mealPlans).set({ name }).where(eq(mealPlans.id, existing.id));
  } else {
    mealPlanId = nanoid();
    const id = mealPlanId;
    await db.transaction(async tx => insertMealPlan(tx, athleteId, id, 'nutritionist', { active: true, name }));
  }
  await replaceWeekMealSlots(mealPlanId!, assignment.week);
  return { activated: !existing };
}

/** Applies an accepted AI meal plan as the athlete's AI plan and activates it —
 *  accepting it is the athlete's explicit choice. Other plans stay untouched. */
export async function applyGeneratedMealPlan(
  athleteId: string,
  week: { weekday: number; meals: MealDraft[] }[],
): Promise<void> {
  const existing = await findMealPlan(athleteId, 'ai');
  let mealPlanId = existing?.id;
  if (!mealPlanId) {
    mealPlanId = nanoid();
    const id = mealPlanId;
    await db.transaction(async tx => insertMealPlan(tx, athleteId, id, 'ai', { active: false }));
  }
  await replaceWeekMealSlots(mealPlanId, week);
  await activateMealPlan(athleteId, mealPlanId);
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
): Promise<{ mealPlanId: string; plan: { id: string; name: string; origin: MealPlanOrigin }; meals: MealSlotUI[] }> {
  // Plans written before meals had a weekday are spread across the week by
  // migration 0005, not here: doing it lazily on read cannot tell those rows
  // apart from a new plan whose only meal happens to fall on the default day,
  // and would silently copy that one meal onto all seven.
  const mealPlanId = await getOrCreateMealPlan(athleteId);
  const [plan] = await db.select({ id: mealPlans.id, name: mealPlans.name, origin: mealPlans.origin }).from(mealPlans)
    .where(eq(mealPlans.id, mealPlanId)).limit(1);

  const slots = await db
    .select()
    .from(mealSlots)
    .where(and(eq(mealSlots.mealPlanId, mealPlanId), eq(mealSlots.weekday, weekday)))
    .orderBy(asc(mealSlots.slotOrder));
  return {
    mealPlanId,
    plan,
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
