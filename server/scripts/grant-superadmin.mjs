// Grant/revoke super-admin access — the only thing that unlocks admin-only
// features (e.g. the PULSO tab). Deliberately separate from set-role.mjs:
// there is no API path that can set this (see additionalFields.isSuperAdmin,
// input: false, in server/lib/auth.ts) — direct DB access via this script is
// the only way to grant it.
// Usage: node --env-file=.env scripts/grant-superadmin.mjs <email> <on|off>

import postgres from "postgres";

const [email, mode] = process.argv.slice(2);
if (!email || !["on", "off"].includes(mode)) {
  console.error("Usage: node --env-file=.env scripts/grant-superadmin.mjs <email> <on|off>");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required — run with: node --env-file=.env scripts/grant-superadmin.mjs ...");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });

const result = await sql`
  UPDATE "user" SET "isSuperAdmin" = ${mode === "on"}, "updatedAt" = now()
  WHERE "email" = ${email.trim().toLowerCase()}
`;

await sql.end();

if (result.count === 0) {
  console.error(`No user found with email ${email}`);
  process.exit(1);
}
console.log(`✓ ${email} super-admin: ${mode === "on" ? "granted" : "revoked"}`);
