import { and, asc, count, eq, gt, sql } from "drizzle-orm";

import { db } from "@/db";
import { athleteRecords, personalBackupSettings } from "@/db/schema";
import { getPendingDeletion } from "@/lib/account";
import {
  type ChangeError,
  type IncomingChange,
  MAX_CHANGES_PER_PUSH,
  MAX_PULL_LIMIT,
  validateChange,
} from "@/lib/device-sync-policy";
import { getEntitlement } from "@/lib/entitlements";

/**
 * Multi-device sync (PULSO Plus, with its own consent). Each device pushes
 * the records it changed and pulls everyone else's; per record the most
 * recent change wins. Without Plus, sync pauses and the stored copy is kept
 * until it returns; turning sync off deletes the stored copy (the phones keep
 * their data).
 */

export class DeviceSyncError extends Error {
  constructor(public readonly code: "sync_disabled" | "subscription_required" | "account_deletion_pending" | "too_many_changes") {
    super(code);
  }
}

export interface DeviceSyncStatus {
  enabled: boolean;
  consentedAt: number | null;
  entitled: boolean;
  /** Sync runs only with both. */
  active: boolean;
  records: number;
}

async function settingsOf(userId: string) {
  const [row] = await db.select({ syncEnabled: personalBackupSettings.syncEnabled, syncConsentedAt: personalBackupSettings.syncConsentedAt })
    .from(personalBackupSettings).where(eq(personalBackupSettings.userId, userId));
  return row ?? { syncEnabled: false, syncConsentedAt: null };
}

export async function getDeviceSyncStatus(userId: string): Promise<DeviceSyncStatus> {
  const [settings, entitlement, [{ value }]] = await Promise.all([
    settingsOf(userId),
    getEntitlement(userId),
    db.select({ value: count() }).from(athleteRecords).where(and(eq(athleteRecords.athleteId, userId), eq(athleteRecords.deleted, false))),
  ]);
  return {
    enabled: settings.syncEnabled,
    consentedAt: settings.syncConsentedAt,
    entitled: entitlement.entitled,
    active: settings.syncEnabled && entitlement.entitled,
    records: Number(value),
  };
}

/** Whether this athlete's devices may all write (sync on and Plus). Used by the writer-device rule. */
export async function multiDeviceSyncActive(userId: string): Promise<boolean> {
  const [settings, entitlement] = await Promise.all([settingsOf(userId), getEntitlement(userId)]);
  return settings.syncEnabled && entitlement.entitled;
}

/** Consent on; off also deletes the synced copy on the server. */
export async function setDeviceSyncEnabled(userId: string, enabled: boolean, now = Date.now()): Promise<DeviceSyncStatus> {
  const values = enabled ? { syncEnabled: true, syncConsentedAt: now, updatedAt: now } : { syncEnabled: false, updatedAt: now };
  await db.insert(personalBackupSettings).values({ userId, enabled: false, ...values })
    .onConflictDoUpdate({ target: personalBackupSettings.userId, set: values });
  if (!enabled) await db.delete(athleteRecords).where(eq(athleteRecords.athleteId, userId));
  return getDeviceSyncStatus(userId);
}

async function requireActive(userId: string): Promise<void> {
  if (await getPendingDeletion(userId)) throw new DeviceSyncError("account_deletion_pending");
  const [settings, entitlement] = await Promise.all([settingsOf(userId), getEntitlement(userId)]);
  if (!settings.syncEnabled) throw new DeviceSyncError("sync_disabled");
  if (!entitlement.entitled) throw new DeviceSyncError("subscription_required");
}

export interface PushResult {
  id: string;
  table: string;
  /** accepted: stored as the latest; superseded: a newer change already won; rejected: invalid. */
  status: "accepted" | "superseded" | "rejected";
  error?: ChangeError;
}

/** Stores each change unless a newer one for the same record already won. */
export async function pushRecords(userId: string, deviceId: string, changes: IncomingChange[], now = Date.now()): Promise<PushResult[]> {
  if (changes.length > MAX_CHANGES_PER_PUSH) throw new DeviceSyncError("too_many_changes");
  await requireActive(userId);
  const results: PushResult[] = [];
  for (const change of changes) {
    const error = validateChange(change, userId, now);
    if (error) {
      results.push({ id: String(change.id), table: String(change.table), status: "rejected", error });
      continue;
    }
    const deleted = change.op === "delete";
    const written = await db.insert(athleteRecords).values({
      athleteId: userId,
      tableName: change.table,
      recordId: change.id,
      payload: deleted ? null : change.payload,
      deleted,
      changedAt: Math.round(change.changedAt),
      deviceId,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [athleteRecords.athleteId, athleteRecords.tableName, athleteRecords.recordId],
      set: {
        payload: deleted ? null : change.payload,
        deleted,
        changedAt: Math.round(change.changedAt),
        deviceId,
        updatedAt: now,
        seq: sql`nextval('athlete_records_seq')`,
      },
      // Same rule as incomingWins(): later change, or the same instant from a "larger" device.
      setWhere: sql`${athleteRecords.changedAt} < excluded."changedAt"
        or (${athleteRecords.changedAt} = excluded."changedAt" and ${athleteRecords.deviceId} < excluded."deviceId")`,
    }).returning({ recordId: athleteRecords.recordId });
    results.push({ id: change.id, table: change.table, status: written.length ? "accepted" : "superseded" });
  }
  return results;
}

export interface PulledRecord {
  table: string;
  id: string;
  deleted: boolean;
  payload: unknown;
  changedAt: number;
  deviceId: string;
  seq: number;
}

/** Changes after `cursor`, oldest first. */
export async function pullRecords(userId: string, cursor: number, limit = 500): Promise<{ records: PulledRecord[]; nextCursor: number; hasMore: boolean }> {
  await requireActive(userId);
  const size = Math.max(1, Math.min(limit, MAX_PULL_LIMIT));
  const rows = await db.select().from(athleteRecords)
    .where(and(eq(athleteRecords.athleteId, userId), gt(athleteRecords.seq, cursor)))
    .orderBy(asc(athleteRecords.seq))
    .limit(size + 1);
  const page = rows.slice(0, size);
  return {
    records: page.map(row => ({
      table: row.tableName,
      id: row.recordId,
      deleted: row.deleted,
      payload: row.payload,
      changedAt: row.changedAt,
      deviceId: row.deviceId,
      seq: row.seq,
    })),
    nextCursor: page.length ? page[page.length - 1].seq : cursor,
    hasMore: rows.length > size,
  };
}
