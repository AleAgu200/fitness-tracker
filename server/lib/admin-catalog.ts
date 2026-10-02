import { randomBytes } from "crypto";

import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { catalogExercises, libraryFoods } from "@/db/schema";
import { recordAdminAction } from "@/lib/admin";
import type { ExerciseFields, FoodFields } from "@/lib/admin-catalog-input";
import { reloadCatalogOverlay } from "@/lib/catalog-overlay";
import { getBaseCatalogExercise, searchCatalogPage } from "@/lib/exercise-catalog";
import { listFoods } from "@/lib/library";

// Catalog management for super admins: the exercise catalog every plan draws
// from (static JSON + catalog_exercises overrides) and the shared food base.

export async function adminSearchExercises(q: string, page: number) {
  const overrides = await db.select().from(catalogExercises).orderBy(asc(catalogExercises.name));
  const byId = new Map(overrides.map(o => [o.id, o]));
  // Without a query, start with what admins changed: that is what they review.
  const result = q.trim().length >= 2
    ? searchCatalogPage(q, page, 25)
    : null;
  return {
    exercises: result?.exercises.map(e => ({ ...e, edited: byId.has(e.id), custom: !getBaseCatalogExercise(e.id), hidden: false })) ?? [],
    total: result?.total ?? 0,
    page: result?.page ?? 1,
    pageCount: result?.pageCount ?? 0,
    changes: overrides.map(o => ({
      id: o.id,
      name: o.name,
      muscleGroup: o.muscleGroup,
      equipment: o.equipment,
      target: o.target,
      secondaryMuscles: o.secondaryMuscles,
      instructions: o.instructions,
      gifPath: o.mediaPath ?? getBaseCatalogExercise(o.id)?.gifPath ?? "",
      hidden: o.hidden,
      custom: !getBaseCatalogExercise(o.id),
      updatedAt: o.updatedAt,
    })),
  };
}

export async function createCatalogExercise(actorId: string, fields: ExerciseFields) {
  const id = `px_${randomBytes(8).toString("hex")}`;
  const now = Date.now();
  await db.insert(catalogExercises).values({ id, ...fields, hidden: false, createdBy: actorId, createdAt: now, updatedAt: now });
  await recordAdminAction({ actorUserId: actorId, action: "exercise.create", subjectType: "exercise", subjectId: id, metadata: { name: fields.name } });
  await reloadCatalogOverlay();
  return id;
}

/** Edit any exercise; for a static one this stores an override row. */
export async function updateCatalogExercise(actorId: string, id: string, fields: ExerciseFields): Promise<boolean> {
  const [existing] = await db.select().from(catalogExercises).where(eq(catalogExercises.id, id));
  const base = getBaseCatalogExercise(id);
  if (!existing && !base) return false;
  const now = Date.now();
  const mediaPath = fields.mediaPath === base?.gifPath ? null : fields.mediaPath;
  if (existing) {
    await db.update(catalogExercises).set({ ...fields, mediaPath, updatedAt: now }).where(eq(catalogExercises.id, id));
  } else {
    await db.insert(catalogExercises).values({ id, ...fields, mediaPath, hidden: false, createdBy: actorId, createdAt: now, updatedAt: now });
  }
  await recordAdminAction({ actorUserId: actorId, action: "exercise.update", subjectType: "exercise", subjectId: id, metadata: { name: fields.name } });
  await reloadCatalogOverlay();
  return true;
}

/** Hide from search and plan generation. Plans that already use it keep their copy. */
export async function setCatalogExerciseHidden(actorId: string, id: string, hidden: boolean): Promise<boolean> {
  const [existing] = await db.select().from(catalogExercises).where(eq(catalogExercises.id, id));
  const base = getBaseCatalogExercise(id);
  if (!existing && !base) return false;
  const now = Date.now();
  if (existing) {
    await db.update(catalogExercises).set({ hidden, updatedAt: now }).where(eq(catalogExercises.id, id));
  } else if (base) {
    await db.insert(catalogExercises).values({
      id,
      name: base.name,
      muscleGroup: base.muscleGroup,
      equipment: base.equipment,
      target: base.target,
      secondaryMuscles: base.secondaryMuscles,
      instructions: base.instructions,
      mediaPath: null,
      hidden,
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
    });
  }
  await recordAdminAction({ actorUserId: actorId, action: hidden ? "exercise.hide" : "exercise.show", subjectType: "exercise", subjectId: id });
  await reloadCatalogOverlay();
  return true;
}

/** Drop an override so a static exercise goes back to the original. */
export async function revertCatalogExercise(actorId: string, id: string): Promise<boolean> {
  if (!getBaseCatalogExercise(id)) return false;
  await db.delete(catalogExercises).where(eq(catalogExercises.id, id));
  await recordAdminAction({ actorUserId: actorId, action: "exercise.revert", subjectType: "exercise", subjectId: id });
  await reloadCatalogOverlay();
  return true;
}

// ── foods ────────────────────────────────────────────────────────────────────

export async function adminListFoods(q: string, scope: "all" | "base" | "custom") {
  const foods = await listFoods(q);
  const filtered = scope === "all" ? foods : foods.filter(f => scope === "base" ? f.createdBy == null : f.createdBy != null);
  return filtered.slice(0, 300).map(f => ({ ...f, base: f.createdBy == null }));
}

/** Foods created here belong to the shared base (no owner), like the seed. */
export async function adminCreateFood(actorId: string, fields: FoodFields) {
  const [duplicate] = await db.select({ id: libraryFoods.id }).from(libraryFoods).where(sql`lower(${libraryFoods.name}) = lower(${fields.name})`);
  if (duplicate) return { error: "duplicate_name" as const };
  const id = randomBytes(12).toString("hex");
  await db.insert(libraryFoods).values({ id, ...fields, source: "base", externalId: null, createdBy: null, createdAt: Date.now() });
  await recordAdminAction({ actorUserId: actorId, action: "food.create", subjectType: "food", subjectId: id, metadata: { name: fields.name } });
  return { id };
}

export async function adminUpdateFood(actorId: string, id: string, fields: FoodFields): Promise<boolean> {
  const result = await db.update(libraryFoods).set(fields).where(eq(libraryFoods.id, id));
  if (!(result.count ?? 0)) return false;
  await recordAdminAction({ actorUserId: actorId, action: "food.update", subjectType: "food", subjectId: id, metadata: { name: fields.name } });
  return true;
}

/** Plans store their own copy of each food, so deleting only removes it from the picker. */
export async function adminDeleteFood(actorId: string, id: string): Promise<boolean> {
  const [food] = await db.select({ name: libraryFoods.name }).from(libraryFoods).where(eq(libraryFoods.id, id));
  if (!food) return false;
  await db.delete(libraryFoods).where(eq(libraryFoods.id, id));
  await recordAdminAction({ actorUserId: actorId, action: "food.delete", subjectType: "food", subjectId: id, metadata: { name: food.name } });
  return true;
}
