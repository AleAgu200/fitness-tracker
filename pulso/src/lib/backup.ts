// Personal backup (master plan M6) from the phone's side: build a verified
// snapshot, upload it under the athlete's consent and Plus, and restore one —
// always free — into this phone without replacing newer local data.

import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { applySnapshotTables, collectBackupTables, countExisting, currentActivePlans, listLocalExercises } from '@/db/backup-data';
import { ensureSyncState } from '@/db/sync';
import { ApiError, apiFetch } from './api';
import {
  BACKUP_EXCLUSIONS,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BackupSettings,
  buildBootstrap,
  MAX_IMPORT_BYTES,
  remapExercises,
  Snapshot,
  SnapshotProblem,
  SnapshotTables,
  summarizeTables,
  tablesFromExport,
  validateSnapshot,
  validateTables,
} from './backup-format';
import { recordStep, reportHandledError } from './crash-reporting';
import {
  loadAccentColor,
  loadThemeMode,
  loadWeightUnit,
  setAccentColor,
  setThemeMode,
  setWeightUnit,
} from './settings';

export interface BackupManifest {
  counts: Record<string, number>;
  totalRows: number;
  excluded: { area: string; reason: string }[];
  createdAt: number;
}

export interface BackupMeta {
  revision: number;
  formatVersion: number;
  createdAt: number;
  sizeBytes: number;
  manifest: BackupManifest;
}

export interface BackupStatus {
  settings: { enabled: boolean; consentedAt: number | null; disabledAt: number | null };
  canCreate: boolean;
  entitled: boolean;
  latest: BackupMeta | null;
  versions: number;
}

export function getBackupStatus(): Promise<BackupStatus> {
  return apiFetch<BackupStatus>('/api/backup');
}

export async function setBackupEnabled(enabled: boolean): Promise<void> {
  await apiFetch('/api/backup/settings', { method: 'PUT', body: { enabled } });
}

export async function deleteAllBackups(): Promise<void> {
  await apiFetch('/api/backup', { method: 'DELETE' });
}

/** This phone becomes the one that records; the previous phone stops syncing. */
export async function claimThisPhone(userId: string): Promise<void> {
  const state = await ensureSyncState(userId);
  await apiFetch('/api/sync/writer', { method: 'POST', body: { deviceId: state.deviceId } });
}

function sha256(text: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
}

const lastBackupKey = (userId: string) => `pulso_backup_last_${userId}`;

export async function getLastBackupAt(userId: string): Promise<number | null> {
  const value = await SecureStore.getItemAsync(lastBackupKey(userId)).catch(() => null);
  return value ? Number(value) || null : null;
}

async function buildSnapshot(userId: string): Promise<Snapshot> {
  const [tables, weightUnit, accentColor, themeMode] = await Promise.all([
    collectBackupTables(userId),
    loadWeightUnit(),
    loadAccentColor(),
    loadThemeMode(),
  ]);
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    owner: userId,
    createdAt: Date.now(),
    appVersion: Constants.expoConfig?.version ?? null,
    bootstrap: buildBootstrap(tables),
    settings: { weightUnit, accentColor, themeMode },
    tables,
    excluded: BACKUP_EXCLUSIONS,
  };
}

export type UploadOutcome =
  | { status: 'saved'; backup: BackupMeta }
  | { status: 'needs_confirmation' }
  | { status: 'other_phone' }
  | { status: 'not_allowed'; reason: 'disabled' | 'plus_required' | 'deletion_pending' }
  | { status: 'failed'; code: string };

/**
 * Uploads a complete copy. The server refuses a copy much smaller than the
 * latest unless `confirmShrink`: a half-restored phone never silently
 * replaces a full copy.
 */
