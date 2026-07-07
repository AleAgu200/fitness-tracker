// Promote an existing user to a professional role (or back to athlete).
// Usage: node scripts/set-role.mjs <email> <athlete|coach|nutritionist|admin>

import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const VALID_ROLES = ["athlete", "coach", "nutritionist", "admin"];

const [email, role] = process.argv.slice(2);
if (!email || !VALID_ROLES.includes(role)) {
  console.error("Usage: node scripts/set-role.mjs <email> <athlete|coach|nutritionist|admin>");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, "../data/auth.db"));

const result = db
  .prepare(`UPDATE "user" SET "role" = ?, "updatedAt" = ? WHERE "email" = ?`)
  .run(role, Date.now(), email.trim().toLowerCase());

if (result.changes === 0) {
  console.error(`No user found with email ${email}`);
  process.exit(1);
}
console.log(`✓ ${email} is now: ${role}`);
