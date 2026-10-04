import { randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

import { and, desc, eq, inArray, max } from "drizzle-orm";

import { db } from "@/db";
import { personalBackups, personalBackupSettings } from "@/db/schema";
import { getPendingDeletion } from "@/lib/account";
import {
  type BackupManifest,
  sha256Hex,
  shrinkNeedsConfirmation,
  type UploadError,
  validateBackupUpload,
  versionsToPrune,
} from "@/lib/backup-policy";
import { getEntitlement } from "@/lib/entitlements";
import { CURRENT_SYNC_SCHEMA_VERSION } from "@/lib/sync-contract";
import { ensureWriterDevice } from "@/lib/sync";

/**
 * Personal backup (master plan M6): owner-only copies of the phone's data,
 * independent of anything shared with professionals.
 *
 * - Creating copies needs the athlete's consent and PULSO Plus.
 * - Reading, restoring and exporting an existing copy is always free, also
 *   after Plus ends; the newest verified copy is then kept, frozen.
 * - Only the phone registered as writer may upload, so a second phone (or a
 *   half-restored one) can never replace a full copy behind the athlete's back.
 */

export interface BackupSettings {
  enabled: boolean;
  consentedAt: number | null;
  disabledAt: number | null;
}

export interface BackupMeta {
  revision: number;
  formatVersion: number;
  createdAt: number;
  sizeBytes: number;
  manifest: BackupManifest;
}

export interface BackupStatus {
  settings: BackupSettings;
  /** Whether new copies may be created now (Plus + consent). */
  canCreate: boolean;
  entitled: boolean;
  latest: BackupMeta | null;
  versions: number;
}

export class BackupError extends Error {
  constructor(public readonly code:
    | UploadError
    | "backup_disabled"
    | "subscription_required"
    | "account_deletion_pending"
    | "shrink_requires_confirmation"
    | "backup_not_found"
    | "backup_corrupt",
  ) {
    super(code);
  }
}

const NO_SETTINGS: BackupSettings = { enabled: false, consentedAt: null, disabledAt: null };

export async function getBackupSettings(userId: string): Promise<BackupSettings> {
  const [row] = await db.select().from(personalBackupSettings).where(eq(personalBackupSettings.userId, userId));
  return row ? { enabled: row.enabled, consentedAt: row.consentedAt, disabledAt: row.disabledAt } : NO_SETTINGS;
}

/** Records the athlete's backup consent (or its withdrawal). Never touches sharing with professionals. */
export async function setBackupEnabled(userId: string, enabled: boolean, now = Date.now()): Promise<BackupSettings> {
  const values = enabled
    ? { enabled: true, consentedAt: now, disabledAt: null, updatedAt: now }
    : { enabled: false, disabledAt: now, updatedAt: now };
  await db.insert(personalBackupSettings).values({ userId, ...values })
    .onConflictDoUpdate({ target: personalBackupSettings.userId, set: values });
  return getBackupSettings(userId);
}

function metaOf(row: { revision: number; formatVersion: number; createdAt: number; sizeBytes: number; manifest: unknown }): BackupMeta {
  return {
    revision: row.revision,
    formatVersion: row.formatVersion,
    createdAt: row.createdAt,
    sizeBytes: row.sizeBytes,
    manifest: row.manifest as BackupManifest,
  };
}

const META_COLUMNS = {
  id: personalBackups.id,
  revision: personalBackups.revision,
  formatVersion: personalBackups.formatVersion,
  createdAt: personalBackups.createdAt,
  sizeBytes: personalBackups.sizeBytes,
  manifest: personalBackups.manifest,
};

async function listMeta(userId: string) {
  return db.select(META_COLUMNS).from(personalBackups)
    .where(eq(personalBackups.userId, userId))
    .orderBy(desc(personalBackups.revision));
}

/** Decompresses a stored copy and checks it against its checksum. */
function readVerified(row: { payload: Buffer; checksum: string }): string | null {
  try {
    const json = gunzipSync(row.payload).toString("utf8");
    return sha256Hex(json) === row.checksum ? json : null;
  } catch {
    return null;
  }
}

async function newestVerified(userId: string): Promise<boolean> {
  const [row] = await db.select({ payload: personalBackups.payload, checksum: personalBackups.checksum })
    .from(personalBackups).where(eq(personalBackups.userId, userId))
    .orderBy(desc(personalBackups.revision)).limit(1);
  return row ? readVerified(row) != null : false;
}

async function prune(userId: string, entitled: boolean): Promise<void> {
  const rows = await listMeta(userId);
  const keepAll = entitled ? rows.length <= 7 : rows.length <= 1;
  if (keepAll) return;
  const ids = versionsToPrune(rows, entitled, entitled ? true : await newestVerified(userId));
  if (ids.length) await db.delete(personalBackups).where(and(eq(personalBackups.userId, userId), inArray(personalBackups.id, ids)));
}

export async function getBackupStatus(userId: string): Promise<BackupStatus> {
  const [settings, entitlement] = await Promise.all([getBackupSettings(userId), getEntitlement(userId)]);
  // When Plus has ended, older copies are pruned once the newest one verifies.
  await prune(userId, entitlement.entitled);
  const rows = await listMeta(userId);
  return {
    settings,
    entitled: entitlement.entitled,
    canCreate: settings.enabled && entitlement.entitled,
    latest: rows[0] ? metaOf(rows[0]) : null,
    versions: rows.length,
  };
}

/**
 * Stores a new complete copy as the next revision. The phone must be the
 * account's writer; a copy much smaller than the latest needs `confirmShrink`.
 */
export async function createBackup(userId: string, input: {
  deviceId: string;
  checksum: string;
  payloadJson: string;
  confirmShrink?: boolean;
}, now = Date.now()): Promise<BackupMeta> {
  if (await getPendingDeletion(userId)) throw new BackupError("account_deletion_pending");
  const [settings, entitlement] = await Promise.all([getBackupSettings(userId), getEntitlement(userId)]);
  if (!settings.enabled) throw new BackupError("backup_disabled");
  if (!entitlement.entitled) throw new BackupError("subscription_required");

  const validated = validateBackupUpload({ ownerId: userId, checksum: input.checksum, payloadJson: input.payloadJson });
  if (!validated.ok) throw new BackupError(validated.error);

  // Throws WriterDeviceConflictError when another phone is the writer.
  await ensureWriterDevice(userId, input.deviceId, CURRENT_SYNC_SCHEMA_VERSION);

  const [previous] = await listMeta(userId);
  if (!input.confirmShrink && shrinkNeedsConfirmation(previous ? previous.manifest as BackupManifest : null, validated.manifest)) {
    throw new BackupError("shrink_requires_confirmation");
  }

  const payload = gzipSync(Buffer.from(input.payloadJson, "utf8"));
  const row = await db.transaction(async (tx) => {
    const [{ value }] = await tx.select({ value: max(personalBackups.revision) }).from(personalBackups)
      .where(eq(personalBackups.userId, userId));
    const revision = (value ?? 0) + 1;
    const [inserted] = await tx.insert(personalBackups).values({
      id: `backup_${randomBytes(12).toString("hex")}`,
      userId,
      revision,
      formatVersion: validated.parsed.formatVersion,
      deviceId: input.deviceId,
      checksum: input.checksum.toLowerCase(),
      sizeBytes: validated.sizeBytes,
      manifest: validated.manifest,
      bootstrap: validated.parsed.bootstrap,
      payload,
      createdAt: now,
    }).returning(META_COLUMNS);
    return inserted;
  });
  await prune(userId, true);
  return metaOf(row);
}

/** Profile, onboarding and active-plan references of the newest copy: enough to route before the full restore. */
export async function getBackupBootstrap(userId: string): Promise<(BackupMeta & { bootstrap: unknown }) | null> {
  const [row] = await db.select({ ...META_COLUMNS, bootstrap: personalBackups.bootstrap }).from(personalBackups)
    .where(eq(personalBackups.userId, userId))
    .orderBy(desc(personalBackups.revision)).limit(1);
  return row ? { ...metaOf(row), bootstrap: row.bootstrap } : null;
}

/** The full copy of a revision (newest by default), verified before it is served. */
export async function getBackupSnapshot(userId: string, revision?: number): Promise<BackupMeta & { checksum: string; payloadJson: string }> {
  const condition = revision != null
    ? and(eq(personalBackups.userId, userId), eq(personalBackups.revision, revision))
    : eq(personalBackups.userId, userId);
  const [row] = await db.select({ ...META_COLUMNS, payload: personalBackups.payload, checksum: personalBackups.checksum })
    .from(personalBackups).where(condition)
    .orderBy(desc(personalBackups.revision)).limit(1);
  if (!row) throw new BackupError("backup_not_found");
  const payloadJson = readVerified(row);
  if (payloadJson == null) throw new BackupError("backup_corrupt");
  return { ...metaOf(row), checksum: row.checksum, payloadJson };
}

/** Deletes every copy and withdraws consent. The phone's own data is untouched. */
export async function deleteBackups(userId: string, now = Date.now()): Promise<number> {
  const deleted = await db.delete(personalBackups).where(eq(personalBackups.userId, userId)).returning({ id: personalBackups.id });
  await setBackupEnabled(userId, false, now);
  return deleted.length;
}