export async function uploadBackup(userId: string, options: { confirmShrink?: boolean } = {}): Promise<UploadOutcome> {
  try {
    const [snapshot, state] = await Promise.all([buildSnapshot(userId), ensureSyncState(userId)]);
    const payloadJson = JSON.stringify(snapshot);
    const checksum = await sha256(payloadJson);
    const { backup } = await apiFetch<{ backup: BackupMeta }>('/api/backup', {
      method: 'POST',
      body: { deviceId: state.deviceId, checksum, payloadJson, ...(options.confirmShrink ? { confirmShrink: true } : {}) },
    });
    await SecureStore.setItemAsync(lastBackupKey(userId), String(backup.createdAt)).catch(() => {});
    recordStep('backup', 'saved');
    return { status: 'saved', backup };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 412) return { status: 'needs_confirmation' };
      if (error.status === 409) return { status: 'other_phone' };
      if (error.status === 402) return { status: 'not_allowed', reason: 'plus_required' };
      if (error.status === 423) return { status: 'not_allowed', reason: 'deletion_pending' };
      if (error.code === 'backup_disabled') return { status: 'not_allowed', reason: 'disabled' };
      reportHandledError('backup', error.code ?? `http_${error.status}`);
      return { status: 'failed', code: error.code ?? `http_${error.status}` };
    }
    return { status: 'failed', code: 'network_unavailable' };
  }
}

const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const autoFlights = new Map<string, Promise<void>>();

/**
 * Daily copy when the app gets a chance to sync. Runs only on a phone whose
 * recovery is settled (see account-recovery), so a fresh install that has not
 * restored yet can never upload its empty database as the newest copy.
 */
export function maybeAutoBackup(userId: string, recoverySettled: () => Promise<boolean>): Promise<void> {
  const active = autoFlights.get(userId);
  if (active) return active;
  const flight = (async () => {
    if (!(await recoverySettled())) return;
    const last = await getLastBackupAt(userId);
    if (last && Date.now() - last < AUTO_BACKUP_INTERVAL_MS) return;
    const status = await getBackupStatus().catch(() => null);
    if (!status?.canCreate) return;
    if (status.latest && Date.now() - status.latest.createdAt < AUTO_BACKUP_INTERVAL_MS) {
      await SecureStore.setItemAsync(lastBackupKey(userId), String(status.latest.createdAt)).catch(() => {});
      return;
    }
    // A shrink is never confirmed automatically; the athlete sees it in Configuración.
    await uploadBackup(userId);
  })().catch(() => {}).finally(() => autoFlights.delete(userId));
  autoFlights.set(userId, flight);
  return flight;
}

// ── restore ─────────────────────────────────────────────────────────────────

export type RestoreStep = 'downloading' | 'verifying' | 'applying' | 'finishing';

export type RestoreOutcome =
  | { status: 'restored'; inserted: number; kept: number; settings: BackupSettings; summary: ReturnType<typeof summarizeTables> }
  | { status: 'not_found' }
  | { status: 'corrupt' }
  | { status: 'invalid'; problem: SnapshotProblem | 'checksum' }
  | { status: 'account_changed' }
  | { status: 'failed'; code: string };

async function persistSettings(settings: BackupSettings): Promise<void> {
  await Promise.all([
    settings.weightUnit ? setWeightUnit(settings.weightUnit) : null,
    settings.accentColor ? setAccentColor(settings.accentColor) : null,
    settings.themeMode ? setThemeMode(settings.themeMode) : null,
  ]);
}

/**
 * Downloads, verifies and applies a copy. Nothing is written until the
 * download matches its checksum and every row passes validation, and this
 * phone has been made the account's writer; the write itself is one
 * transaction. `stillCurrent` is checked right before writing
 * so a sign-out or account switch mid-download never restores into the
 * wrong account.
 */
