import Database from "better-sqlite3";

const db = new Database("./data/auth.db");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS "athlete_profiles" (
    "userId"       TEXT NOT NULL PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
    "fullName"     TEXT NOT NULL,
    "sex"          TEXT CHECK ("sex" IS NULL OR "sex" IN ('M','F','X')),
    "dateOfBirth"  TEXT,
    "heightCm"     REAL,
    "goalWeightKg" REAL,
    "createdAt"    INTEGER NOT NULL,
    "updatedAt"    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "body_measurements" (
    "id"         TEXT NOT NULL PRIMARY KEY,
    "athleteId"  TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "measuredAt" INTEGER NOT NULL,
    "weightKg"   REAL NOT NULL,
    "createdAt"  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS "body_measurements_athlete_date"
    ON "body_measurements" ("athleteId", "measuredAt" DESC);
`);

export interface WeightMeasurementInput {
  id: string;
  measuredAt: number;
  weightKg: number;
}

export interface AthleteProfileUpdate {
  fullName?: string;
  sex?: "M" | "F" | "X" | null;
  dateOfBirth?: string | null;
  heightCm?: number | null;
  goalWeightKg?: number | null;
  measurement?: WeightMeasurementInput;
}

export interface AthleteProfileRecord {
  userId: string;
  fullName: string;
  sex: "M" | "F" | "X" | null;
  dateOfBirth: string | null;
  heightCm: number | null;
  goalWeightKg: number | null;
  createdAt: number;
  updatedAt: number;
  latestWeight: WeightMeasurementInput | null;
}

type ProfileRow = Omit<AthleteProfileRecord, "latestWeight">;

function getProfileRow(userId: string): ProfileRow | null {
  return (db.prepare(`
    SELECT "userId", "fullName", "sex", "dateOfBirth", "heightCm",
           "goalWeightKg", "createdAt", "updatedAt"
    FROM "athlete_profiles"
    WHERE "userId" = ?
  `).get(userId) as ProfileRow | undefined) ?? null;
}

function getLatestWeight(userId: string): WeightMeasurementInput | null {
  return (db.prepare(`
    SELECT "id", "measuredAt", "weightKg"
    FROM "body_measurements"
    WHERE "athleteId" = ?
    ORDER BY "measuredAt" DESC, "createdAt" DESC
    LIMIT 1
  `).get(userId) as WeightMeasurementInput | undefined) ?? null;
}

export function getAthleteProfile(userId: string): AthleteProfileRecord | null {
  const profile = getProfileRow(userId);
  return profile ? { ...profile, latestWeight: getLatestWeight(userId) } : null;
}

export function upsertAthleteProfile(
  userId: string,
  fallbackName: string,
  update: AthleteProfileUpdate,
): AthleteProfileRecord {
  const transaction = db.transaction(() => {
    const existing = getProfileRow(userId);
    const now = Date.now();
    const fullName = update.fullName ?? existing?.fullName ?? fallbackName;
    const sex = update.sex !== undefined ? update.sex : (existing?.sex ?? null);
    const dateOfBirth = update.dateOfBirth !== undefined
      ? update.dateOfBirth
      : (existing?.dateOfBirth ?? null);
    const heightCm = update.heightCm !== undefined
      ? update.heightCm
      : (existing?.heightCm ?? null);
    const goalWeightKg = update.goalWeightKg !== undefined
      ? update.goalWeightKg
      : (existing?.goalWeightKg ?? null);

    db.prepare(`
      INSERT INTO "athlete_profiles"
        ("userId", "fullName", "sex", "dateOfBirth", "heightCm", "goalWeightKg", "createdAt", "updatedAt")
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT("userId") DO UPDATE SET
        "fullName" = excluded."fullName",
        "sex" = excluded."sex",
        "dateOfBirth" = excluded."dateOfBirth",
        "heightCm" = excluded."heightCm",
        "goalWeightKg" = excluded."goalWeightKg",
        "updatedAt" = excluded."updatedAt"
    `).run(
      userId,
      fullName,
      sex,
      dateOfBirth,
      heightCm,
      goalWeightKg,
      existing?.createdAt ?? now,
      now,
    );

    // The portal reads Better Auth's user name, so update both in one transaction.
    db.prepare(`UPDATE "user" SET "name" = ?, "updatedAt" = ? WHERE "id" = ?`)
      .run(fullName, now, userId);

    if (update.measurement) {
      const owner = db.prepare(`SELECT "athleteId" FROM "body_measurements" WHERE "id" = ?`)
        .get(update.measurement.id) as { athleteId: string } | undefined;
      if (owner && owner.athleteId !== userId) {
        throw new Error("measurement_id_conflict");
      }
      db.prepare(`
        INSERT INTO "body_measurements" ("id", "athleteId", "measuredAt", "weightKg", "createdAt")
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT("id") DO UPDATE SET
          "measuredAt" = excluded."measuredAt",
          "weightKg" = excluded."weightKg"
      `).run(
        update.measurement.id,
        userId,
        update.measurement.measuredAt,
        update.measurement.weightKg,
        now,
      );
    }
  });

  transaction();
  return getAthleteProfile(userId)!;
}
