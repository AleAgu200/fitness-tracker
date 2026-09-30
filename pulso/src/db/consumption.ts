import { and, asc, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';

import { nanoid } from '@/lib/id';
import {
  Basis,
  combineNutrients,
  hasCoreNutrients,
  hydrationTotals,
  Nutrients,
  PhysicalUnit,
} from '@/lib/nutrition-math';
import { db } from './index';
import { enqueueSyncMutation } from './sync';
import {
  beverageContainers,
  BeverageContainer,
  Consumption,
  consumptions,
  nutritionSettings,
  savedFoods,
  SavedFood,
} from './schema';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ConsumptionKind = Consumption['kind'];
export type ConsumptionSource = Consumption['source'];

export interface ConsumptionComponent {
  name: string;
  source: ConsumptionSource;
  sourceRef?: string | null;
  basis: Basis;
  amount: number;
  unit: PhysicalUnit;
  nutrientsPerBasis: Nutrients;
}

export interface ConsumptionItem {
  id: string;
  localDate: string;
  occurredAt: number | null;
  kind: ConsumptionKind;
  mealLabel: string | null;
  planSlotId: string | null;
  name: string;
  amount: number | null;
  unit: PhysicalUnit | null;
  source: ConsumptionSource;
  completeness: Consumption['completeness'];
  nutrients: Nutrients;
  components: ConsumptionComponent[];
  volumeMl: number | null;
  plainWater: boolean;
  containerId: string | null;
  legacyAggregate: boolean;
  note: string | null;
}

export interface ConsumptionInput {
  localDate: string;
  kind: ConsumptionKind;
  mealLabel?: string | null;
  planSlotId?: string | null;
  name: string;
  amount?: number | null;
  unit?: PhysicalUnit | null;
  source: ConsumptionSource;
  /** Consumed totals; derived from `components` when omitted. */
  nutrients?: Nutrients;
  components?: ConsumptionComponent[];
  volumeMl?: number | null;
  plainWater?: boolean;
  containerId?: string | null;
  note?: string | null;
}

function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function toItem(row: Consumption): ConsumptionItem {
  return {
    id: row.id,
    localDate: row.localDate,
    occurredAt: row.occurredAt?.getTime() ?? null,
    kind: row.kind,
    mealLabel: row.mealLabel,
    planSlotId: row.planSlotId,
    name: row.name,
    amount: row.amount,
    unit: row.unit,
    source: row.source,
    completeness: row.completeness,
    nutrients: parseJson<Nutrients>(row.nutrientsJson, {}),
    components: parseJson<ConsumptionComponent[]>(row.componentsJson, []),
    volumeMl: row.volumeMl,
    plainWater: row.plainWater,
    containerId: row.containerId,
    legacyAggregate: row.legacyAggregate,
    note: row.note,
  };
}

function resolveNutrients(input: Pick<ConsumptionInput, 'nutrients' | 'components'>): Nutrients {
  if (input.nutrients) return input.nutrients;
  if (input.components?.length) return combineNutrients(input.components);
  return {};
}

/**
 * Hands the row's current version to the sync outbox, in the caller's
 * transaction. A row the server never saw is created; later versions update
 * the one the server has. Deleting something never sent needs no mutation —
 * restoring it later simply creates it.
 */
async function enqueueConsumption(tx: Transaction, row: Consumption): Promise<void> {
  if (row.enqueuedVersion >= row.version) return;
  const deleted = row.deletedAt != null;
  if (deleted && row.enqueuedVersion === 0) return;
  const now = new Date();
  await enqueueSyncMutation(tx, {
    athleteId: row.athleteId,
    entityType: 'nutrition_consumption',
    entityId: row.id,
    operation: row.enqueuedVersion === 0 ? 'create' : deleted ? 'delete' : 'update',
    baseVersion: row.enqueuedVersion === 0 ? null : row.enqueuedVersion,
    occurredAt: now,
    // Free-form notes stay on the phone, like the rest of PULSO's notes.
    payload: {
      localDate: row.localDate,
      timezone: row.timezone,
      occurredAt: row.occurredAt?.getTime() ?? null,
      timePrecision: row.timePrecision,
      version: row.version,
      kind: row.kind,
      mealLabel: row.mealLabel,
      planSlotKey: row.planSlotId,
      name: row.name,
      amount: row.amount,
      unit: row.unit,
      source: row.source,
      completeness: row.completeness,
      nutrients: parseJson<Nutrients>(row.nutrientsJson, {}),
      components: parseJson<ConsumptionComponent[]>(row.componentsJson, []).map(({ sourceRef: _, ...component }) => component),
      volumeMl: row.volumeMl,
      plainWater: row.plainWater,
      legacyAggregate: row.legacyAggregate,
      deletedAt: row.deletedAt?.getTime() ?? null,
    },
  });
  await tx.update(consumptions).set({ enqueuedVersion: row.version }).where(eq(consumptions.id, row.id));
}

async function writeAndEnqueue(tx: Transaction, id: string): Promise<void> {
  const [row] = await tx.select().from(consumptions).where(eq(consumptions.id, id)).limit(1);
  if (row) await enqueueConsumption(tx, row);
}

function completenessOf(source: ConsumptionSource, nutrients: Nutrients): Consumption['completeness'] {
  if (source === 'legacy') return 'estimated';
  return hasCoreNutrients(nutrients) ? 'complete' : 'partial';
}

/** Items logged for a date, oldest first (tombstones excluded). */
export async function listConsumptions(athleteId: string, localDate: string): Promise<ConsumptionItem[]> {
  const rows = await db.select().from(consumptions)
    .where(and(eq(consumptions.athleteId, athleteId), eq(consumptions.localDate, localDate), isNull(consumptions.deletedAt)))
    .orderBy(asc(consumptions.createdAt));
  return rows.map(toItem);
}

/** Logs one consumed item (food, drink or meal) and queues it for sync. */
export async function logConsumption(athleteId: string, input: ConsumptionInput, id: string = nanoid()): Promise<string> {
  const nutrients = resolveNutrients(input);
  const now = new Date();
  await db.transaction(async tx => {
    await tx.insert(consumptions).values({
      id,
      athleteId,
      localDate: input.localDate,
      timezone: deviceTimezone(),
      occurredAt: now,
      timePrecision: 'exact',
      version: 1,
      enqueuedVersion: 0,
      kind: input.kind,
      mealLabel: input.mealLabel ?? null,
      planSlotId: input.planSlotId ?? null,
      name: input.name.trim(),
      amount: input.amount ?? null,
      unit: input.unit ?? null,
      source: input.source,
      completeness: completenessOf(input.source, nutrients),
      nutrientsJson: JSON.stringify(nutrients),
      componentsJson: JSON.stringify(input.components ?? []),
      volumeMl: input.volumeMl ?? null,
      plainWater: input.plainWater ?? false,
      containerId: input.containerId ?? null,
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
    });
    await writeAndEnqueue(tx, id);
  });
  return id;
}

/** Changes a logged item in place — a new version of the same record, never a duplicate. */
export async function updateConsumption(
  athleteId: string,
  id: string,
  patch: Partial<Omit<ConsumptionInput, 'localDate' | 'kind'>>,
): Promise<void> {
  await db.transaction(async tx => {
    const [row] = await tx.select().from(consumptions)
      .where(and(eq(consumptions.id, id), eq(consumptions.athleteId, athleteId))).limit(1);
    if (!row) throw new Error('consumption_not_found');
    const source = patch.source ?? row.source;
    const nutrients = patch.nutrients || patch.components
      ? resolveNutrients(patch)
      : parseJson<Nutrients>(row.nutrientsJson, {});
    await tx.update(consumptions).set({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.mealLabel !== undefined ? { mealLabel: patch.mealLabel } : {}),
      ...(patch.planSlotId !== undefined ? { planSlotId: patch.planSlotId } : {}),
      ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
      ...(patch.unit !== undefined ? { unit: patch.unit } : {}),
      ...(patch.components !== undefined ? { componentsJson: JSON.stringify(patch.components) } : {}),
      ...(patch.volumeMl !== undefined ? { volumeMl: patch.volumeMl } : {}),
      ...(patch.plainWater !== undefined ? { plainWater: patch.plainWater } : {}),
      ...(patch.containerId !== undefined ? { containerId: patch.containerId } : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
      source,
      nutrientsJson: JSON.stringify(nutrients),
      // Editing a migrated estimate turns it into a real record.
      completeness: completenessOf(source, nutrients),
      legacyAggregate: source === 'legacy' ? row.legacyAggregate : false,
      version: row.version + 1,
      deletedAt: null,
      updatedAt: new Date(),
    }).where(eq(consumptions.id, id));
    await writeAndEnqueue(tx, id);
  });
}

/** Removes a logged item, keeping a tombstone so undo restores the same record. */
export async function deleteConsumption(athleteId: string, id: string): Promise<void> {
  await db.transaction(async tx => {
    const [row] = await tx.select().from(consumptions)
      .where(and(eq(consumptions.id, id), eq(consumptions.athleteId, athleteId))).limit(1);
    if (!row || row.deletedAt) return;
    const now = new Date();
    await tx.update(consumptions).set({ deletedAt: now, version: row.version + 1, updatedAt: now })
      .where(eq(consumptions.id, id));
    await writeAndEnqueue(tx, id);
  });
}

/** Undo of a delete: brings the same record back as its next version. */
export async function restoreConsumption(athleteId: string, id: string): Promise<void> {
  await db.transaction(async tx => {
    const [row] = await tx.select().from(consumptions)
      .where(and(eq(consumptions.id, id), eq(consumptions.athleteId, athleteId))).limit(1);
    if (!row || !row.deletedAt) return;
    await tx.update(consumptions).set({ deletedAt: null, version: row.version + 1, updatedAt: new Date() })
      .where(eq(consumptions.id, id));
    await writeAndEnqueue(tx, id);
  });
}

async function findSlotConsumption(athleteId: string, planSlotId: string, localDate: string) {
  const [row] = await db.select().from(consumptions)
    .where(and(eq(consumptions.athleteId, athleteId), eq(consumptions.planSlotId, planSlotId), eq(consumptions.localDate, localDate)))
    .orderBy(sql`${consumptions.deletedAt} IS NOT NULL`, desc(consumptions.updatedAt))
    .limit(1);
  return row ?? null;
}

export interface PlannedMeal {
  slotId: string;
  label: string;
  description: string;
  kcal: number;
  p: number;
  c: number;
  g: number;
}

/**
 * Records what was eaten for a planned meal on a date. Confirming uses the
 * plan's values; substituting records the replacement's components (or, with
 * only a note, unknown nutrients). Re-confirming or re-adjusting edits the
 * same record: one planned meal never counts twice on a date.
 */
export async function recordPlannedMeal(
  athleteId: string,
  localDate: string,
  meal: PlannedMeal,
  outcome:
    | { type: 'confirmed' }
    | { type: 'substituted'; components?: ConsumptionComponent[]; note?: string | null },
): Promise<string> {
  const input: ConsumptionInput = outcome.type === 'confirmed'
    ? {
        localDate,
        kind: 'meal',
        mealLabel: meal.label,
        planSlotId: meal.slotId,
        name: meal.description || meal.label,
        source: 'plan',
        nutrients: { kcal: meal.kcal, proteinG: meal.p, carbsG: meal.c, fatG: meal.g },
        components: [],
        note: null,
      }
    : {
        localDate,
        kind: 'meal',
        mealLabel: meal.label,
        planSlotId: meal.slotId,
        name: outcome.components?.length
          ? outcome.components.map(c => c.name).join(', ')
          : outcome.note?.trim() || `Sustitución · ${meal.label}`,
        source: outcome.components?.length ? outcome.components[0].source : 'manual',
        components: outcome.components ?? [],
        nutrients: outcome.components?.length ? undefined : { kcal: null, proteinG: null, carbsG: null, fatG: null },
        note: outcome.note ?? null,
      };
  const existing = await findSlotConsumption(athleteId, meal.slotId, localDate);
  // Re-marking a meal as substituted must not wipe foods already recorded for it.
  if (existing && !existing.deletedAt && outcome.type === 'substituted' && !outcome.components?.length
    && parseJson<ConsumptionComponent[]>(existing.componentsJson, []).length > 0) {
    if (outcome.note !== undefined) await updateConsumption(athleteId, existing.id, { note: outcome.note });
    return existing.id;
  }
  if (existing) {
    await updateConsumption(athleteId, existing.id, { ...input, nutrients: resolveNutrients(input) });
    return existing.id;
  }
  return logConsumption(athleteId, input, `meal_${meal.slotId}_${localDate}`);
}

/** Back to pending: the planned meal no longer counts as eaten that day. */
export async function clearPlannedMeal(athleteId: string, planSlotId: string, localDate: string): Promise<void> {
  const existing = await findSlotConsumption(athleteId, planSlotId, localDate);
  if (existing && !existing.deletedAt) await deleteConsumption(athleteId, existing.id);
}

/** Queues rows written without sync (the migrated history). Idempotent. */
export async function backfillConsumptionOutbox(athleteId: string): Promise<void> {
  const pending = await db.select({ id: consumptions.id }).from(consumptions).where(and(
    eq(consumptions.athleteId, athleteId),
    lt(consumptions.enqueuedVersion, consumptions.version),
    or(isNull(consumptions.deletedAt), sql`${consumptions.enqueuedVersion} > 0`),
  ));
  for (const { id } of pending) {
    await db.transaction(async tx => writeAndEnqueue(tx, id));
  }
}

// ── containers ──────────────────────────────────────────────────────────────

const DEFAULT_CONTAINERS = [
  { name: 'Vaso', capacityMl: 250 },
  { name: 'Botella', capacityMl: 500 },
];

async function ensureSettings(athleteId: string) {
  const [row] = await db.select().from(nutritionSettings).where(eq(nutritionSettings.athleteId, athleteId)).limit(1);
  if (row) return row;
  const created = { athleteId, waterGoalMl: null, containersSeededAt: null, updatedAt: new Date() };
  await db.insert(nutritionSettings).values(created).onConflictDoNothing();
  return (await db.select().from(nutritionSettings).where(eq(nutritionSettings.athleteId, athleteId)).limit(1))[0];
}

/** The athlete's containers; the two defaults are created once, ever. */
export async function listContainers(athleteId: string): Promise<BeverageContainer[]> {
  const settings = await ensureSettings(athleteId);
  if (!settings.containersSeededAt) {
    const now = new Date();
    await db.transaction(async tx => {
      await tx.insert(beverageContainers).values(DEFAULT_CONTAINERS.map((container, i) => ({
        id: nanoid(),
        athleteId,
        name: container.name,
        capacityMl: container.capacityMl,
        beverageName: 'Agua',
        plainWater: true,
        savedFoodId: null,
        sortOrder: i,
        createdAt: now,
      })));
      await tx.update(nutritionSettings).set({ containersSeededAt: now, updatedAt: now })
        .where(eq(nutritionSettings.athleteId, athleteId));
    });
  }
  return db.select().from(beverageContainers)
    .where(and(eq(beverageContainers.athleteId, athleteId), isNull(beverageContainers.archivedAt)))
    .orderBy(asc(beverageContainers.sortOrder), asc(beverageContainers.createdAt));
}

export interface ContainerInput {
  name: string;
  capacityMl: number;
  beverageName: string;
  plainWater: boolean;
  savedFoodId: string | null;
}

export async function saveContainer(athleteId: string, input: ContainerInput, id?: string): Promise<string> {
  if (!(input.capacityMl > 0)) throw new Error('invalid_capacity');
  if (id) {
    await db.update(beverageContainers).set({
      name: input.name.trim(),
      capacityMl: input.capacityMl,
      beverageName: input.beverageName.trim() || 'Agua',
      plainWater: input.plainWater,
      savedFoodId: input.savedFoodId,
    }).where(and(eq(beverageContainers.id, id), eq(beverageContainers.athleteId, athleteId)));
    return id;
  }
  const existing = await listContainers(athleteId);
  const newId = nanoid();
  await db.insert(beverageContainers).values({
    id: newId,
    athleteId,
    name: input.name.trim(),
    capacityMl: input.capacityMl,
    beverageName: input.beverageName.trim() || 'Agua',
    plainWater: input.plainWater,
    savedFoodId: input.savedFoodId,
    sortOrder: existing.length,
    createdAt: new Date(),
  });
  return newId;
}

/** Logged drinks keep their container reference; it just leaves the list. */
export async function archiveContainer(athleteId: string, id: string): Promise<void> {
  await db.update(beverageContainers).set({ archivedAt: new Date() })
    .where(and(eq(beverageContainers.id, id), eq(beverageContainers.athleteId, athleteId)));
}

// ── settings ────────────────────────────────────────────────────────────────

export async function getWaterGoal(athleteId: string): Promise<number | null> {
  return (await ensureSettings(athleteId)).waterGoalMl;
}

export async function setWaterGoal(athleteId: string, goalMl: number | null): Promise<void> {
  await ensureSettings(athleteId);
  await db.update(nutritionSettings).set({ waterGoalMl: goalMl && goalMl > 0 ? goalMl : null, updatedAt: new Date() })
    .where(eq(nutritionSettings.athleteId, athleteId));
}

// ── saved foods ("Mis alimentos") ───────────────────────────────────────────

export interface SavedFoodItem {
  id: string;
  name: string;
  brand: string | null;
  source: SavedFood['source'];
  sourceRef: string | null;
  basis: Basis;
  nutrients: Nutrients;
  servingLabel: string | null;
  servingAmount: number | null;
  favorite: boolean;
  lastUsedAt: number | null;
}

function toSavedFood(row: SavedFood): SavedFoodItem {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    source: row.source,
    sourceRef: row.sourceRef,
    basis: { amount: row.basisAmount, unit: row.basisUnit },
    nutrients: parseJson<Nutrients>(row.nutrientsJson, {}),
    servingLabel: row.servingLabel,
    servingAmount: row.servingAmount,
    favorite: row.favorite,
    lastUsedAt: row.lastUsedAt?.getTime() ?? null,
  };
}

