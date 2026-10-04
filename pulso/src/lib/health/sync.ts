// Imports from Health Connect / Apple Health and exports completed workouts.
// Runs on connect, when the app opens or returns to the foreground, and on
// "Actualizar". Background delivery is a later enhancement, not a promise.

import Constants from 'expo-constants';

import type { HealthMetric } from '@/db/schema';
import {
  applyHealthBatch,
  clearCursor,
  deleteImportedData,
  getConnections,
  getCursor,
  markWorkoutExport,
  pendingWorkoutExports,
  queueWorkoutExport,
  recordImportResult,
  saveConnection,
  saveDailySteps,
} from '@/db/health';
import { reportHandledError } from '@/lib/crash-reporting';
import { addDays, dateStr, dayStart } from '@/lib/dates';
import { isOwnRecord, workoutExportFor } from './model';
import { healthProvider } from './provider';
import type { DayWindow, ImportMetric } from './types';

/** How far back the first import reads (and a rescan after an expired token). */
export const HISTORY_DAYS = 30;
const STEP_REFRESH_DAYS = 3;
const IMPORT_METRICS: ImportMetric[] = ['weight', 'heart_rate', 'sleep'];

/** Our own app IDs: what PULSO wrote never comes back in as an import. */
function ownApps(): string[] {
  const ids = [Constants.expoConfig?.android?.package, Constants.expoConfig?.ios?.bundleIdentifier];
  return ids.filter((id): id is string => typeof id === 'string');
}

export function healthAvailableOnThisPlatform(): boolean {
  return healthProvider != null;
}

export async function checkAvailability() {
  return healthProvider ? healthProvider.availability() : 'unavailable';
}

/**
 * Asks for the selected permissions and starts importing. Each permission is
 * optional: whatever is not granted keeps working by manual entry.
 */
export async function connectHealth(userId: string, read: HealthMetric[], writeWorkouts: boolean) {
  if (!healthProvider) return null;
  const granted = await healthProvider.requestAccess(read, writeWorkouts);
  await saveConnection(userId, healthProvider.id, { status: 'connected', readMetrics: granted.read, writeWorkouts: granted.writeWorkouts });
  await refreshHealth(userId);
  return granted;
}

/** Stops imports. With `deleteData`, also removes what was imported from this provider. */
export async function disconnectHealth(userId: string, deleteData: boolean): Promise<void> {
  if (!healthProvider) return;
  await saveConnection(userId, healthProvider.id, { status: 'disconnected' });
  if (deleteData) await deleteImportedData(userId, healthProvider.id);
}

function dayWindows(days: number, now = new Date()): DayWindow[] {
  const windows: DayWindow[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const day = dayStart(addDays(now, -offset));
    const next = dayStart(addDays(day, 1));
    windows.push({ date: dateStr(day), start: day.getTime(), end: Math.min(next.getTime(), now.getTime()) });
  }
  return windows;
}

async function importMetric(userId: string, metric: ImportMetric): Promise<void> {
  const provider = healthProvider!;
  const own = ownApps();
  const since = addDays(new Date(), -HISTORY_DAYS).getTime();
  let cursor = await getCursor(userId, provider.id, metric);
  let replaceFrom: number | undefined;
  // Bounded loop: a provider that keeps saying "more" cannot spin forever.
  for (let page = 0; page < 50; page++) {
    const batch = await provider.readChanges(metric, cursor, since);
    if (batch.kind === 'expired') {
      await clearCursor(userId, provider.id, metric);
      cursor = null;
      replaceFrom = since;
      continue;
    }
    const upserts = batch.upserts.filter(record => !isOwnRecord({ sourceApp: record.sourceApp }, own));
    await applyHealthBatch(userId, provider.id, metric, {
      upserts,
      deletedGroupIds: batch.deletedGroupIds,
      nextCursor: batch.nextCursor,
      replaceFrom,
    });
    replaceFrom = undefined;
    cursor = batch.nextCursor;
    if (!batch.hasMore) return;
  }
}

async function exportWorkouts(userId: string): Promise<void> {
  const provider = healthProvider!;
  for (const item of await pendingWorkoutExports(userId, provider.id)) {
    if (item.attempts >= 8) continue;
    try {
      if (item.status === 'delete_pending') {
        await provider.deleteWorkout(item.externalId, item.clientRecordId);
        await markWorkoutExport(item.id, { status: 'deleted' });
        continue;
      }
      const workout = item.session && workoutExportFor({
        id: item.session.id,
        status: item.session.status,
        startedAt: item.session.startedAt?.getTime() ?? null,
        finishedAt: item.session.finishedAt?.getTime() ?? null,
        title: item.session.title,
      });
      if (!workout) {
        await markWorkoutExport(item.id, { status: 'failed', error: 'not_exportable' });
        continue;
      }
      const externalId = await provider.writeWorkout(workout, item.version);
      await markWorkoutExport(item.id, { status: 'written', externalId });
    } catch {
      // Codes only: workout contents never reach a report.
      await markWorkoutExport(item.id, { status: 'failed', error: 'write_failed' });
    }
  }
}

const flights = new Map<string, Promise<void>>();

/** Imports what changed and writes pending workouts. Never throws; failures are recorded by code. */
export function refreshHealth(userId: string): Promise<void> {
  const active = flights.get(userId);
  if (active) return active;
  const flight = (async () => {
    const provider = healthProvider;
    if (!provider) return;
    const connection = (await getConnections(userId)).find(item => item.provider === provider.id);
    if (!connection || connection.status !== 'connected') return;
    if ((await provider.availability()) !== 'available') {
      await recordImportResult(userId, provider.id, 'provider_unavailable');
      return;
    }
    try {
      for (const metric of IMPORT_METRICS) {
        if (connection.readMetrics.includes(metric)) await importMetric(userId, metric);
      }
      if (connection.readMetrics.includes('steps')) {
        const firstImport = connection.lastImportAt == null;
        await saveDailySteps(userId, provider.id, await provider.dailySteps(dayWindows(firstImport ? HISTORY_DAYS : STEP_REFRESH_DAYS)));
      }
      if (connection.writeWorkouts) await exportWorkouts(userId);
      await recordImportResult(userId, provider.id, null);
    } catch (error) {
      reportHandledError('health', 'import_failed', error);
      await recordImportResult(userId, provider.id, 'import_failed');
    }
  })().catch(() => {}).finally(() => flights.delete(userId));
  flights.set(userId, flight);
  return flight;
}

/** Called when a session is completed: queues it for the connected provider and tries to write it. */
export async function onSessionCompleted(userId: string, sessionId: string): Promise<void> {
  if (!healthProvider) return;
  const connection = (await getConnections(userId)).find(item => item.provider === healthProvider!.id);
  if (!connection || connection.status !== 'connected' || !connection.writeWorkouts) return;
  await queueWorkoutExport(userId, healthProvider.id, sessionId);
  await refreshHealth(userId);
}
