import type { HealthMetric } from '@/db/schema';
import type { ProviderId, SleepStage, WorkoutExport } from './model';

export type ImportMetric = Exclude<HealthMetric, 'steps'>;

/** One observation, normalized from either provider. */
export interface ImportedRecord {
  metric: ImportMetric;
  /** The provider's record this came from; deleting it removes all of its rows. */
  groupId: string;
  /** Unique per row (a heart-rate record or sleep session can hold several). */
  externalId: string;
  sourceApp: string | null;
  start: number;
  end: number;
  tzOffsetMin: number | null;
  /** kg for weight, bpm for heart rate, null for sleep. */
  value: number | null;
  stage: SleepStage | null;
  version: string | null;
}

export type ChangeBatch =
  | { kind: 'changes'; upserts: ImportedRecord[]; deletedGroupIds: string[]; nextCursor: string; hasMore: boolean }
  /** The provider dropped our change token: rescan a bounded window and start over. */
  | { kind: 'expired' };

export type Availability = 'available' | 'update_required' | 'unavailable';

export interface DayWindow {
  date: string;
  start: number;
  end: number;
}

export interface HealthProviderAdapter {
  id: ProviderId;
  availability(): Promise<Availability>;
  /**
   * Shows the system permission sheet. Health Connect reports what was
   * granted; HealthKit never reveals read grants, so its reads come back as
   * "requested" and an empty read is not treated as a denial.
   */
  requestAccess(read: HealthMetric[], writeWorkouts: boolean): Promise<{ read: HealthMetric[]; readKnown: boolean; writeWorkouts: boolean }>;
  /** Records changed since `cursor`; a null cursor reads the window starting at `sinceMs`. */
  readChanges(metric: ImportMetric, cursor: string | null, sinceMs: number): Promise<ChangeBatch>;
  /** Steps per local day as the provider aggregates them (its own cross-app deduplication). */
  dailySteps(days: DayWindow[]): Promise<Map<string, number>>;
  /** Writes or updates (same clientRecordId) a completed workout; returns the provider's ID. */
  writeWorkout(workout: WorkoutExport, version: number): Promise<string>;
  deleteWorkout(externalId: string | null, clientRecordId: string): Promise<void>;
  openSettings(): void;
}