/** Favourites first, then most recently used, then by name. */
export async function listSavedFoods(athleteId: string): Promise<SavedFoodItem[]> {
  const rows = await db.select().from(savedFoods)
    .where(and(eq(savedFoods.athleteId, athleteId), isNull(savedFoods.archivedAt)))
    .orderBy(desc(savedFoods.favorite), sql`${savedFoods.lastUsedAt} IS NULL`, desc(savedFoods.lastUsedAt), asc(savedFoods.name));
  return rows.map(toSavedFood);
}

export interface SavedFoodInput {
  name: string;
  brand?: string | null;
  source: SavedFood['source'];
  sourceRef?: string | null;
  basis: Basis;
  nutrients: Nutrients;
  servingLabel?: string | null;
  servingAmount?: number | null;
}

/**
 * Saves a product for later. Saving never logs it or changes a plan. The same
 * catalog item or barcode is updated rather than saved twice.
 */
export async function saveFood(athleteId: string, input: SavedFoodInput, id?: string): Promise<string> {
  if (!(input.basis.amount > 0)) throw new Error('invalid_basis');
  const now = new Date();
  let targetId = id;
  if (!targetId && input.sourceRef) {
    const [existing] = await db.select({ id: savedFoods.id }).from(savedFoods).where(and(
      eq(savedFoods.athleteId, athleteId), eq(savedFoods.source, input.source), eq(savedFoods.sourceRef, input.sourceRef),
    )).limit(1);
    targetId = existing?.id;
  }
  const values = {
    name: input.name.trim(),
    brand: input.brand?.trim() || null,
    source: input.source,
    sourceRef: input.sourceRef ?? null,
    basisAmount: input.basis.amount,
    basisUnit: input.basis.unit,
    nutrientsJson: JSON.stringify(input.nutrients),
    servingLabel: input.servingLabel?.trim() || null,
    servingAmount: input.servingAmount ?? null,
    archivedAt: null,
    updatedAt: now,
  };
  if (targetId) {
    await db.update(savedFoods).set(values).where(and(eq(savedFoods.id, targetId), eq(savedFoods.athleteId, athleteId)));
    return targetId;
  }
  const newId = nanoid();
  await db.insert(savedFoods).values({ id: newId, athleteId, favorite: false, lastUsedAt: null, createdAt: now, ...values });
  return newId;
}

