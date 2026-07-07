import Database from "better-sqlite3";
import { randomBytes } from "crypto";

// Same DB as auth/supervision — assignments are the professional→athlete write path.
const db = new Database("./data/auth.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS "assigned_workouts" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "athleteId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "coachId"   TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "payload"   TEXT NOT NULL,
    "version"   INTEGER NOT NULL,
    "status"    TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','archived')),
    "createdAt" INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "assigned_meal_plans" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "athleteId"      TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "nutritionistId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "payload"        TEXT NOT NULL,
    "version"        INTEGER NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','archived')),
    "createdAt"      INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS "aw_athlete" ON "assigned_workouts" ("athleteId", "status");
  CREATE INDEX IF NOT EXISTS "amp_athlete" ON "assigned_meal_plans" ("athleteId", "status");
`);

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

function assign(table: "assigned_workouts" | "assigned_meal_plans", ownerCol: string, ownerId: string, athleteId: string, payload: unknown): number {
  const prev = db.prepare(
    `SELECT MAX("version") AS v FROM "${table}" WHERE "athleteId" = ?`,
  ).get(athleteId) as { v: number | null };
  const version = (prev.v ?? 0) + 1;

  const tx = db.transaction(() => {
    db.prepare(`UPDATE "${table}" SET "status" = 'archived' WHERE "athleteId" = ? AND "status" = 'active'`).run(athleteId);
    db.prepare(
      `INSERT INTO "${table}" ("id","athleteId","${ownerCol}","payload","version","status","createdAt")
       VALUES (?,?,?,?,?, 'active', ?)`,
    ).run(newId(), athleteId, ownerId, JSON.stringify(payload), version, Date.now());
  });
  tx();
  return version;
}

export function assignWorkout(coachId: string, athleteId: string, payload: WorkoutPayload): number {
  return assign("assigned_workouts", "coachId", coachId, athleteId, payload);
}

export function assignMealPlan(nutritionistId: string, athleteId: string, payload: MealPlanPayload): number {
  return assign("assigned_meal_plans", "nutritionistId", nutritionistId, athleteId, payload);
}

function getActive<T>(table: string, athleteId: string): Assignment<T> | null {
  const row = db.prepare(
    `SELECT "payload", "version", "createdAt" FROM "${table}"
     WHERE "athleteId" = ? AND "status" = 'active'
     ORDER BY "version" DESC LIMIT 1`,
  ).get(athleteId) as { payload: string; version: number; createdAt: number } | undefined;
  if (!row) return null;
  return { version: row.version, payload: JSON.parse(row.payload) as T, createdAt: row.createdAt };
}

export function getActiveWorkout(athleteId: string): Assignment<WorkoutPayload> | null {
  return getActive<WorkoutPayload>("assigned_workouts", athleteId);
}

export function getActiveMealPlan(athleteId: string): Assignment<MealPlanPayload> | null {
  return getActive<MealPlanPayload>("assigned_meal_plans", athleteId);
}
