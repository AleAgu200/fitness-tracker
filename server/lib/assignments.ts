import { randomBytes } from "crypto";

import { and, desc, eq, max } from "drizzle-orm";

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
  version: number;
  payload: T;
  createdAt: number;
  effectiveAt: number | null;
  endsAt: number | null;
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

    await tx.update(assignedWorkouts)
      .set({ status: "archived" })
      .where(and(
        eq(assignedWorkouts.athleteId, athleteId),
        eq(assignedWorkouts.status, "active"),
        ...(options.access ? [eq(assignedWorkouts.organizationId, options.access.organizationId)] : []),
      ));
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
      createdAt: now,
      effectiveAt: options.effectiveAt ?? now,
      endsAt: options.endsAt,
    });
    await tx.insert(syncChanges).values({
      id: `change_${newId()}`,
      athleteId,
      entityType: "workout_assignment",
      entityId: id,
      operation: "create",
      payload: { version, payload, effectiveAt: options.effectiveAt ?? now, endsAt: options.endsAt ?? null },
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

    await tx.update(assignedMealPlans)
      .set({ status: "archived" })
      .where(and(
        eq(assignedMealPlans.athleteId, athleteId),
        eq(assignedMealPlans.status, "active"),
        ...(options.access ? [eq(assignedMealPlans.organizationId, options.access.organizationId)] : []),
      ));
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
      createdAt: now,
      effectiveAt: options.effectiveAt ?? now,
      endsAt: options.endsAt,
    });
    await tx.insert(syncChanges).values({
      id: `change_${newId()}`,
      athleteId,
      entityType: "meal_plan_assignment",
      entityId: id,
      operation: "create",
      payload: { version, payload, effectiveAt: options.effectiveAt ?? now, endsAt: options.endsAt ?? null },
      createdAt: now,
    });
    return version;
  });
}

export async function getActiveWorkout(athleteId: string): Promise<Assignment<WorkoutPayload> | null> {
  const [row] = await db
    .select({
      payload: assignedWorkouts.payload,
      version: assignedWorkouts.version,
      createdAt: assignedWorkouts.createdAt,
      effectiveAt: assignedWorkouts.effectiveAt,
      endsAt: assignedWorkouts.endsAt,
    })
    .from(assignedWorkouts)
    .where(and(eq(assignedWorkouts.athleteId, athleteId), eq(assignedWorkouts.status, "active")))
    .orderBy(desc(assignedWorkouts.version))
    .limit(1);
  if (!row) return null;
  return { version: row.version, payload: row.payload as WorkoutPayload, createdAt: row.createdAt, effectiveAt: row.effectiveAt, endsAt: row.endsAt };
}

export async function getActiveMealPlan(athleteId: string): Promise<Assignment<MealPlanPayload> | null> {
  const [row] = await db
    .select({
      payload: assignedMealPlans.payload,
      version: assignedMealPlans.version,
      createdAt: assignedMealPlans.createdAt,
      effectiveAt: assignedMealPlans.effectiveAt,
      endsAt: assignedMealPlans.endsAt,
    })
    .from(assignedMealPlans)
    .where(and(eq(assignedMealPlans.athleteId, athleteId), eq(assignedMealPlans.status, "active")))
    .orderBy(desc(assignedMealPlans.version))
    .limit(1);
  if (!row) return null;
  return { version: row.version, payload: row.payload as MealPlanPayload, createdAt: row.createdAt, effectiveAt: row.effectiveAt, endsAt: row.endsAt };
}
