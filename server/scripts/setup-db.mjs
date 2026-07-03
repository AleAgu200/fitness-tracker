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
    "role"          TEXT NOT NULL DEFAULT 'athlete'
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
`);

console.log("✓ Better Auth tables created at", dbPath);
db.close();
