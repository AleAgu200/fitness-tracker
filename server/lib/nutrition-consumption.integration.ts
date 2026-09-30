import assert from "node:assert/strict";
import test from "node:test";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { nutritionConsumptions } from "@/db/schema";
import { CURRENT_SYNC_SCHEMA_VERSION, type SyncMutation } from "@/lib/sync-contract";
import { pushMutations } from "@/lib/sync";
import { seedCoachedAthlete } from "@/lib/test-fixtures";

let counter = 0;
function mutation(athleteId: string, input: Pick<SyncMutation, "entityId" | "operation" | "payload"> & { baseVersion?: number | null }): SyncMutation {
  counter += 1;
  return {
    schemaVersion: CURRENT_SYNC_SCHEMA_VERSION,
    mutationId: `consumption_${counter}_${athleteId}`,
    entityType: "nutrition_consumption",
    occurredAt: Date.now(),
    ...input,
  };
}

async function push(athleteId: string, item: SyncMutation) {
  const result = await pushMutations(athleteId, `device_${athleteId}`, [item]);
  if (result.upgradeRequired) throw new Error("unexpected_upgrade_required");
  return result.results[0];
}

const milk = (version: number, overrides: Record<string, unknown> = {}) => ({
  localDate: "2026-09-30",
  timezone: "America/Tegucigalpa",
  occurredAt: Date.now(),
  timePrecision: "exact",
  version,
  kind: "beverage",
  mealLabel: null,
  planSlotKey: null,
  name: "Leche semidescremada",
  amount: 250,
  unit: "ml",
  source: "library",
  completeness: "partial",
  nutrients: { kcal: 115, proteinG: 8, carbsG: 12, fatG: 4, sodiumMg: null },
  components: [{
    name: "Leche semidescremada", source: "library",
    basis: { amount: 100, unit: "ml" }, amount: 250, unit: "ml",
    nutrientsPerBasis: { kcal: 46, proteinG: 3.2, carbsG: 4.8, fatG: 1.6, sodiumMg: null },
  }],
  volumeMl: 250,
  plainWater: false,
  legacyAggregate: false,
  deletedAt: null,
  ...overrides,
});

test("a drink is stored once, edited by version and deleted as a tombstone", async () => {
  const { athleteId } = await seedCoachedAthlete({ discipline: "nutritionist", categories: ["nutrition"] });
  const entityId = `drink_${athleteId}`;

  const create = mutation(athleteId, { entityId, operation: "create", payload: milk(1) });
  assert.equal((await push(athleteId, create)).status, "acked");
  assert.equal((await push(athleteId, create)).status, "acked", "retrying the same mutation is idempotent");
  let rows = await db.select().from(nutritionConsumptions).where(eq(nutritionConsumptions.id, entityId));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].volumeMl, 250);
  assert.equal(rows[0].nutrients.sodiumMg, null, "unknown stays unknown, not zero");

  const edit = await push(athleteId, mutation(athleteId, { entityId, operation: "update", baseVersion: 1, payload: milk(2, { amount: 200, volumeMl: 200 }) }));
  assert.equal(edit.status, "acked");
  rows = await db.select().from(nutritionConsumptions).where(eq(nutritionConsumptions.id, entityId));
  assert.equal(rows[0].version, 2);
  assert.equal(rows[0].volumeMl, 200);

  const stale = await push(athleteId, mutation(athleteId, { entityId, operation: "update", baseVersion: 1, payload: milk(3) }));
  assert.equal(stale.status, "rejected");
  assert.equal(stale.error, "version_conflict");

  const deletedAt = Date.now();
  assert.equal((await push(athleteId, mutation(athleteId, { entityId, operation: "delete", baseVersion: 2, payload: milk(3, { deletedAt }) }))).status, "acked");
  rows = await db.select().from(nutritionConsumptions).where(eq(nutritionConsumptions.id, entityId));
  assert.equal(rows.length, 1, "delete keeps a tombstone");
  assert.equal(rows[0].deletedAt, deletedAt);

  assert.equal((await push(athleteId, mutation(athleteId, { entityId, operation: "update", baseVersion: 3, payload: milk(4) }))).status, "acked", "undo restores the same record");
  rows = await db.select().from(nutritionConsumptions).where(eq(nutritionConsumptions.id, entityId));
  assert.equal(rows[0].deletedAt, null);
});

test("a consumption mixing grams into a millilitre basis or with negative values is rejected", async () => {
  const { athleteId } = await seedCoachedAthlete({ discipline: "nutritionist", categories: ["nutrition"] });
  const bad = await push(athleteId, mutation(athleteId, {
    entityId: `bad_${athleteId}`, operation: "create", payload: milk(1, { nutrients: { kcal: -5 } }),
  }));
  assert.equal(bad.status, "rejected");
  assert.equal(bad.error, "invalid_nutrition_consumption");
});
