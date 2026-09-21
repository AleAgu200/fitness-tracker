import { randomBytes } from "crypto";

import { and, desc, eq, gt, gte, isNull, lt, lte, max, or } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { assignedMealPlans, assignedWorkouts, syncChanges } from "@/db/schema";
import type { AccessContext } from "@/lib/permissions";

// Payload shapes — the phone maps these onto its local tables:
export interface WorkoutPayload {
  coachName: string;
  exercises: {
    nombre: string;
    target: number;      // sets
    reps: number;
    peso: number;        // kg
    step: number;        // kg increment
    restSeconds: number;
    instructions?: string | null;
    gifPath?: string | null;
  }[];
}

export interface MealItem {
  foodId: string;
  name: string;
  grams: number;
}

export interface MealPlanPayload {
  nutritionistName: string;
  meals: {
    label: string;       // DESAYUNO
    time: string;        // 07:30
    n: string;           // dish description
    kcal: number;
    p: number;
    c: number;
    g: number;
    items?: MealItem[];  // kept for round-trip editing in the portal; the phone ignores it
  }[];
}

export interface Assignment<T> {
  id: string;
  version: number;
  payload: T;
  name: string | null;
  createdAt: number;
  effectiveAt: number | null;
  endsAt: number | null;
}

export interface PlanHistoryEntry {
  id: string;
  version: number;
  name: string | null;
  status: string;
  createdAt: number;
  effectiveAt: number | null;
  endsAt: number | null;
  publishedByMembershipId: string | null;
  sourceTemplateId: string | null;
}

function newId(): string {
  return randomBytes(12).toString("hex");
}

export class AssignmentConflictError extends Error {
  constructor(public readonly currentVersion: number) {
    super("assignment_version_conflict");
  }
}

export interface PublishOptions {
  access?: AccessContext | null;
  baseVersion?: number;
  effectiveAt?: number;
  endsAt?: number | null;
  name?: string | null;
  sourceTemplateId?: string | null;
}

/**
 * A published plan is visible to the athlete while `now` falls inside its
 * [effectiveAt, endsAt) window — supersession is expressed by closing the
 * previous window, not by flipping `status`. `archived` is reserved for a plan
 * that was withdrawn before it ever applied.
 *
 * `effectiveAt` is treated as "always been effective" when null so that a row
 * predating effective dating can never strand an athlete without a plan.
 */
function withinWindow(
  table: { status: PgColumn; effectiveAt: PgColumn; endsAt: PgColumn },
  now: number,
) {
  return and(
    eq(table.status, "active"),
    or(isNull(table.effectiveAt), lte(table.effectiveAt, now)),
    or(isNull(table.endsAt), gt(table.endsAt, now)),
  );
}