export async function restoreBackup(userId: string, options: {
  revision?: number;
  stillCurrent: () => boolean;
  onStep?: (step: RestoreStep) => void;
}): Promise<RestoreOutcome> {
  try {
    options.onStep?.('downloading');
    const query = options.revision ? `?revision=${options.revision}` : '';
    const { backup } = await apiFetch<{ backup: BackupMeta & { checksum: string; payloadJson: string } }>(`/api/backup/snapshot${query}`);

    options.onStep?.('verifying');
    if ((await sha256(backup.payloadJson)) !== backup.checksum) {
      reportHandledError('recovery', 'snapshot_checksum_mismatch');
      return { status: 'invalid', problem: 'checksum' };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(backup.payloadJson);
    } catch {
      return { status: 'invalid', problem: 'not_a_backup' };
    }
    const validated = validateSnapshot(parsed, userId);
    if (!validated.ok) {
      reportHandledError('recovery', `snapshot_${validated.problem}`);
      return { status: 'invalid', problem: validated.problem };
    }
    const bootstrap = buildBootstrap(validated.tables);
    const { tables } = remapExercises(validated.tables, await listLocalExercises());

    if (!options.stillCurrent()) return { status: 'account_changed' };
    // This phone becomes the writer before anything is written; if that
    // fails, nothing changed here and the old phone keeps syncing.
    await claimThisPhone(userId);
    if (!options.stillCurrent()) return { status: 'account_changed' };
    options.onStep?.('applying');
    const applied = await applySnapshotTables(userId, tables, { programId: bootstrap.activeProgramId, mealPlanId: bootstrap.activeMealPlanId });

    options.onStep?.('finishing');
    const settings = validated.settings ?? {};
    await persistSettings(settings);
    recordStep('recovery', 'restored');
    return { status: 'restored', inserted: applied.totalInserted, kept: applied.kept, settings, summary: summarizeTables(validated.tables) };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404) return { status: 'not_found' };
      if (error.status === 410) return { status: 'corrupt' };
      reportHandledError('recovery', error.code ?? `http_${error.status}`);
      return { status: 'failed', code: error.code ?? `http_${error.status}` };
    }
    if (error instanceof TypeError) return { status: 'failed', code: 'network_unavailable' };
    reportHandledError('recovery', 'restore_failed', error);
    return { status: 'failed', code: 'restore_failed' };
  }
}

// ── JSON import ─────────────────────────────────────────────────────────────

export type ImportPreview =
  | {
    status: 'ready';
    tables: SnapshotTables;
    summary: ReturnType<typeof summarizeTables>;
    /** Rows the phone already has: an import never overwrites them. */
    alreadyHere: number;
    exportedAt: string | null;
  }
  | { status: 'invalid'; problem: SnapshotProblem | 'not_an_export' | 'unsupported_version' | 'too_large' | 'unreadable' };

/** Reads an export file's text and checks it fully before showing what it adds. */
export async function previewImport(userId: string, text: string): Promise<ImportPreview> {
  if (text.length > MAX_IMPORT_BYTES) return { status: 'invalid', problem: 'too_large' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { status: 'invalid', problem: 'unreadable' };
  }
  const converted = tablesFromExport(raw);
  if (!converted.ok) return { status: 'invalid', problem: converted.problem };
  const validated = validateTables(converted.tables, userId);
  if (!validated.ok) return { status: 'invalid', problem: validated.problem };
  const { tables } = remapExercises(validated.tables, await listLocalExercises());
  const exportedAt = (raw as { exportedAt?: unknown }).exportedAt;
  return {
    status: 'ready',
    tables,
    summary: summarizeTables(validated.tables),
    alreadyHere: await countExisting(tables),
    exportedAt: typeof exportedAt === 'string' ? exportedAt : null,
  };
}

/**
 * Applies a previewed import. Only the athlete's own personal data enters;
 * nothing is sent to a professional, and it reaches the cloud copy only under
 * the current backup consent.
 */
export async function applyImport(userId: string, tables: SnapshotTables): Promise<{ inserted: number; kept: number }> {
  const bootstrap = buildBootstrap(tables);
  // An import adds history; it keeps the plans this phone uses now, and only
  // takes the file's when the phone has none.
  const current = await currentActivePlans(userId);
  const applied = await applySnapshotTables(userId, tables, {
    programId: current.programId ?? bootstrap.activeProgramId,
    mealPlanId: current.mealPlanId ?? bootstrap.activeMealPlanId,
  });
  recordStep('import', bootstrap.profile ? 'applied_with_profile' : 'applied');
  return { inserted: applied.totalInserted, kept: applied.kept };
}
