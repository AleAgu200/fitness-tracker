import {
  authorizationStatusFor,
  deleteObjects,
  isHealthDataAvailable,
  queryCategorySamplesWithAnchor,
  queryQuantitySamplesWithAnchor,
  queryStatisticsCollectionForQuantity,
  requestAuthorization,
  saveWorkoutSample,
} from '@kingstinct/react-native-healthkit';
import { Linking } from 'react-native';

import type { HealthMetric } from '@/db/schema';
import { healthKitStage, heartRateBpm, localDateOf, deviceOffsetMin, weightKg, type WorkoutExport } from './model';
import type { Availability, ChangeBatch, DayWindow, HealthProviderAdapter, ImportedRecord, ImportMetric } from './types';

// Apple Health (iOS). Requires the HealthKit capability and usage strings from
// the @kingstinct/react-native-healthkit config plugin.

const QUANTITY = {
  weight: 'HKQuantityTypeIdentifierBodyMass',
  heart_rate: 'HKQuantityTypeIdentifierHeartRate',
} as const;
const SLEEP = 'HKCategoryTypeIdentifierSleepAnalysis' as const;
const STEPS = 'HKQuantityTypeIdentifierStepCount' as const;
const WORKOUT = 'HKWorkoutTypeIdentifier' as const;

const READ_TYPE: Record<HealthMetric, string> = {
  steps: STEPS,
  weight: QUANTITY.weight,
  heart_rate: QUANTITY.heart_rate,
  sleep: SLEEP,
};

/** WorkoutActivityType.traditionalStrengthTraining */
const TRADITIONAL_STRENGTH_TRAINING = 50;
/** AuthorizationStatus.sharingAuthorized */
const SHARING_AUTHORIZED = 2;

type Sample = {
  uuid: string;
  startDate: Date;
  endDate: Date;
  sourceRevision?: { source?: { bundleIdentifier?: string } };
  quantity?: number;
  value?: number;
};

function toImported(metric: ImportMetric, sample: Sample): ImportedRecord | null {
  const base = {
    metric,
    groupId: sample.uuid,
    externalId: sample.uuid,
    sourceApp: sample.sourceRevision?.source?.bundleIdentifier ?? null,
    start: sample.startDate.getTime(),
    end: sample.endDate.getTime(),
    // HealthKit does not attach the offset to samples; the phone's offset at that instant is used.
    tzOffsetMin: null,
    version: null,
  };
  if (metric === 'weight') {
    const kg = weightKg(sample.quantity ?? NaN, 'kg');
    return kg == null ? null : { ...base, value: kg, stage: null };
  }
  if (metric === 'heart_rate') {
    const bpm = heartRateBpm(sample.quantity ?? NaN);
    return bpm == null ? null : { ...base, value: bpm, stage: null };
  }
  return { ...base, value: null, stage: healthKitStage(sample.value ?? -1) };
}

export const healthProvider: HealthProviderAdapter = {
  id: 'apple_health',

  async availability(): Promise<Availability> {
    try {
      return isHealthDataAvailable() ? 'available' : 'unavailable';
    } catch {
      return 'unavailable';
    }
  },

  async requestAccess(read, writeWorkouts) {
    await requestAuthorization({
      toRead: read.map(metric => READ_TYPE[metric]) as never,
      toShare: writeWorkouts ? [WORKOUT] as never : [],
    });
    // Apple never says whether reads were allowed: an empty result later is
    // shown as "no data", never as "permission denied".
    return {
      read,
      readKnown: false,
      writeWorkouts: writeWorkouts && (authorizationStatusFor(WORKOUT as never) as number) === SHARING_AUTHORIZED,
    };
  },

  async readChanges(metric, cursor, sinceMs): Promise<ChangeBatch> {
    const filter = cursor ? undefined : { date: { startDate: new Date(sinceMs) } };
    const response = metric === 'sleep'
      ? await queryCategorySamplesWithAnchor(SLEEP, { anchor: cursor ?? undefined, limit: 0, filter })
      : await queryQuantitySamplesWithAnchor(QUANTITY[metric], {
        anchor: cursor ?? undefined,
        limit: 0,
        filter,
        unit: (metric === 'weight' ? 'kg' : 'count/min') as never,
      });
    const upserts = (response.samples as unknown as Sample[])
      .map(sample => toImported(metric, sample))
      .filter((record): record is ImportedRecord => record != null);
    return {
      kind: 'changes',
      upserts,
      deletedGroupIds: response.deletedSamples.map(sample => sample.uuid),
      nextCursor: response.newAnchor,
      hasMore: false,
    };
  },

  async dailySteps(days: DayWindow[]) {
    const totals = new Map<string, number>();
    if (!days.length) return totals;
    const first = days[0];
    const last = days[days.length - 1];
    // HealthKit's statistics deduplicate steps counted by both iPhone and Watch.
    const buckets = await queryStatisticsCollectionForQuantity(
      STEPS,
      ['cumulativeSum'],
      new Date(first.start),
      { day: 1 },
      { filter: { date: { startDate: new Date(first.start), endDate: new Date(last.end) } }, unit: 'count' as never },
    );
    for (const bucket of buckets) {
      if (!bucket.startDate || bucket.sumQuantity == null) continue;
      totals.set(localDateOf(bucket.startDate.getTime(), null, deviceOffsetMin), bucket.sumQuantity.quantity);
    }
    return totals;
  },

  async writeWorkout(workout: WorkoutExport, version: number) {
    const saved = await saveWorkoutSample(
      TRADITIONAL_STRENGTH_TRAINING as never,
      [],
      new Date(workout.start),
      new Date(workout.end),
      undefined,
      // The sync identifier makes a retry or an edit replace this workout.
      { HKMetadataKeySyncIdentifier: workout.clientRecordId, HKMetadataKeySyncVersion: version, HKMetadataKeyWorkoutBrandName: 'PULSO' } as never,
    );
    return saved.uuid;
  },

  async deleteWorkout(externalId) {
    if (externalId) await deleteObjects(WORKOUT as never, { uuid: externalId });
  },

  openSettings() {
    void Linking.openURL('x-apple-health://').catch(() => Linking.openSettings());
  },
};
