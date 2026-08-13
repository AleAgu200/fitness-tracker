// Promote an existing user to a professional role (or back to athlete).
// Usage: node --env-file=.env scripts/set-role.mjs <email> <athlete|coach|nutritionist|admin>

import postgres from "postgres";

const VALID_ROLES = ["athlete", "coach", "nutritionist", "admin"];

const [email, role] = process.argv.slice(2);
if (!email || !VALID_ROLES.includes(role)) {
  console.error("Usage: node --env-file=.env scripts/set-role.mjs <email> <athlete|coach|nutritionist|admin>");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required — run with: node --env-file=.env scripts/set-role.mjs ...");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });

const result = await sql`
  UPDATE "user" SET "role" = ${role}, "updatedAt" = now()
  WHERE "email" = ${email.trim().toLowerCase()}
`;

await sql.end();

if (result.count === 0) {
  console.error(`No user found with email ${email}`);
  process.exit(1);
}
console.log(`✓ ${email} is now: ${role}`);