export async function setFoodFavorite(athleteId: string, id: string, favorite: boolean): Promise<void> {
  await db.update(savedFoods).set({ favorite, updatedAt: new Date() })
    .where(and(eq(savedFoods.id, id), eq(savedFoods.athleteId, athleteId)));
}

export async function markFoodUsed(athleteId: string, id: string): Promise<void> {
  await db.update(savedFoods).set({ lastUsedAt: new Date() })
    .where(and(eq(savedFoods.id, id), eq(savedFoods.athleteId, athleteId)));
}

/** Logged items keep their own snapshot, so removing a saved food changes no history. */
export async function archiveSavedFood(athleteId: string, id: string): Promise<void> {
  await db.update(savedFoods).set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(savedFoods.id, id), eq(savedFoods.athleteId, athleteId)));
}

/**
 * Keeps a substitution's note in step with its record. A replacement logged
 * with real foods keeps its name; a note-only substitution is named by it.
 */
export async function updatePlannedMealNote(
  athleteId: string,
  planSlotId: string,
  localDate: string,
  note: string,
  mealLabel: string,
): Promise<void> {
  const existing = await findSlotConsumption(athleteId, planSlotId, localDate);
  if (!existing || existing.deletedAt) return;
  const hasComponents = parseJson<ConsumptionComponent[]>(existing.componentsJson, []).length > 0;
  await updateConsumption(athleteId, existing.id, {
    note: note.trim() || null,
    ...(hasComponents || existing.source === 'plan' ? {} : { name: note.trim() || `Sustitución · ${mealLabel}` }),
  });
}