/**
 * Close out whatever the athlete currently has so the incoming version owns the
 * timeline from `effectiveAt` onward:
 *  - plans that would have started at/after the new one never applied → archived
 *  - the plan in force before it → window closed at the new effective instant
 *
 * Written once per table rather than generically: Drizzle's update builder is
 * typed per table, and a shared signature costs more in casts than it saves.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function supersedeWorkouts(tx: Tx, athleteId: string, effectiveAt: number, access: AccessContext | null | undefined) {
  const scope = access ? [eq(assignedWorkouts.organizationId, access.organizationId)] : [];
  await tx.update(assignedWorkouts)
    .set({ status: "archived" })
    .where(and(
      eq(assignedWorkouts.athleteId, athleteId),
      eq(assignedWorkouts.status, "active"),
      gte(assignedWorkouts.effectiveAt, effectiveAt),
      ...scope,
    ));
  await tx.update(assignedWorkouts)
    .set({ endsAt: effectiveAt })
    .where(and(
      eq(assignedWorkouts.athleteId, athleteId),
      eq(assignedWorkouts.status, "active"),
      or(isNull(assignedWorkouts.effectiveAt), lt(assignedWorkouts.effectiveAt, effectiveAt)),
      or(isNull(assignedWorkouts.endsAt), gt(assignedWorkouts.endsAt, effectiveAt)),
      ...scope,
    ));
}

async function supersedeMealPlans(tx: Tx, athleteId: string, effectiveAt: number, access: AccessContext | null | undefined) {
  const scope = access ? [eq(assignedMealPlans.organizationId, access.organizationId)] : [];
  await tx.update(assignedMealPlans)
    .set({ status: "archived" })
    .where(and(
      eq(assignedMealPlans.athleteId, athleteId),
      eq(assignedMealPlans.status, "active"),
      gte(assignedMealPlans.effectiveAt, effectiveAt),
      ...scope,
    ));
  await tx.update(assignedMealPlans)
    .set({ endsAt: effectiveAt })
    .where(and(
      eq(assignedMealPlans.athleteId, athleteId),
      eq(assignedMealPlans.status, "active"),
      or(isNull(assignedMealPlans.effectiveAt), lt(assignedMealPlans.effectiveAt, effectiveAt)),
      or(isNull(assignedMealPlans.endsAt), gt(assignedMealPlans.endsAt, effectiveAt)),
      ...scope,
    ));
}

export async function assignWorkout(
  coachId: string,
  athleteId: string,
  payload: WorkoutPayload,
  options: PublishOptions = {},
): Promise<number> {
  return db.transaction(async (tx) => {
    const [prev] = await tx
      .select({ v: max(assignedWorkouts.version) })
      .from(assignedWorkouts)
      .where(eq(assignedWorkouts.athleteId, athleteId));
    const currentVersion = prev?.v ?? 0;
    if (options.baseVersion != null && options.baseVersion !== currentVersion) {
      throw new AssignmentConflictError(currentVersion);
    }
    const version = currentVersion + 1;
    const now = Date.now();
    const effectiveAt = options.effectiveAt ?? now;

    await supersedeWorkouts(tx, athleteId, effectiveAt, options.access);

    const id = newId();
    await tx.insert(assignedWorkouts).values({
      id,
      athleteId,
      coachId,
      organizationId: options.access?.organizationId,
      careAssignmentId: options.access?.assignmentId,
      payload,
      version,
      status: "active",
      name: options.name ?? null,
      publishedByMembershipId: options.access?.membershipId,
      sourceTemplateId: options.sourceTemplateId ?? null,
      createdAt: now,
      effectiveAt,
      endsAt: options.endsAt,
    });
    await tx.insert(syncChanges).values({
      id: `change_${newId()}`,
      athleteId,
      entityType: "workout_assignment",
      entityId: id,
      operation: "create",
      payload: { version, payload, name: options.name ?? null, effectiveAt, endsAt: options.endsAt ?? null },
      createdAt: now,
    });
    return version;
  });
}

export async function assignMealPlan(
  nutritionistId: string,
  athleteId: string,
  payload: MealPlanPayload,
  options: PublishOptions = {},
): Promise<number> {
  return db.transaction(async (tx) => {
    const [prev] = await tx
      .select({ v: max(assignedMealPlans.version) })
      .from(assignedMealPlans)
      .where(eq(assignedMealPlans.athleteId, athleteId));
    const currentVersion = prev?.v ?? 0;
    if (options.baseVersion != null && options.baseVersion !== currentVersion) {
      throw new AssignmentConflictError(currentVersion);
    }
    const version = currentVersion + 1;
    const now = Date.now();
    const effectiveAt = options.effectiveAt ?? now;

    await supersedeMealPlans(tx, athleteId, effectiveAt, options.access);

    const id = newId();
    await tx.insert(assignedMealPlans).values({
      id,
      athleteId,
      nutritionistId,
      organizationId: options.access?.organizationId,
      careAssignmentId: options.access?.assignmentId,
      payload,
      version,
      status: "active",
      name: options.name ?? null,
      publishedByMembershipId: options.access?.membershipId,
      sourceTemplateId: options.sourceTemplateId ?? null,
      createdAt: now,
      effectiveAt,
      endsAt: options.endsAt,
    });
    await tx.insert(syncChanges).values({
      id: `change_${newId()}`,
      athleteId,
      entityType: "meal_plan_assignment",
      entityId: id,
      operation: "create",
      payload: { version, payload, name: options.name ?? null, effectiveAt, endsAt: options.endsAt ?? null },
      createdAt: now,
    });
    return version;
  });
}

export async function getActiveWorkout(
  athleteId: string,
  now = Date.now(),
): Promise<Assignment<WorkoutPayload> | null> {
  const [row] = await db
    .select({
      id: assignedWorkouts.id,
      payload: assignedWorkouts.payload,
      version: assignedWorkouts.version,
      name: assignedWorkouts.name,
      createdAt: assignedWorkouts.createdAt,
      effectiveAt: assignedWorkouts.effectiveAt,
      endsAt: assignedWorkouts.endsAt,
    })
    .from(assignedWorkouts)
    .where(and(eq(assignedWorkouts.athleteId, athleteId), withinWindow(assignedWorkouts, now)))
    .orderBy(desc(assignedWorkouts.version))
    .limit(1);
  if (!row) return null;
  return { ...row, payload: row.payload as WorkoutPayload };
}

export async function getActiveMealPlan(
  athleteId: string,
  now = Date.now(),
): Promise<Assignment<MealPlanPayload> | null> {
  const [row] = await db
    .select({
      id: assignedMealPlans.id,
      payload: assignedMealPlans.payload,
      version: assignedMealPlans.version,
      name: assignedMealPlans.name,
      createdAt: assignedMealPlans.createdAt,
      effectiveAt: assignedMealPlans.effectiveAt,
      endsAt: assignedMealPlans.endsAt,
    })
    .from(assignedMealPlans)
    .where(and(eq(assignedMealPlans.athleteId, athleteId), withinWindow(assignedMealPlans, now)))
    .orderBy(desc(assignedMealPlans.version))
    .limit(1);
  if (!row) return null;
  return { ...row, payload: row.payload as MealPlanPayload };
}

/** The next published version that has not taken effect yet, if any. */
export async function getScheduledWorkout(
  athleteId: string,
  now = Date.now(),
): Promise<Assignment<WorkoutPayload> | null> {
  const [row] = await db
    .select({
      id: assignedWorkouts.id,
      payload: assignedWorkouts.payload,
      version: assignedWorkouts.version,
      name: assignedWorkouts.name,
      createdAt: assignedWorkouts.createdAt,
      effectiveAt: assignedWorkouts.effectiveAt,
      endsAt: assignedWorkouts.endsAt,
    })
    .from(assignedWorkouts)
    .where(and(
      eq(assignedWorkouts.athleteId, athleteId),
      eq(assignedWorkouts.status, "active"),
      gt(assignedWorkouts.effectiveAt, now),
    ))
    .orderBy(assignedWorkouts.effectiveAt)
    .limit(1);
  if (!row) return null;
  return { ...row, payload: row.payload as WorkoutPayload };
}

