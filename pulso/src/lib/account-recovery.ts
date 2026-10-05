// Returning-athlete recovery (plan G1), run by the session routing gate
// before onboarding: a new phone discovers its personal backup and offers to
// restore it, instead of greeting a returning athlete as a new one.

import * as SecureStore from 'expo-secure-store';

import { hasLocalHistory } from '@/db/backup-data';
import { ApiError, apiFetch } from './api';
import { recordStep } from './crash-reporting';
import { BackupLookup, decideRecovery, RecoveryRoute } from './recovery-decision';

const settledKey = (userId: string) => `pulso_recovery_settled_${userId}`;

/** Recovery finished (restored, nothing to restore, or explicitly declined) on this phone. */
export async function isRecoverySettled(userId: string): Promise<boolean> {
  return (await SecureStore.getItemAsync(settledKey(userId)).catch(() => null)) === '1';
}

export async function markRecoverySettled(userId: string): Promise<void> {
  await SecureStore.setItemAsync(settledKey(userId), '1').catch(() => {});
}

/** Forgets the recovery state (account deletion, so a new account starts clean). */
export async function clearRecoveryState(userId: string): Promise<void> {
  await SecureStore.deleteItemAsync(settledKey(userId)).catch(() => {});
}

interface BootstrapResponse {
  backup: null | { revision: number; createdAt: number; manifest: { totalRows: number } };
}

async function lookupSync(): Promise<{ active: boolean; records: number } | null> {
  try {
    const status = await apiFetch<{ active: boolean; records: number }>('/api/records/status');
    return { active: status.active, records: status.records };
  } catch {
    return null;
  }
}

async function lookupBackup(): Promise<BackupLookup> {
  try {
    const { backup } = await apiFetch<BootstrapResponse>('/api/backup/bootstrap');
    if (!backup) return { status: 'absent' };
    return { status: 'found', revision: backup.revision, createdAt: backup.createdAt, totalRows: backup.manifest?.totalRows ?? 0 };
  } catch (error) {
    // A server without backups at all (older deploy) has nothing to restore.
    if (error instanceof ApiError && error.status === 404) return { status: 'absent' };
    return { status: 'unavailable' };
  }
}

/** Decides where a signed-in athlete goes before onboarding. Network only on an unsettled phone. */
export async function routeRecovery(userId: string): Promise<RecoveryRoute> {
  const [settled, localHistory] = await Promise.all([isRecoverySettled(userId), hasLocalHistory(userId)]);
  const [lookup, sync] = settled || localHistory ? [null, null] : await Promise.all([lookupBackup(), lookupSync()]);
  const route = decideRecovery({ settled, localHistory, lookup, sync });
  if (route.kind === 'continue' && route.settle) await markRecoverySettled(userId);
  if (route.kind !== 'continue') recordStep('recovery', route.kind);
  return route;
}
