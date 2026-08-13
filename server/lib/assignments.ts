import { randomBytes } from "crypto";

import { and, desc, eq, max } from "drizzle-orm";

import { db } from "@/db";
import { assignedMealPlans, assignedWorkouts } from "@/db/schema";

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
}

function newId(): string {
  return randomBytes(12).toString("hex");
}

export async function assignWorkout(coachId: string, athleteId: string, payload: WorkoutPayload): Promise<number> {
  return db.transaction(async (tx) => {
    const [prev] = await tx
      .select({ v: max(assignedWorkouts.version) })
      .from(assignedWorkouts)
      .where(eq(assignedWorkouts.athleteId, athleteId));
    const version = (prev?.v ?? 0) + 1;

    await tx.update(assignedWorkouts)
      .set({ status: "archived" })
      .where(and(eq(assignedWorkouts.athleteId, athleteId), eq(assignedWorkouts.status, "active")));
    await tx.insert(assignedWorkouts).values({
      id: newId(),
      athleteId,
      coachId,
      payload,
      version,
      status: "active",
      createdAt: Date.now(),
    });
    return version;
  });
}

export async function assignMealPlan(nutritionistId: string, athleteId: string, payload: MealPlanPayload): Promise<number> {
  return db.transaction(async (tx) => {
    const [prev] = await tx
      .select({ v: max(assignedMealPlans.version) })
      .from(assignedMealPlans)
      .where(eq(assignedMealPlans.athleteId, athleteId));
    const version = (prev?.v ?? 0) + 1;

    await tx.update(assignedMealPlans)
      .set({ status: "archived" })
      .where(and(eq(assignedMealPlans.athleteId, athleteId), eq(assignedMealPlans.status, "active")));
    await tx.insert(assignedMealPlans).values({
      id: newId(),
      athleteId,
      nutritionistId,
      payload,
      version,
      status: "active",
      createdAt: Date.now(),
    });
    return version;
  });
}

export async function getActiveWorkout(athleteId: string): Promise<Assignment<WorkoutPayload> | null> {
  const [row] = await db
    .select({ payload: assignedWorkouts.payload, version: assignedWorkouts.version, createdAt: assignedWorkouts.createdAt })
    .from(assignedWorkouts)
    .where(and(eq(assignedWorkouts.athleteId, athleteId), eq(assignedWorkouts.status, "active")))
    .orderBy(desc(assignedWorkouts.version))
    .limit(1);
  if (!row) return null;
  return { version: row.version, payload: row.payload as WorkoutPayload, createdAt: row.createdAt };
}

export async function getActiveMealPlan(athleteId: string): Promise<Assignment<MealPlanPayload> | null> {
  const [row] = await db
    .select({ payload: assignedMealPlans.payload, version: assignedMealPlans.version, createdAt: assignedMealPlans.createdAt })
    .from(assignedMealPlans)
    .where(and(eq(assignedMealPlans.athleteId, athleteId), eq(assignedMealPlans.status, "active")))
    .orderBy(desc(assignedMealPlans.version))
    .limit(1);
  if (!row) return null;
  return { version: row.version, payload: row.payload as MealPlanPayload, createdAt: row.createdAt };
}