export async function getScheduledMealPlan(
  athleteId: string,
  now = Date.now(),
): Promise<Assignment<MealPlanPayload> | null> {
  const [row] = await db
    .select({
      id: assignedMealPlans.id,
      payload: assignedMealPlans.payload,
      version: assignedMealPlans.version,
      name: assignedMealPlans.name,
      createdAt: assignedMealPlans.createdAt,
      effectiveAt: assignedMealPlans.effectiveAt,
      endsAt: assignedMealPlans.endsAt,
    })
    .from(assignedMealPlans)
    .where(and(
      eq(assignedMealPlans.athleteId, athleteId),
      eq(assignedMealPlans.status, "active"),
      gt(assignedMealPlans.effectiveAt, now),
    ))
    .orderBy(assignedMealPlans.effectiveAt)
    .limit(1);
  if (!row) return null;
  return { ...row, payload: row.payload as MealPlanPayload };
}

export async function getWorkoutVersion(athleteId: string, version: number) {
  const [row] = await db.select().from(assignedWorkouts)
    .where(and(eq(assignedWorkouts.athleteId, athleteId), eq(assignedWorkouts.version, version)))
    .limit(1);
  return row ?? null;
}

export async function getMealPlanVersion(athleteId: string, version: number) {
  const [row] = await db.select().from(assignedMealPlans)
    .where(and(eq(assignedMealPlans.athleteId, athleteId), eq(assignedMealPlans.version, version)))
    .limit(1);
  return row ?? null;
}

