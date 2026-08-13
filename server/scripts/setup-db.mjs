// Run once to create Better Auth tables in data/auth.db
// Usage: node scripts/setup-db.mjs

import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "../data/auth.db");

mkdirSync(join(__dirname, "../data"), { recursive: true });

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS "user" (
    "id"            TEXT NOT NULL PRIMARY KEY,
    "name"          TEXT NOT NULL,
    "email"         TEXT NOT NULL UNIQUE,
    "emailVerified" INTEGER NOT NULL DEFAULT 0,
    "image"         TEXT,
    "createdAt"     INTEGER NOT NULL,
    "updatedAt"     INTEGER NOT NULL,
    "role"          TEXT NOT NULL DEFAULT 'athlete',
    "isSuperAdmin"  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS "session" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "expiresAt"   INTEGER NOT NULL,
    "token"       TEXT NOT NULL UNIQUE,
    "createdAt"   INTEGER NOT NULL,
    "updatedAt"   INTEGER NOT NULL,
    "ipAddress"   TEXT,
    "userAgent"   TEXT,
    "userId"      TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS "account" (
    "id"                     TEXT NOT NULL PRIMARY KEY,
    "accountId"              TEXT NOT NULL,
    "providerId"             TEXT NOT NULL,
    "userId"                 TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "accessToken"            TEXT,
    "refreshToken"           TEXT,
    "idToken"                TEXT,
    "accessTokenExpiresAt"   INTEGER,
    "refreshTokenExpiresAt"  INTEGER,
    "scope"                  TEXT,
    "password"               TEXT,
    "createdAt"              INTEGER NOT NULL,
    "updatedAt"              INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "verification" (
    "id"         TEXT NOT NULL PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "value"      TEXT NOT NULL,
    "expiresAt"  INTEGER NOT NULL,
    "createdAt"  INTEGER,
    "updatedAt"  INTEGER
  );

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

  CREATE TABLE IF NOT EXISTS "plan_generation_jobs" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "userId"         TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "inputHash"      TEXT NOT NULL,
    "requestJson"    TEXT,
    "status"         TEXT NOT NULL CHECK ("status" IN ('queued','running','succeeded','requires_review','failed')),
    "phase"          TEXT NOT NULL CHECK ("phase" IN ('queued','preparing','generating','validating','completed')),
    "attempt"        INTEGER NOT NULL DEFAULT 0,
    "runCount"       INTEGER NOT NULL DEFAULT 0,
    "resultJson"     TEXT,
    "errorCode"      TEXT,
    "errorRetryable" INTEGER,
    "timingsJson"    TEXT NOT NULL DEFAULT '[]',
    "leaseOwner"     TEXT,
    "leaseExpiresAt" INTEGER,
    "createdAt"      INTEGER NOT NULL,
    "startedAt"      INTEGER,
    "phaseStartedAt" INTEGER,
    "completedAt"    INTEGER,
    "updatedAt"      INTEGER NOT NULL,
    "durationMs"     INTEGER,
    "consumedAt"     INTEGER,
    CHECK ("requestJson" IS NULL OR json_valid("requestJson")),
    CHECK ("resultJson" IS NULL OR json_valid("resultJson")),
    CHECK (json_valid("timingsJson"))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS "plan_generation_jobs_one_active_user"
    ON "plan_generation_jobs" ("userId")
    WHERE "status" IN ('queued','running');

  CREATE INDEX IF NOT EXISTS "plan_generation_jobs_user_current"
    ON "plan_generation_jobs" ("userId", "consumedAt", "createdAt" DESC);

  CREATE INDEX IF NOT EXISTS "plan_generation_jobs_stale_lease"
    ON "plan_generation_jobs" ("status", "leaseExpiresAt");
`);

// Idempotent column add for databases created before isSuperAdmin existed —
// CREATE TABLE IF NOT EXISTS above only helps fresh installs.
try {
  db.exec(`ALTER TABLE "user" ADD COLUMN "isSuperAdmin" INTEGER NOT NULL DEFAULT 0`);
} catch (e) {
  if (!String(e).includes("duplicate column name")) throw e;
}

console.log("✓ PULSO server tables created at", dbPath);
db.close();
