import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { personalBackups, subscriptions, syncDevices, user } from "@/db/schema";
import { exportAccountData, requestAccountDeletion } from "@/lib/account";
import { sha256Hex } from "@/lib/backup-policy";
import {
  BackupError,
  createBackup,
  deleteBackups,
  getBackupBootstrap,
  getBackupSnapshot,
  getBackupStatus,
  setBackupEnabled,
} from "@/lib/personal-backup";
import { CURRENT_SYNC_SCHEMA_VERSION } from "@/lib/sync-contract";
import { claimWriterDevice, pushMutations, WriterDeviceConflictError } from "@/lib/sync";

const DAY = 24 * 60 * 60 * 1000;

async function seedAthlete(): Promise<string> {
  const id = `athlete_${randomUUID()}`;
  const now = new Date();
  await db.insert(user).values({ id, name: "Atleta Respaldo", email: `${id}@pulso.test`, role: "athlete", createdAt: now, updatedAt: now });
  return id;
}

/** Plus as the admin panel grants it (store billing is off before launch). */
async function grantPlus(userId: string, endsAt: number | null = null) {
  const now = Date.now();
  await db.insert(subscriptions).values({
    userId, entitlement: "pulso_plus", status: "active", store: "admin", isSandbox: false,
    currentPeriodEndsAt: endsAt, willRenew: false, createdAt: now, updatedAt: now,
  }).onConflictDoUpdate({ target: subscriptions.userId, set: { status: "active", currentPeriodEndsAt: endsAt, updatedAt: now } });
}

function upload(owner: string, sessions: number, extra: Record<string, unknown> = {}) {
  const payload = {
    format: "pulso-backup",
    formatVersion: 1,
    owner,
    createdAt: Date.now(),
    bootstrap: { profile: { fullName: "Atleta Respaldo" }, onboarding: { status: "completed" }, activeProgramId: "p1" },
    tables: { workout_sessions: Array.from({ length: sessions }, (_, i) => ({ id: `s${i}` })) },
    excluded: [],
    ...extra,
  };
  const payloadJson = JSON.stringify(payload);
  return { checksum: sha256Hex(payloadJson), payloadJson };
}

async function expectBackupError(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => error instanceof BackupError && error.code === code);
}

test("backup: needs consent and Plus to create, never to read", async () => {
  const athleteId = await seedAthlete();
  const deviceId = `device_${athleteId}`;

  await expectBackupError(createBackup(athleteId, { deviceId, ...upload(athleteId, 3) }), "backup_disabled");
  await setBackupEnabled(athleteId, true);
  await expectBackupError(createBackup(athleteId, { deviceId, ...upload(athleteId, 3) }), "subscription_required");

  await grantPlus(athleteId);
  const first = await createBackup(athleteId, { deviceId, ...upload(athleteId, 3) });
  assert.equal(first.revision, 1);
  assert.equal(first.manifest.counts.workout_sessions, 3);

  const status = await getBackupStatus(athleteId);
  assert.equal(status.canCreate, true);
  assert.equal(status.latest?.revision, 1);
  const bootstrap = await getBackupBootstrap(athleteId);
  assert.deepEqual((bootstrap?.bootstrap as { activeProgramId: string }).activeProgramId, "p1");

  const snapshot = await getBackupSnapshot(athleteId);
  assert.equal(snapshot.revision, bootstrap?.revision, "bootstrap and snapshot describe the same revision");
  assert.equal(sha256Hex(snapshot.payloadJson), snapshot.checksum);
});

test("backup: an athlete with no copy gets a verified absence, not an error", async () => {
  const athleteId = await seedAthlete();
  assert.equal(await getBackupBootstrap(athleteId), null);
  const status = await getBackupStatus(athleteId);
  assert.equal(status.latest, null);
  assert.equal(status.canCreate, false);
  await expectBackupError(getBackupSnapshot(athleteId), "backup_not_found");
});

test("backup: only the writer phone uploads, and a claim moves the writer explicitly", async () => {
  const athleteId = await seedAthlete();
  await setBackupEnabled(athleteId, true);
  await grantPlus(athleteId);
  const oldPhone = `device_old_${athleteId}`;
  const newPhone = `device_new_${athleteId}`;
  await createBackup(athleteId, { deviceId: oldPhone, ...upload(athleteId, 5) });

  await assert.rejects(createBackup(athleteId, { deviceId: newPhone, ...upload(athleteId, 5) }), WriterDeviceConflictError);

  const claim = await claimWriterDevice(athleteId, newPhone, CURRENT_SYNC_SCHEMA_VERSION);
  assert.equal(claim.replaced, 1);
  const second = await createBackup(athleteId, { deviceId: newPhone, ...upload(athleteId, 5) });
  assert.equal(second.revision, 2);

  // The replaced phone can no longer push activity or copies.
  await assert.rejects(pushMutations(athleteId, oldPhone, [{
    schemaVersion: CURRENT_SYNC_SCHEMA_VERSION, mutationId: `m_${randomUUID()}`, entityType: "training_session",
    entityId: `s_${randomUUID()}`, operation: "create", occurredAt: Date.now(),
    payload: { status: "completed", startedAt: Date.now() - 1000, completedAt: Date.now(), totalVolumeKg: 0, version: 1 },
  }]), WriterDeviceConflictError);
  await assert.rejects(createBackup(athleteId, { deviceId: oldPhone, ...upload(athleteId, 5) }), WriterDeviceConflictError);

  // Claiming twice is harmless.
  assert.equal((await claimWriterDevice(athleteId, newPhone, CURRENT_SYNC_SCHEMA_VERSION)).replaced, 0);
  const writers = await db.select().from(syncDevices).where(eq(syncDevices.athleteId, athleteId));
  assert.deepEqual(writers.filter(row => row.status === "active_writer").map(row => row.id), [newPhone]);
});