/** Today's drinks against the goal, for Hoy, the Núcleo and the check-in. */
export async function getHydration(athleteId: string, localDate: string): Promise<{ totalMl: number; plainWaterMl: number; goalMl: number | null }> {
  const [items, goalMl] = await Promise.all([listConsumptions(athleteId, localDate), getWaterGoal(athleteId)]);
  return { ...hydrationTotals(items), goalMl };
}

/**
 * Foods logged recently, newest first and without repeats, rebuilt from the
 * consumption snapshots themselves — so "recientes" works offline and needs
 * nothing saved.
 */
export async function listRecentComponents(athleteId: string, limit = 12): Promise<ConsumptionComponent[]> {
  const rows = await db.select({ componentsJson: consumptions.componentsJson }).from(consumptions)
    .where(and(eq(consumptions.athleteId, athleteId), isNull(consumptions.deletedAt), sql`${consumptions.componentsJson} != '[]'`))
    .orderBy(desc(consumptions.updatedAt))
    .limit(60);
  const seen = new Set<string>();
  const recent: ConsumptionComponent[] = [];
  for (const row of rows) {
    for (const component of parseJson<ConsumptionComponent[]>(row.componentsJson, [])) {
      const key = `${component.name.toLowerCase()}|${component.basis.amount}${component.basis.unit}`;
      if (seen.has(key)) continue;
      seen.add(key);
      recent.push(component);
      if (recent.length >= limit) return recent;
    }
  }
  return recent;
}

