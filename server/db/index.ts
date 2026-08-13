import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to run the PULSO server");
}

const globalForDatabase = globalThis as typeof globalThis & {
  pulsoPostgres?: ReturnType<typeof postgres>;
};

const client = globalForDatabase.pulsoPostgres ?? postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
});

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.pulsoPostgres = client;
}

export const db = drizzle(client, { schema });
export { client };