test("backup: a device id of another account cannot be claimed", async () => {
  const first = await seedAthlete();
  const second = await seedAthlete();
  await claimWriterDevice(first, `device_shared_${first}`, CURRENT_SYNC_SCHEMA_VERSION);
  await assert.rejects(claimWriterDevice(second, `device_shared_${first}`, CURRENT_SYNC_SCHEMA_VERSION), WriterDeviceConflictError);
});

test("backup: a much smaller copy needs confirmation before replacing a full one", async () => {
  const athleteId = await seedAthlete();
  await setBackupEnabled(athleteId, true);
  await grantPlus(athleteId);
  const deviceId = `device_${athleteId}`;
  await createBackup(athleteId, { deviceId, ...upload(athleteId, 100) });
  await expectBackupError(createBackup(athleteId, { deviceId, ...upload(athleteId, 2) }), "shrink_requires_confirmation");
  const confirmed = await createBackup(athleteId, { deviceId, confirmShrink: true, ...upload(athleteId, 2) });
  assert.equal(confirmed.revision, 2);
});

test("backup: rejects tampered, foreign and unsupported copies", async () => {
  const athleteId = await seedAthlete();
  await setBackupEnabled(athleteId, true);
  await grantPlus(athleteId);
  const deviceId = `device_${athleteId}`;
  const good = upload(athleteId, 1);
  await expectBackupError(createBackup(athleteId, { deviceId, checksum: good.checksum, payloadJson: good.payloadJson.replace("s0", "s9") }), "checksum_mismatch");
  await expectBackupError(createBackup(athleteId, { deviceId, ...upload("someone_else", 1) }), "foreign_account");
  await expectBackupError(createBackup(athleteId, { deviceId, ...upload(athleteId, 1, { formatVersion: 7 }) }), "unsupported_format");
});

test("backup: seven copies with Plus; after Plus only the newest stays, free to restore", async () => {
  const athleteId = await seedAthlete();
  await setBackupEnabled(athleteId, true);
  await grantPlus(athleteId);
  const deviceId = `device_${athleteId}`;
  for (let i = 0; i < 9; i++) await createBackup(athleteId, { deviceId, ...upload(athleteId, 10) });
  let rows = await db.select({ revision: personalBackups.revision }).from(personalBackups).where(eq(personalBackups.userId, athleteId));
  assert.deepEqual(rows.map(row => row.revision).sort((a, b) => a - b), [3, 4, 5, 6, 7, 8, 9]);

  // Plus ends: no new copies, older versions pruned once the newest verifies.
  await grantPlus(athleteId, Date.now() - DAY);
  await expectBackupError(createBackup(athleteId, { deviceId, ...upload(athleteId, 10) }), "subscription_required");
  const status = await getBackupStatus(athleteId);
  assert.equal(status.entitled, false);
  assert.equal(status.versions, 1);
  rows = await db.select({ revision: personalBackups.revision }).from(personalBackups).where(eq(personalBackups.userId, athleteId));
  assert.deepEqual(rows.map(row => row.revision), [9]);
  assert.equal((await getBackupSnapshot(athleteId)).revision, 9);
});

test("backup: a corrupt stored copy is reported, never served", async () => {
  const athleteId = await seedAthlete();
  await setBackupEnabled(athleteId, true);
  await grantPlus(athleteId);
  await createBackup(athleteId, { deviceId: `device_${athleteId}`, ...upload(athleteId, 1) });
  await db.update(personalBackups).set({ checksum: "0".repeat(64) }).where(eq(personalBackups.userId, athleteId));
  await expectBackupError(getBackupSnapshot(athleteId), "backup_corrupt");
});

test("backup: deleting copies withdraws consent; export lists copies without payloads", async () => {
  const athleteId = await seedAthlete();
  await setBackupEnabled(athleteId, true);
  await grantPlus(athleteId);
  await createBackup(athleteId, { deviceId: `device_${athleteId}`, ...upload(athleteId, 4) });

  const exported = await exportAccountData(athleteId);
  assert.equal(exported?.personalBackup.copies.length, 1);
  assert.equal(JSON.stringify(exported).includes("payloadJson"), false);
  assert.equal(exported?.personalBackup.settings?.enabled, true);

  assert.equal(await deleteBackups(athleteId), 1);
  const status = await getBackupStatus(athleteId);
  assert.equal(status.settings.enabled, false);
  assert.equal(status.latest, null);
});

test("backup: nothing new is stored while the account deletion is pending", async () => {
  const athleteId = await seedAthlete();
  await setBackupEnabled(athleteId, true);
  await grantPlus(athleteId);
  await requestAccountDeletion(athleteId);
  await expectBackupError(createBackup(athleteId, { deviceId: `device_${athleteId}`, ...upload(athleteId, 1) }), "account_deletion_pending");
});