/**
 * One drink = one record that adds volume and (when known) nutrients once.
 * Plain water is known to be zero; a drink described by a saved product is
 * scaled from it; anything else keeps unknown nutrients instead of zeros.
 */
export async function logBeverage(athleteId: string, input: {
  localDate: string;
  name: string;
  volumeMl: number;
  plainWater: boolean;
  containerId?: string | null;
  savedFood?: SavedFoodItem | null;
}): Promise<string> {
  if (!(input.volumeMl > 0)) throw new Error('invalid_volume');
  const food = input.savedFood && input.savedFood.basis.unit === 'ml' ? input.savedFood : null;
  const components: ConsumptionComponent[] = food ? [{
    name: food.name,
    source: 'library',
    sourceRef: food.id,
    basis: food.basis,
    amount: input.volumeMl,
    unit: 'ml',
    nutrientsPerBasis: food.nutrients,
  }] : [];
  if (food) await markFoodUsed(athleteId, food.id);
  return logConsumption(athleteId, {
    localDate: input.localDate,
    kind: 'beverage',
    name: input.name,
    amount: input.volumeMl,
    unit: 'ml',
    source: food ? 'library' : 'manual',
    components,
    nutrients: food ? undefined : input.plainWater
      ? { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }
      : { kcal: null, proteinG: null, carbsG: null, fatG: null },
    volumeMl: input.volumeMl,
    plainWater: input.plainWater,
    containerId: input.containerId ?? null,
  });
}
