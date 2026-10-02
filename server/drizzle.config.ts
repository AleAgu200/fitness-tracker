import { defineConfig } from "drizzle-kit";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

// No fallback URL: credentials only ever come from the environment.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required (server/.env.local or Doppler)");

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
});
