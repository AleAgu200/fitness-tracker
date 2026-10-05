// Multi-device sync (PULSO Plus): every device pushes what it changed and
// pulls what the others changed; per record the most recent change wins.
// Runs when the app opens, returns to the foreground or goes to the
// background, and on "Sincronizar ahora". Works offline: changes wait here.

import {
  applyRemoteRecords,
  backfillChanges,
  clearPushed,
  countPendingChanges,
  getDeviceSyncState,
  pendingChangesFor,
  saveDeviceSyncState,
} from '@/db/device-sync';
import { ensureSyncState } from '@/db/sync';
import { ApiError, apiFetch } from './api';
import { recordStep, reportHandledError } from './crash-reporting';
import type { RemoteRecord } from './device-sync-model';

export interface DeviceSyncStatus {
  enabled: boolean;
  consentedAt: number | null;
  entitled: boolean;
  active: boolean;
  records: number;
}

export function getDeviceSyncStatus(): Promise<DeviceSyncStatus> {
  return apiFetch<DeviceSyncStatus>('/api/records/status');
}

/**
 * Turns sync on for the account (consent) and makes this phone start: what it
 * already has is queued once, then a first sync runs. Off deletes the server
 * copy; every phone keeps its own data.
 */
export async function setDeviceSync(userId: string, enabled: boolean): Promise<SyncOutcome> {
  await apiFetch('/api/records/settings', { method: 'PUT', body: { enabled } });
  if (!enabled) {
    await saveDeviceSyncState(userId, { enabled: false, cursor: 0, lastError: null });
    return { status: 'off' };
  }
  await startOnThisDevice(userId);
  return syncDevices(userId);
}

async function startOnThisDevice(userId: string): Promise<void> {
  const state = await getDeviceSyncState(userId);
  if (state?.enabled && state.backfilledAt) return;
  if (!state?.backfilledAt) await backfillChanges(userId);
  await saveDeviceSyncState(userId, { enabled: true, backfilledAt: new Date() });
}

export type SyncOutcome =
  | { status: 'synced'; pushed: number; pulled: number; applied: number }
  | { status: 'off' }
  | { status: 'plus_required' }
  | { status: 'offline' }
  | { status: 'failed'; code: string };

interface PullResponse {
  records: RemoteRecord[];
  nextCursor: number;
  hasMore: boolean;
}

interface PushResponse {
  results: { id: string; table: string; status: 'accepted' | 'superseded' | 'rejected'; error?: string }[];
}

const flights = new Map<string, Promise<SyncOutcome>>();
/** Checked once per app run for a phone that hasn't synced yet. */
const discovered = new Set<string>();

/**
 * One full round: push pending changes, pull everything new, apply it, then
 * push whatever the merge produced. The cursor moves only after a pull is
 * applied, so an interruption repeats work instead of losing it.
 */
export function syncDevices(userId: string): Promise<SyncOutcome> {
  const active = flights.get(userId);
  if (active) return active;
  const flight = run(userId).finally(() => flights.delete(userId));
  flights.set(userId, flight);
  return flight;
}

async function run(userId: string): Promise<SyncOutcome> {
  let state = await getDeviceSyncState(userId);
  if (!state?.enabled) {
    // A new phone for an account that already syncs joins on its own.
    if (discovered.has(userId)) return { status: 'off' };
    discovered.add(userId);
    const status = await getDeviceSyncStatus().catch(() => null);
    if (!status?.active) return { status: 'off' };
    await startOnThisDevice(userId);
    state = await getDeviceSyncState(userId);
  }
  const { deviceId } = await ensureSyncState(userId);
  try {
    let pushed = await pushAll(userId, deviceId);
    let cursor = state?.cursor ?? 0;
    const records: RemoteRecord[] = [];
    for (let page = 0; page < 200; page++) {
      const response = await apiFetch<PullResponse>(`/api/records?cursor=${cursor}&limit=500`);
      records.push(...response.records);
      cursor = response.nextCursor;
      if (!response.hasMore) break;
    }
    const applied = await applyRemoteRecords(userId, records, deviceId);
    await saveDeviceSyncState(userId, { cursor, lastSyncAt: new Date(), lastError: null });
    // A merge (two rows for the same day, same exercise name) leaves changes to share.
    pushed += await pushAll(userId, deviceId);
    if (applied.applied) recordStep('device_sync', 'applied');
    return { status: 'synced', pushed, pulled: records.length, applied: applied.applied };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 402) {
        await saveDeviceSyncState(userId, { lastError: 'plus_required' });
        return { status: 'plus_required' };
      }
      if (error.status === 403 && error.code === 'sync_disabled') {
        await saveDeviceSyncState(userId, { enabled: false, cursor: 0, lastError: null });
        return { status: 'off' };
      }
      const code = error.code ?? `http_${error.status}`;
      await saveDeviceSyncState(userId, { lastError: code });
      reportHandledError('device_sync', code);
      return { status: 'failed', code };
    }
    await saveDeviceSyncState(userId, { lastError: 'network_unavailable' });
    return { status: 'offline' };
  }
}

async function pushAll(userId: string, deviceId: string): Promise<number> {
  let pushed = 0;
  for (let round = 0; round < 50; round++) {
    const { changes } = await pendingChangesFor(userId, 200);
    if (!changes.length) break;
    const { results } = await apiFetch<PushResponse>('/api/records', { method: 'POST', body: { deviceId, changes } });
    const rejected = results.filter(result => result.status === 'rejected');
    for (const result of rejected) reportHandledError('device_sync', `rejected_${result.error ?? 'unknown'}`);
    // Accepted, superseded (a newer change won and will be pulled) or rejected for good: done either way.
    await clearPushed(changes.map(change => ({ table: change.table, id: change.id, changedAt: change.changedAt })));
    pushed += changes.length;
    if (changes.length < 200) break;
  }
  return pushed;
}

export async function localSyncSummary(userId: string) {
  const [state, pending] = await Promise.all([getDeviceSyncState(userId), countPendingChanges()]);
  return { enabled: state?.enabled ?? false, lastSyncAt: state?.lastSyncAt ?? null, lastError: state?.lastError ?? null, pending };
}
