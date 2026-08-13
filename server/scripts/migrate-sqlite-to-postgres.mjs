// One-off data migration: copies existing rows from the legacy SQLite database
// (./data/auth.db) into the Postgres database now used by the app (server/db).
// Safe to re-run — every insert is ON CONFLICT DO NOTHING, so already-migrated
// rows are skipped rather than duplicated or overwritten.
// Usage: node --env-file=.env scripts/migrate-sqlite-to-postgres.mjs

import Database from "better-sqlite3";
import postgres from "postgres";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required — run with: node --env-file=.env scripts/migrate-sqlite-to-postgres.mjs");
  process.exit(1);
}

const sqlite = new Database(join(__dirname, "../data/auth.db"), { readonly: true });
const sql = postgres(connectionString, { max: 1 });

function columnsOf(table) {
  return sqlite.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
}

function rowsOf(table) {
  return sqlite.prepare(`SELECT * FROM "${table}"`).all();
}

function bool(value) {
  return value === null || value === undefined ? null : value === 1;
}

function json(value, fallback) {
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// Insert order respects FK dependencies (user first, everything referencing it after).
async function migrateUsers() {
  const rows = rowsOf("user");
  let n = 0;
  for (const r of rows) {
    await sql`
      INSERT INTO "user" ("id","name","email","emailVerified","image","createdAt","updatedAt","role","isSuperAdmin")
      VALUES (${r.id}, ${r.name}, ${r.email}, ${bool(r.emailVerified)}, ${r.image}, ${r.createdAt}, ${r.updatedAt}, ${r.role}, false)
      ON CONFLICT ("id") DO NOTHING
    `;
    n++;
  }
  console.log(`✓ user: ${n} row(s)`);
}

async function migrateSessions() {
  const rows = rowsOf("session");
  for (const r of rows) {
    await sql`
      INSERT INTO "session" ("id","expiresAt","token","createdAt","updatedAt","ipAddress","userAgent","userId")
      VALUES (${r.id}, ${r.expiresAt}, ${r.token}, ${r.createdAt}, ${r.updatedAt}, ${r.ipAddress}, ${r.userAgent}, ${r.userId})
      ON CONFLICT ("id") DO NOTHING
    `;
  }
  console.log(`✓ session: ${rows.length} row(s)`);
}

async function migrateAccounts() {
  const rows = rowsOf("account");
  for (const r of rows) {
    await sql`
      INSERT INTO "account" (
        "id","accountId","providerId","userId","accessToken","refreshToken","idToken",
        "accessTokenExpiresAt","refreshTokenExpiresAt","scope","password","createdAt","updatedAt"
      ) VALUES (
        ${r.id}, ${r.accountId}, ${r.providerId}, ${r.userId}, ${r.accessToken}, ${r.refreshToken}, ${r.idToken},
        ${r.accessTokenExpiresAt}, ${r.refreshTokenExpiresAt}, ${r.scope}, ${r.password}, ${r.createdAt}, ${r.updatedAt}
      )
      ON CONFLICT ("id") DO NOTHING
    `;
  }
  console.log(`✓ account: ${rows.length} row(s)`);
}

async function migrateVerifications() {
  const rows = rowsOf("verification");
  for (const r of rows) {
    await sql`
      INSERT INTO "verification" ("id","identifier","value","expiresAt","createdAt","updatedAt")
      VALUES (${r.id}, ${r.identifier}, ${r.value}, ${r.expiresAt}, ${r.createdAt}, ${r.updatedAt})
      ON CONFLICT ("id") DO NOTHING
    `;
  }
  console.log(`✓ verification: ${rows.length} row(s)`);
}

async function migrateAthleteProfiles() {
  const rows = rowsOf("athlete_profiles");
  for (const r of rows) {
    await sql`
      INSERT INTO "athlete_profiles" ("userId","fullName","sex","dateOfBirth","heightCm","goalWeightKg","createdAt","updatedAt")
      VALUES (${r.userId}, ${r.fullName}, ${r.sex}, ${r.dateOfBirth}, ${r.heightCm}, ${r.goalWeightKg}, ${r.createdAt}, ${r.updatedAt})
      ON CONFLICT ("userId") DO NOTHING
    `;
  }
  console.log(`✓ athlete_profiles: ${rows.length} row(s)`);
}

async function migrateBodyMeasurements() {
  const rows = rowsOf("body_measurements");
  for (const r of rows) {
    await sql`
      INSERT INTO "body_measurements" ("id","athleteId","measuredAt","weightKg","createdAt")
      VALUES (${r.id}, ${r.athleteId}, ${r.measuredAt}, ${r.weightKg}, ${r.createdAt})
      ON CONFLICT ("id") DO NOTHING
    `;
  }
  console.log(`✓ body_measurements: ${rows.length} row(s)`);
}

async function migrateSupervisionLinks() {
  const rows = rowsOf("supervision_links");
  for (const r of rows) {
    await sql`
      INSERT INTO "supervision_links" ("id","professionalId","athleteId","kind","status","inviteCode","createdAt","acceptedAt")
      VALUES (${r.id}, ${r.professionalId}, ${r.athleteId}, ${r.kind}, ${r.status}, ${r.inviteCode}, ${r.createdAt}, ${r.acceptedAt})
      ON CONFLICT ("id") DO NOTHING
    `;
  }
  console.log(`✓ supervision_links: ${rows.length} row(s)`);
}

async function migrateMessages() {
  const rows = rowsOf("messages");
  for (const r of rows) {
    await sql`
      INSERT INTO "messages" ("id","senderId","receiverId","content","sentAt","readAt")
      VALUES (${r.id}, ${r.senderId}, ${r.receiverId}, ${r.content}, ${r.sentAt}, ${r.readAt})
      ON CONFLICT ("id") DO NOTHING
    `;
  }
  console.log(`✓ messages: ${rows.length} row(s)`);
}

async function migrateLibraryFoods() {
  const rows = rowsOf("library_foods");
  for (const r of rows) {
    await sql`
      INSERT INTO "library_foods" ("id","name","category","kcal","proteinG","carbsG","fatG","createdBy","createdAt")
      VALUES (${r.id}, ${r.name}, ${r.category}, ${r.kcal}, ${r.proteinG}, ${r.carbsG}, ${r.fatG}, ${r.createdBy}, ${r.createdAt})
      ON CONFLICT ("id") DO NOTHING
    `;
  }
  console.log(`✓ library_foods: ${rows.length} row(s)`);
}

async function migrateLibraryExercises() {
  const rows = rowsOf("library_exercises");
  for (const r of rows) {
    await sql`
      INSERT INTO "library_exercises" ("id","name","muscleGroup","equipment","createdBy","createdAt")
      VALUES (${r.id}, ${r.name}, ${r.muscleGroup}, ${r.equipment}, ${r.createdBy}, ${r.createdAt})
      ON CONFLICT ("id") DO NOTHING
    `;
  }
  console.log(`✓ library_exercises: ${rows.length} row(s)`);
}

async function migrateAssignedWorkouts() {
  const rows = rowsOf("assigned_workouts");
  for (const r of rows) {
    await sql`
      INSERT INTO "assigned_workouts" ("id","athleteId","coachId","payload","version","status","createdAt")
      VALUES (${r.id}, ${r.athleteId}, ${r.coachId}, ${sql.json(json(r.payload, {}))}, ${r.version}, ${r.status}, ${r.createdAt})
      ON CONFLICT ("id") DO NOTHING
    `;
  }
  console.log(`✓ assigned_workouts: ${rows.length} row(s)`);
}

async function migrateAssignedMealPlans() {
  const rows = rowsOf("assigned_meal_plans");
  for (const r of rows) {
    await sql`
      INSERT INTO "assigned_meal_plans" ("id","athleteId","nutritionistId","payload","version","status","createdAt")
      VALUES (${r.id}, ${r.athleteId}, ${r.nutritionistId}, ${sql.json(json(r.payload, {}))}, ${r.version}, ${r.status}, ${r.createdAt})
      ON CONFLICT ("id") DO NOTHING
    `;
  }
  console.log(`✓ assigned_meal_plans: ${rows.length} row(s)`);
}

async function migratePushDevices() {
  const rows = rowsOf("push_devices");
  for (const r of rows) {
    await sql`
      INSERT INTO "push_devices" ("expoPushToken","userId","platform","updatedAt")
      VALUES (${r.expoPushToken}, ${r.userId}, ${r.platform}, ${r.updatedAt})
      ON CONFLICT ("expoPushToken") DO NOTHING
    `;
  }
  console.log(`✓ push_devices: ${rows.length} row(s)`);
}

async function migratePlanGenerationJobs() {
  const cols = new Set(columnsOf("plan_generation_jobs"));
  const rows = rowsOf("plan_generation_jobs");
  for (const r of rows) {
    await sql`
      INSERT INTO "plan_generation_jobs" (
        "id","userId","inputHash","requestJson","status","phase","attempt","runCount","upstreamCalls",
        "resultJson","errorCode","errorRetryable","timingsJson","leaseOwner","leaseExpiresAt",
        "createdAt","startedAt","phaseStartedAt","completedAt","updatedAt","durationMs","consumedAt"
      ) VALUES (
        ${r.id}, ${r.userId}, ${r.inputHash}, ${sql.json(json(r.requestJson, null))}, ${r.status}, ${r.phase},
        ${r.attempt}, ${r.runCount}, ${cols.has("upstreamCalls") ? r.upstreamCalls : 0},
        ${sql.json(json(r.resultJson, null))}, ${r.errorCode}, ${bool(r.errorRetryable)}, ${sql.json(json(r.timingsJson, []))},
        ${r.leaseOwner}, ${r.leaseExpiresAt}, ${r.createdAt}, ${r.startedAt}, ${r.phaseStartedAt}, ${r.completedAt},
        ${r.updatedAt}, ${r.durationMs}, ${r.consumedAt}
      )
      ON CONFLICT ("id") DO NOTHING
    `;
  }
  console.log(`✓ plan_generation_jobs: ${rows.length} row(s)`);
}

try {
  await migrateUsers();
  await migrateSessions();
  await migrateAccounts();
  await migrateVerifications();
  await migrateAthleteProfiles();
  await migrateBodyMeasurements();
  await migrateSupervisionLinks();
  await migrateMessages();
  await migrateLibraryFoods();
  await migrateLibraryExercises();
  await migrateAssignedWorkouts();
  await migrateAssignedMealPlans();
  await migratePushDevices();
  await migratePlanGenerationJobs();
  console.log("✓ migration complete");
} finally {
  sqlite.close();
  await sql.end();
}