export async function listWorkoutHistory(athleteId: string, limit = 50): Promise<PlanHistoryEntry[]> {
  return db.select({
    id: assignedWorkouts.id,
    version: assignedWorkouts.version,
    name: assignedWorkouts.name,
    status: assignedWorkouts.status,
    createdAt: assignedWorkouts.createdAt,
    effectiveAt: assignedWorkouts.effectiveAt,
    endsAt: assignedWorkouts.endsAt,
    publishedByMembershipId: assignedWorkouts.publishedByMembershipId,
    sourceTemplateId: assignedWorkouts.sourceTemplateId,
  })
    .from(assignedWorkouts)
    .where(eq(assignedWorkouts.athleteId, athleteId))
    .orderBy(desc(assignedWorkouts.version))
    .limit(limit);
}

export async function listMealPlanHistory(athleteId: string, limit = 50): Promise<PlanHistoryEntry[]> {
  return db.select({
    id: assignedMealPlans.id,
    version: assignedMealPlans.version,
    name: assignedMealPlans.name,
    status: assignedMealPlans.status,
    createdAt: assignedMealPlans.createdAt,
    effectiveAt: assignedMealPlans.effectiveAt,
    endsAt: assignedMealPlans.endsAt,
    publishedByMembershipId: assignedMealPlans.publishedByMembershipId,
    sourceTemplateId: assignedMealPlans.sourceTemplateId,
  })
    .from(assignedMealPlans)
    .where(eq(assignedMealPlans.athleteId, athleteId))
    .orderBy(desc(assignedMealPlans.version))
    .limit(limit);
}

/** Current published version number, used to seed a draft's `baseVersion`. */
export async function currentPlanVersion(athleteId: string, discipline: "coach" | "nutritionist"): Promise<number> {
  const table = discipline === "coach" ? assignedWorkouts : assignedMealPlans;
  const [row] = await db.select({ v: max(table.version) }).from(table).where(eq(table.athleteId, athleteId));
  return row?.v ?? 0;
}

/**
 * Withdraw a plan that was scheduled but has not taken effect yet. Reopens the
 * window of whichever plan it had closed, so cancelling a future phase leaves
 * the athlete on their current plan rather than on nothing.
 */
export async function withdrawScheduledPlan(
  athleteId: string,
  discipline: "coach" | "nutritionist",
  version: number,
  now = Date.now(),
): Promise<boolean> {
  return db.transaction(async (tx) => {
    if (discipline === "coach") {
      const [row] = await tx.update(assignedWorkouts)
        .set({ status: "archived" })
        .where(and(
          eq(assignedWorkouts.athleteId, athleteId),
          eq(assignedWorkouts.version, version),
          eq(assignedWorkouts.status, "active"),
          gt(assignedWorkouts.effectiveAt, now),
        ))
        .returning({ effectiveAt: assignedWorkouts.effectiveAt });
      if (row?.effectiveAt == null) return false;
      await tx.update(assignedWorkouts)
        .set({ endsAt: null })
        .where(and(
          eq(assignedWorkouts.athleteId, athleteId),
          eq(assignedWorkouts.status, "active"),
          eq(assignedWorkouts.endsAt, row.effectiveAt),
        ));
      return true;
    }

    const [row] = await tx.update(assignedMealPlans)
      .set({ status: "archived" })
      .where(and(
        eq(assignedMealPlans.athleteId, athleteId),
        eq(assignedMealPlans.version, version),
        eq(assignedMealPlans.status, "active"),
        gt(assignedMealPlans.effectiveAt, now),
      ))
      .returning({ effectiveAt: assignedMealPlans.effectiveAt });
    if (row?.effectiveAt == null) return false;
    await tx.update(assignedMealPlans)
      .set({ endsAt: null })
      .where(and(
        eq(assignedMealPlans.athleteId, athleteId),
        eq(assignedMealPlans.status, "active"),
        eq(assignedMealPlans.endsAt, row.effectiveAt),
      ));
    return true;
  });
}
