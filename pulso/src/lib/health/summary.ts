import { Platform } from 'react-native';

import {
  getDailySteps,
  getLatestHeartRate,
  getLatestImportedWeight,
  getPreferredSource,
  getSleepEntry,
  getSleepIntervals,
} from '@/db/health';
import { dateStr } from '@/lib/dates';
import {
  defaultProvider,
  pickProviderSummary,
  ProviderId,
  SleepStage,
  sleepByWakeDate,
  sleepForDate,
  SourcedValue,
} from './model';

export const PROVIDER_LABELS: Record<ProviderId | 'manual', string> = {
  health_connect: 'Health Connect',
  apple_health: 'Salud de Apple',
  manual: 'Manual',
};

export function formatSleep(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} h ${String(rest).padStart(2, '0')} min` : `${rest} min`;
}

/** Last night's sleep for the wake-up date: manual entry first, else one provider's summary. */
export async function getSleepSummary(userId: string, now = new Date()): Promise<{ wakeDate: string; sleep: SourcedValue | null; manual: boolean }> {
  const wakeDate = dateStr(now);
  const [manualMinutes, intervals, preferred] = await Promise.all([
    getSleepEntry(userId, wakeDate),
    getSleepIntervals(userId, new Date(now.getTime() - 36 * 60 * 60 * 1000), now),
    getPreferredSource(userId, 'sleep'),
  ]);
  const byProvider: Partial<Record<ProviderId, number>> = {};
  for (const provider of ['health_connect', 'apple_health'] as const) {
    const own = intervals.filter(row => row.provider === provider).map(row => ({
      start: row.start.getTime(),
      end: row.end.getTime(),
      stage: (row.stage ?? 'unknown') as SleepStage,
      tzOffsetMin: row.tzOffsetMin,
    }));
    const minutes = sleepByWakeDate(own).get(wakeDate);
    if (minutes != null) byProvider[provider] = minutes;
  }
  return {
    wakeDate,
    sleep: sleepForDate(manualMinutes, byProvider, preferred ?? defaultProvider(Platform.OS)),
    manual: manualMinutes != null,
  };
}

export interface HealthSummary {
  steps: SourcedValue | null;
  sleep: SourcedValue | null;
  heartRate: { bpm: number; at: Date; source: ProviderId } | null;
  weight: { weightKg: number; at: Date; source: string } | null;
}

export async function getHealthSummary(userId: string, now = new Date()): Promise<HealthSummary> {
  const [stepsByProvider, preferredSteps, sleep, heartRate, weight] = await Promise.all([
    getDailySteps(userId, dateStr(now)),
    getPreferredSource(userId, 'steps'),
    getSleepSummary(userId, now),
    getLatestHeartRate(userId),
    getLatestImportedWeight(userId),
  ]);
  return {
    steps: pickProviderSummary(stepsByProvider, preferredSteps ?? defaultProvider(Platform.OS)),
    sleep: sleep.sleep,
    heartRate: heartRate ? { bpm: heartRate.bpm, at: heartRate.at, source: heartRate.provider } : null,
    weight: weight ? { weightKg: weight.weightKg, at: weight.at, source: weight.provider } : null,
  };
}
