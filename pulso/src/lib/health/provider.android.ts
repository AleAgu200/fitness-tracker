import {
  aggregateRecord,
  deleteRecordsByUuids,
  getChanges,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  insertRecords,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

import type { HealthMetric } from '@/db/schema';
import { healthConnectStage, heartRateBpm, weightKg, type WorkoutExport } from './model';
import type { Availability, ChangeBatch, DayWindow, HealthProviderAdapter, ImportedRecord, ImportMetric } from './types';

// Health Connect (Android). Requires the app to be built with the
// react-native-health-connect config plugin and minSdk 26.

const RECORD_TYPE = {
  steps: 'Steps',
  weight: 'Weight',
  heart_rate: 'HeartRate',
  sleep: 'SleepSession',
} as const;

/** ExerciseType.STRENGTH_TRAINING */
const STRENGTH_TRAINING = 70;

let initialized: Promise<boolean> | null = null;
function ready(): Promise<boolean> {
  initialized ??= initialize().catch(() => {
    initialized = null;
    return false;
  });
  return initialized;
}

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (value: string) => Date.parse(value);

type AnyRecord = {
  recordType?: string;
  metadata?: { id?: string; dataOrigin?: string; lastModifiedTime?: string; clientRecordId?: string };
  time?: string;
  startTime?: string;
  endTime?: string;
  zoneOffset?: { totalSeconds: number };
  startZoneOffset?: { totalSeconds: number };
  endZoneOffset?: { totalSeconds: number };
  weight?: { inKilograms?: number };
  samples?: { time: string; beatsPerMinute: number }[];
  stages?: { startTime: string; endTime: string; stage: number }[];
};

function offsetMin(offset?: { totalSeconds: number }): number | null {
  return offset ? Math.round(offset.totalSeconds / 60) : null;
}

/** Rows for one Health Connect record (a record with samples or stages becomes several). */
function toImported(metric: ImportMetric, record: AnyRecord): ImportedRecord[] {
  const groupId = record.metadata?.id;
  if (!groupId) return [];
  const base = {
    metric,
    groupId,
    sourceApp: record.metadata?.dataOrigin ?? null,
    version: record.metadata?.lastModifiedTime ?? null,
  };
  if (metric === 'weight' && record.time) {
    const kg = weightKg(record.weight?.inKilograms ?? NaN, 'kilograms');
    if (kg == null) return [];
    const at = ms(record.time);
    return [{ ...base, externalId: groupId, start: at, end: at, tzOffsetMin: offsetMin(record.zoneOffset), value: kg, stage: null }];
  }
  if (metric === 'heart_rate') {
    const tz = offsetMin(record.startZoneOffset);
    return (record.samples ?? []).flatMap((sample, index) => {
      const bpm = heartRateBpm(sample.beatsPerMinute);
      if (bpm == null) return [];
      const at = ms(sample.time);
      return [{ ...base, externalId: `${groupId}#${index}`, start: at, end: at, tzOffsetMin: tz, value: bpm, stage: null }];
    });
  }
  if (metric === 'sleep' && record.startTime && record.endTime) {
    const tz = offsetMin(record.endZoneOffset ?? record.startZoneOffset);
    const stages = record.stages?.length
      ? record.stages
      : [{ startTime: record.startTime, endTime: record.endTime, stage: 2 }];
    return stages.map((stage, index) => ({
      ...base,
      externalId: `${groupId}#${index}`,
      start: ms(stage.startTime),
      end: ms(stage.endTime),
      tzOffsetMin: tz,
      value: null,
      stage: healthConnectStage(stage.stage),
    }));
  }
  return [];
}

const METRIC_BY_TYPE: Record<string, ImportMetric> = { Weight: 'weight', HeartRate: 'heart_rate', SleepSession: 'sleep' };

export const healthProvider: HealthProviderAdapter = {
  id: 'health_connect',

  async availability(): Promise<Availability> {
    try {
      const status = await getSdkStatus();
      if (status === SdkAvailabilityStatus.SDK_AVAILABLE) return (await ready()) ? 'available' : 'unavailable';
      if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'update_required';
      return 'unavailable';
    } catch {
      return 'unavailable';
    }
  },

  async requestAccess(read, writeWorkouts) {
    await ready();
    const wanted = [
      ...read.map(metric => ({ accessType: 'read' as const, recordType: RECORD_TYPE[metric] })),
      ...(writeWorkouts ? [{ accessType: 'write' as const, recordType: 'ExerciseSession' as const }] : []),
    ];
    await requestPermission(wanted);
    const granted = (await getGrantedPermissions()) as { accessType: string; recordType: string }[];
    const has = (accessType: string, recordType: string) => granted.some(item => item.accessType === accessType && item.recordType === recordType);
    return {
      read: read.filter(metric => has('read', RECORD_TYPE[metric])) as HealthMetric[],
      readKnown: true,
      writeWorkouts: writeWorkouts && has('write', 'ExerciseSession'),
    };
  },

  async readChanges(metric, cursor, sinceMs): Promise<ChangeBatch> {
    await ready();
    const recordType = RECORD_TYPE[metric];
    if (cursor == null) {
      // Token first, so nothing written during the scan is missed (it is
      // seen again as a change and upserted idempotently).
      const { nextChangesToken } = await getChanges({ recordTypes: [recordType] });
      const upserts: ImportedRecord[] = [];
      let pageToken: string | undefined;
      do {
        const page = await readRecords(recordType, {
          timeRangeFilter: { operator: 'after', startTime: iso(sinceMs) },
          pageSize: 1000,
          pageToken,
        });
        for (const record of page.records as AnyRecord[]) upserts.push(...toImported(metric, record));
        pageToken = page.pageToken || undefined;
      } while (pageToken);
      return { kind: 'changes', upserts, deletedGroupIds: [], nextCursor: nextChangesToken, hasMore: false };
    }

    const changes = await getChanges({ changesToken: cursor });
    if (changes.changesTokenExpired) return { kind: 'expired' };
    const upserts: ImportedRecord[] = [];
    for (const { record } of changes.upsertionChanges) {
      const typed = record as AnyRecord;
      const recordMetric = typed.recordType ? METRIC_BY_TYPE[typed.recordType] : metric;
      if (recordMetric === metric) upserts.push(...toImported(metric, typed));
    }
    return {
      kind: 'changes',
      upserts,
      deletedGroupIds: changes.deletionChanges.map(change => change.recordId),
      nextCursor: changes.nextChangesToken,
      hasMore: changes.hasMore,
    };
  },

  async dailySteps(days: DayWindow[]) {
    await ready();
    const totals = new Map<string, number>();
    for (const day of days) {
      const result = await aggregateRecord({
        recordType: 'Steps',
        timeRangeFilter: { operator: 'between', startTime: iso(day.start), endTime: iso(day.end) },
      });
      // No contributing app means no data for that day, not zero steps.
      if (result.dataOrigins.length) totals.set(day.date, result.COUNT_TOTAL);
    }
    return totals;
  },

  async writeWorkout(workout: WorkoutExport, version: number) {
    await ready();
    const [id] = await insertRecords([{
      recordType: 'ExerciseSession',
      exerciseType: STRENGTH_TRAINING,
      title: workout.title,
      startTime: iso(workout.start),
      endTime: iso(workout.end),
      metadata: { clientRecordId: workout.clientRecordId, clientRecordVersion: version },
    }]);
    return id;
  },

  async deleteWorkout(externalId, clientRecordId) {
    await ready();
    await deleteRecordsByUuids('ExerciseSession', externalId ? [externalId] : [], [clientRecordId]);
  },

  openSettings() {
    openHealthConnectSettings();
  },
};
