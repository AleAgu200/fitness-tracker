/**
 * Multi-device sync rules on the phone. Pure (no React Native, no database)
 * so they run under `node --test`.
 *
 * Per record the most recent change wins — the same rule as the server, so
 * every device converges. Rows that two devices can create independently for
 * the same thing (one check-in per day, one exercise per name…) are merged
 * onto one canonical ID: the smaller of the two, chosen the same way on every
 * device, so no device has to coordinate.
 */

export interface SyncTableConfig {
  table: string;
  /** Primary key column as Drizzle names it. */
  key: string;
  /**
   * Columns that identify the same thing across devices (a unique index on
   * the phone), and how two such rows merge.
   */
  natural?: {
    columns: string[];
    merge: 'latest' | 'or_flags';
    /** Rows pointing at this one, moved onto the canonical ID. */
    children?: { table: string; column: string }[];
  };
}

/** Synced tables, parents before children (the order changes are applied in). */
export const SYNC_TABLES: SyncTableConfig[] = [
  { table: 'onboarding_state', key: 'userId' },
  { table: 'generation_profiles', key: 'userId' },
  { table: 'nutrition_settings', key: 'athleteId' },
  {
    table: 'exercises',
    key: 'id',
    natural: {
      columns: ['name'],
      merge: 'latest',
      children: [
        { table: 'template_exercise_slots', column: 'exerciseId' },
        { table: 'logged_exercises', column: 'exerciseId' },
        { table: 'personal_records', column: 'exerciseId' },
      ],
    },
  },
  { table: 'programs', key: 'id' },
  { table: 'program_phases', key: 'id' },
  { table: 'workout_templates', key: 'id' },
  { table: 'template_exercise_slots', key: 'id' },
  { table: 'workout_sessions', key: 'id' },
  { table: 'logged_exercises', key: 'id' },
  { table: 'logged_sets', key: 'id' },
  { table: 'session_cards', key: 'id' },
  { table: 'body_measurements', key: 'id' },
  { table: 'sleep_entries', key: 'id', natural: { columns: ['athleteId', 'wakeDate'], merge: 'latest' } },
  { table: 'daily_check_ins', key: 'id', natural: { columns: ['athleteId', 'date'], merge: 'or_flags' } },
  { table: 'meal_plans', key: 'id' },
  { table: 'meal_slots', key: 'id' },
  { table: 'meal_slot_skips', key: 'id', natural: { columns: ['slotId', 'date'], merge: 'latest' } },
  {
    table: 'daily_nutrition_logs',
    key: 'id',
    natural: { columns: ['athleteId', 'date'], merge: 'latest', children: [{ table: 'meal_log_entries', column: 'dailyLogId' }] },
  },
  { table: 'meal_log_entries', key: 'id', natural: { columns: ['dailyLogId', 'slotId'], merge: 'latest' } },
  { table: 'saved_foods', key: 'id' },
  { table: 'beverage_containers', key: 'id' },
  { table: 'consumptions', key: 'id' },
  { table: 'ai_recommendations', key: 'id' },
  { table: 'ai_feedback', key: 'id' },
];

export const SYNC_TABLE_NAMES = SYNC_TABLES.map(config => config.table);

export function tableConfig(table: string): SyncTableConfig | null {
  return SYNC_TABLES.find(config => config.table === table) ?? null;
}

export interface RemoteRecord {
  table: string;
  id: string;
  deleted: boolean;
  payload: Record<string, unknown> | null;
  changedAt: number;
  deviceId: string;
}

/**
 * Whether a pulled change replaces this device's version. A local change not
 * yet pushed competes by time; on an exact tie the larger device ID wins
 * (the server's rule). Our own changes coming back are skipped.
 */
export function remoteWins(
  remote: { changedAt: number; deviceId: string },
  localPending: number | null,
  myDeviceId: string,
): boolean {
  if (remote.deviceId === myDeviceId && localPending == null) return false;
  if (localPending == null) return true;
  if (remote.changedAt !== localPending) return remote.changedAt > localPending;
  return remote.deviceId > myDeviceId;
}

/** The ID every device keeps when two rows describe the same thing. */
export function canonicalId(a: string, b: string): string {
  return a < b ? a : b;
}

/** Value used to match rows by their natural key (names compare without case or edge spaces). */
export function naturalKey(config: SyncTableConfig, row: Record<string, unknown>): string | null {
  if (!config.natural) return null;
  const parts = config.natural.columns.map(column => {
    const value = row[column];
    if (value == null) return null;
    return config.table === 'exercises' ? String(value).trim().toLowerCase() : String(value);
  });
  return parts.some(part => part == null || part === '') ? null : parts.join('\u0000');
}

const CHECK_IN_FLAGS = ['workoutCompleted', 'nutritionCompleted', 'hydrationCompleted'] as const;

/**
 * Merges two rows for the same thing. Check-ins combine their flags (a workout
 * done on one device and water logged on another both count); everything
 * else keeps the more recent version.
 */
export function mergeNatural(
  config: SyncTableConfig,
  local: { row: Record<string, unknown>; changedAt: number },
  remote: { row: Record<string, unknown>; changedAt: number },
): Record<string, unknown> {
  if (config.natural?.merge === 'or_flags') {
    const merged: Record<string, unknown> = { ...local.row, ...remote.row };
    for (const flag of CHECK_IN_FLAGS) merged[flag] = Boolean(local.row[flag]) || Boolean(remote.row[flag]);
    merged.streakDay = Math.max(Number(local.row.streakDay ?? 0), Number(remote.row.streakDay ?? 0));
    return merged;
  }
  return remote.changedAt >= local.changedAt ? { ...remote.row } : { ...local.row };
}

/**
 * Order to apply a pulled batch: upserts parents first, then deletions
 * children first, so references always point at existing rows.
 */
export function orderForApply(records: RemoteRecord[]): RemoteRecord[] {
  const index = (table: string) => {
    const position = SYNC_TABLE_NAMES.indexOf(table);
    return position < 0 ? Number.MAX_SAFE_INTEGER : position;
  };
  const upserts = records.filter(record => !record.deleted).sort((a, b) => index(a.table) - index(b.table));
  const deletes = records.filter(record => record.deleted).sort((a, b) => index(b.table) - index(a.table));
  return [...upserts, ...deletes];
}

/** Of several active plans after a merge, the one activated last stays active (ties: smaller ID). */
export function pickActive<T extends { id: string; lastActivatedAt: number | null }>(rows: T[]): T | null {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => (b.lastActivatedAt ?? 0) - (a.lastActivatedAt ?? 0) || (a.id < b.id ? -1 : 1))[0];
}
