import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { subscriptions, syncDevices, user } from "@/db/schema";
import {
  DeviceSyncError,
  getDeviceSyncStatus,
  pullRecords,
  pushRecords,
  setDeviceSyncEnabled,
} from "@/lib/device-sync";
import { CURRENT_SYNC_SCHEMA_VERSION } from "@/lib/sync-contract";
import { pushMutations, WriterDeviceConflictError } from "@/lib/sync";

async function seedAthlete(): Promise<string> {
  const id = `athlete_${randomUUID()}`;
  const now = new Date();
  await db.insert(user).values({ id, name: "Atleta Sync", email: `${id}@pulso.test`, role: "athlete", createdAt: now, updatedAt: now });
  return id;
}

async function grantPlus(userId: string, endsAt: number | null = null) {
  const now = Date.now();
  await db.insert(subscriptions).values({
    userId, entitlement: "pulso_plus", status: "active", store: "admin", isSandbox: false,
    currentPeriodEndsAt: endsAt, willRenew: false, createdAt: now, updatedAt: now,
  }).onConflictDoUpdate({ target: subscriptions.userId, set: { currentPeriodEndsAt: endsAt, updatedAt: now } });
}

async function readySync(): Promise<string> {
  const athleteId = await seedAthlete();
  await grantPlus(athleteId);
  await setDeviceSyncEnabled(athleteId, true);
  return athleteId;
}

const set = (id: string, reps: number, changedAt: number) =>
  ({ table: "logged_sets", id, op: "upsert" as const, payload: { id, reps, weightKg: 60 }, changedAt });

async function expectSyncError(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => error instanceof DeviceSyncError && error.code === code);
}

test("device sync: needs consent and Plus", async () => {
  const athleteId = await seedAthlete();
  await expectSyncError(pushRecords(athleteId, "phone", [set("s1", 8, 1000)]), "sync_disabled");
  await setDeviceSyncEnabled(athleteId, true);
  await expectSyncError(pushRecords(athleteId, "phone", [set("s1", 8, 1000)]), "subscription_required");
  await expectSyncError(pullRecords(athleteId, 0), "subscription_required");
  await grantPlus(athleteId);
  assert.equal((await pushRecords(athleteId, "phone", [set("s1", 8, 1000)]))[0].status, "accepted");
  const status = await getDeviceSyncStatus(athleteId);
  assert.equal(status.active, true);
  assert.equal(status.records, 1);
});

test("device sync: one device's changes reach the other, in order, by cursor", async () => {
  const athleteId = await readySync();
  await pushRecords(athleteId, "phone", [set("s1", 8, 1000), set("s2", 6, 1001)]);
  const first = await pullRecords(athleteId, 0, 1);
  assert.equal(first.records.length, 1);
  assert.equal(first.hasMore, true);
  const second = await pullRecords(athleteId, first.nextCursor, 10);
  assert.deepEqual(second.records.map(record => record.id), ["s2"]);
  assert.equal(second.hasMore, false);
  assert.equal((await pullRecords(athleteId, second.nextCursor)).records.length, 0);
});

test("device sync: the most recent change wins, and ties resolve the same everywhere", async () => {
  const athleteId = await readySync();
  await pushRecords(athleteId, "tablet", [set("s1", 10, 2000)]);
  const late = await pushRecords(athleteId, "phone", [set("s1", 5, 1500)]);
  assert.equal(late[0].status, "superseded");
  let [record] = (await pullRecords(athleteId, 0)).records;
  assert.equal((record.payload as { reps: number }).reps, 10);

  // Same instant: the larger device ID wins, whichever arrives first.
  await pushRecords(athleteId, "zz-device", [set("s1", 12, 2000)]);
  [record] = (await pullRecords(athleteId, 0)).records;
  assert.equal((record.payload as { reps: number }).reps, 12);
  assert.equal((await pushRecords(athleteId, "aa-device", [set("s1", 1, 2000)]))[0].status, "superseded");
});

test("device sync: a deletion reaches every device and an older edit cannot revive it", async () => {
  const athleteId = await readySync();
  await pushRecords(athleteId, "phone", [set("s1", 8, 1000)]);
  await pushRecords(athleteId, "tablet", [{ table: "logged_sets", id: "s1", op: "delete", changedAt: 3000 }]);
  assert.equal((await pushRecords(athleteId, "phone", [set("s1", 9, 2000)]))[0].status, "superseded");
  const [record] = (await pullRecords(athleteId, 0)).records;
  assert.equal(record.deleted, true);
  assert.equal(record.payload, null);
  assert.equal((await getDeviceSyncStatus(athleteId)).records, 0);
});

test("device sync: accounts are isolated and foreign or unknown records are refused", async () => {
  const a = await readySync();
  const b = await readySync();
  await pushRecords(a, "phone", [set("shared-id", 8, 1000)]);
  assert.equal((await pullRecords(b, 0)).records.length, 0);
  const results = await pushRecords(b, "phone", [
    { table: "consumptions", id: "c1", op: "upsert", payload: { id: "c1", athleteId: a }, changedAt: 1000 },
    { table: "user", id: "x", op: "upsert", payload: {}, changedAt: 1000 },
  ]);
  assert.deepEqual(results.map(result => result.error), ["foreign_account", "unknown_table"]);
});

test("device sync: turning it off deletes the server copy; losing Plus pauses and keeps it", async () => {
  const athleteId = await readySync();
  await pushRecords(athleteId, "phone", [set("s1", 8, 1000)]);
  await grantPlus(athleteId, Date.now() - 1000);
  await expectSyncError(pullRecords(athleteId, 0), "subscription_required");
  assert.equal((await getDeviceSyncStatus(athleteId)).records, 1);
  await grantPlus(athleteId, null);
  await setDeviceSyncEnabled(athleteId, false);
  assert.equal((await getDeviceSyncStatus(athleteId)).records, 0);
});

test("device sync: a second device may send professional data only while sync is active", async () => {
  const athleteId = await seedAthlete();
  const mutation = (id: string) => ({
    schemaVersion: CURRENT_SYNC_SCHEMA_VERSION, mutationId: `m_${randomUUID()}`, entityType: "training_session" as const,
    entityId: id, operation: "create" as const, occurredAt: Date.now(),
    payload: { status: "completed", startedAt: Date.now() - 1000, completedAt: Date.now(), totalVolumeKg: 0, version: 1 },
  });
  await pushMutations(athleteId, `phone_${athleteId}`, [mutation(`s_${randomUUID()}`)]);
  await assert.rejects(pushMutations(athleteId, `tablet_${athleteId}`, [mutation(`s_${randomUUID()}`)]), WriterDeviceConflictError);

  await grantPlus(athleteId);
  await setDeviceSyncEnabled(athleteId, true);
  const result = await pushMutations(athleteId, `tablet_${athleteId}`, [mutation(`s_${randomUUID()}`)]);
  assert.equal(result.results?.[0]?.status, "acked");
  const devices = await db.select().from(syncDevices).where(eq(syncDevices.athleteId, athleteId));
  assert.deepEqual(devices.map(row => row.status).sort(), ["active_writer", "secondary"]);
});
