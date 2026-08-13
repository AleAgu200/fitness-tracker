// Grant/revoke super-admin access — the only thing that unlocks admin-only
// features (e.g. the PULSO tab). Deliberately separate from set-role.mjs:
// there is no API path that can set this (see additionalFields.isSuperAdmin,
// input: false, in server/lib/auth.ts) — direct DB access via this script is
// the only way to grant it.
// Usage: node scripts/grant-superadmin.mjs <email> <on|off>

import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const [email, mode] = process.argv.slice(2);
if (!email || !["on", "off"].includes(mode)) {
  console.error("Usage: node scripts/grant-superadmin.mjs <email> <on|off>");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, "../data/auth.db"));

const result = db
  .prepare(`UPDATE "user" SET "isSuperAdmin" = ?, "updatedAt" = ? WHERE "email" = ?`)
  .run(mode === "on" ? 1 : 0, Date.now(), email.trim().toLowerCase());

if (result.changes === 0) {
  console.error(`No user found with email ${email}`);
  process.exit(1);
}
console.log(`✓ ${email} super-admin: ${mode === "on" ? "granted" : "revoked"}`);
