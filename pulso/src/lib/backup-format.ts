/**
 * Personal backup snapshot format, shared by cloud backup and JSON import.
 * Pure (no React Native, no database) so validation runs under `node --test`.
 *
 * A snapshot is plain rows per local table, keyed by SQL table name, in the
 * same shape Drizzle reads them. Restoring inserts rows by their stable IDs
 * and never overwrites a row the phone already has, so restoring or importing
 * the same snapshot twice changes nothing the second time.
 */

export const BACKUP_FORMAT = 'pulso-backup';
export const BACKUP_FORMAT_VERSION = 1;

/** Tables in a snapshot, parents before children (the insert order). */
export const BACKUP_TABLES = [
  'athlete_profiles',
  'onboarding_state',
  'generation_profiles',
  'nutrition_settings',
  'exercises',
  'programs',
  'program_phases',
  'workout_templates',
  'template_exercise_slots',
  'workout_sessions',
  'logged_exercises',
  'logged_sets',
  'session_cards',
  'weekly_summaries',
  'body_measurements',
  'sleep_entries',
  'daily_check_ins',
  'athlete_achievements',
  'meal_plans',
  'meal_slots',
  'meal_slot_skips',
  'daily_nutrition_logs',
  'meal_log_entries',
  'water_logs',
  'saved_foods',
  'beverage_containers',
  'consumptions',
  'ai_recommendations',
  'ai_feedback',
] as const;

export type BackupTable = typeof BACKUP_TABLES[number];
export type Row = Record<string, unknown>;
export type SnapshotTables = Partial<Record<BackupTable, Row[]>>;

/**
 * What a snapshot deliberately leaves out. Shown to the athlete as coverage,
 * so "backed up" never promises more than it holds.
 */
export const BACKUP_EXCLUSIONS: { area: string; reason: string }[] = [
  { area: 'progress_photos', reason: 'images_stay_on_device' },
  { area: 'personal_records', reason: 'recomputed_from_sets' },
  { area: 'professional_sharing', reason: 'server_authoritative' },
  { area: 'checkin_requests', reason: 'server_authoritative' },
  { area: 'coach_messages', reason: 'server_authoritative' },
  { area: 'sync_state', reason: 'device_specific' },
  { area: 'push_devices', reason: 'device_specific' },
  { area: 'ai_context_cache', reason: 'cache' },
  // Pending the owner's decision (plan G4 open question): provider imports
  // stay on the phone; manual sleep entries are backed up.
  { area: 'health_provider_imports', reason: 'local_only' },
];

/** Personal settings kept outside SQLite (SecureStore). */
export interface BackupSettings {
  weightUnit?: 'kg' | 'lb';
  accentColor?: string;
  themeMode?: 'system' | 'light' | 'dark';
}

/** Enough to route a new phone before the full restore finishes. */
export interface BackupBootstrap {
  profile: { fullName: string } | null;
  onboardingStatus: string | null;
  activeProgramId: string | null;
  activeMealPlanId: string | null;
  hasGenerationPreferences: boolean;
}

export interface Snapshot {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  owner: string;
  createdAt: number;
  appVersion: string | null;
  bootstrap: BackupBootstrap;
  settings: BackupSettings;
  tables: SnapshotTables;
  excluded: { area: string; reason: string }[];
}

/** Primary key column per table; singleton tables are keyed by their owner. */
export const KEY_COLUMN: Record<BackupTable, string> = Object.fromEntries(
  BACKUP_TABLES.map(table => [table, table === 'athlete_profiles' || table === 'onboarding_state' || table === 'generation_profiles'
    ? 'userId'
    : table === 'nutrition_settings' ? 'athleteId' : 'id']),
) as Record<BackupTable, string>;

/** Columns that name the owning account; every row must name the snapshot's owner. */
const OWNER_COLUMNS = ['athleteId', 'userId'] as const;

/** A child's required parent: the row cannot exist without it. */
const REQUIRED_REFERENCES: { table: BackupTable; column: string; parent: BackupTable }[] = [
  { table: 'program_phases', column: 'programId', parent: 'programs' },
  { table: 'template_exercise_slots', column: 'templateId', parent: 'workout_templates' },
  { table: 'template_exercise_slots', column: 'exerciseId', parent: 'exercises' },
  { table: 'logged_exercises', column: 'sessionId', parent: 'workout_sessions' },
  { table: 'logged_exercises', column: 'exerciseId', parent: 'exercises' },
  { table: 'logged_sets', column: 'loggedExerciseId', parent: 'logged_exercises' },
  { table: 'session_cards', column: 'sessionId', parent: 'workout_sessions' },
  { table: 'meal_slots', column: 'mealPlanId', parent: 'meal_plans' },
  { table: 'meal_slot_skips', column: 'slotId', parent: 'meal_slots' },
  { table: 'meal_log_entries', column: 'dailyLogId', parent: 'daily_nutrition_logs' },
  { table: 'meal_log_entries', column: 'slotId', parent: 'meal_slots' },
  { table: 'ai_feedback', column: 'recommendationId', parent: 'ai_recommendations' },
];

/**
 * Optional references that legitimately go stale (a deleted plan leaves its
 * past sessions pointing at nothing). Like the database's `set null`, a
 * missing parent clears the reference instead of rejecting the history.
 */
const OPTIONAL_REFERENCES: { table: BackupTable; column: string; parent: BackupTable }[] = [
  { table: 'workout_templates', column: 'programId', parent: 'programs' },
  { table: 'workout_sessions', column: 'templateId', parent: 'workout_templates' },
  { table: 'logged_exercises', column: 'slotId', parent: 'template_exercise_slots' },
  { table: 'meal_plans', column: 'phaseId', parent: 'program_phases' },
  { table: 'daily_nutrition_logs', column: 'mealPlanId', parent: 'meal_plans' },
];

export type SnapshotProblem =
  | 'not_a_backup'
  | 'unsupported_version'
  | 'foreign_account'
  | 'malformed_rows'
  | 'duplicate_ids'
  | 'dangling_references'
  | 'empty';

export type ValidationResult =
  | { ok: true; tables: SnapshotTables; clearedReferences: number }
  | { ok: false; problem: SnapshotProblem; detail: string };

function isRow(value: unknown): value is Row {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Checks a snapshot's tables before anything is written: known tables only,
 * one owner, unique keys and intact required references. Stale optional
 * references are cleared. Returns normalized copies; the input is untouched.
 */
export function validateTables(raw: unknown, owner: string): ValidationResult {
  if (!isRow(raw)) return { ok: false, problem: 'malformed_rows', detail: 'tables' };
  const tables: SnapshotTables = {};
  let total = 0;

  for (const name of Object.keys(raw)) {
    if (!(BACKUP_TABLES as readonly string[]).includes(name)) continue; // unknown tables are ignored, never written
    const rows = raw[name];
    if (!Array.isArray(rows) || !rows.every(isRow)) return { ok: false, problem: 'malformed_rows', detail: name };
    const table = name as BackupTable;
    const key = KEY_COLUMN[table];
    const seen = new Set<string>();
    for (const row of rows) {
      const id = row[key];
      if (typeof id !== 'string' || id === '') return { ok: false, problem: 'malformed_rows', detail: `${name}.${key}` };
      if (seen.has(id)) return { ok: false, problem: 'duplicate_ids', detail: `${name}:${id}` };
      seen.add(id);
      for (const column of OWNER_COLUMNS) {
        if (column in row && row[column] != null && row[column] !== owner) return { ok: false, problem: 'foreign_account', detail: name };
      }
    }
    tables[table] = rows.map(row => ({ ...row }));
    total += rows.length;
  }
  if (total === 0) return { ok: false, problem: 'empty', detail: 'no_rows' };

  const ids = (table: BackupTable) => new Set((tables[table] ?? []).map(row => row[KEY_COLUMN[table]] as string));

  for (const reference of REQUIRED_REFERENCES) {
    const parents = ids(reference.parent);
    for (const row of tables[reference.table] ?? []) {
      const value = row[reference.column];
      if (typeof value !== 'string' || !parents.has(value)) {
        return { ok: false, problem: 'dangling_references', detail: `${reference.table}.${reference.column}` };
      }
    }
  }

  let clearedReferences = 0;
  for (const reference of OPTIONAL_REFERENCES) {
    const parents = ids(reference.parent);
    for (const row of tables[reference.table] ?? []) {
      const value = row[reference.column];
      if (value != null && !(typeof value === 'string' && parents.has(value))) {
        row[reference.column] = null;
        clearedReferences += 1;
      }
    }
  }
  return { ok: true, tables, clearedReferences };
}

/** Validates a whole snapshot document: format, version, owner, then its tables. */
export function validateSnapshot(raw: unknown, owner: string): ValidationResult & { settings?: BackupSettings } {
  if (!isRow(raw) || raw.format !== BACKUP_FORMAT) return { ok: false, problem: 'not_a_backup', detail: 'format' };
  if (raw.formatVersion !== BACKUP_FORMAT_VERSION) return { ok: false, problem: 'unsupported_version', detail: String(raw.formatVersion) };
  if (raw.owner !== owner) return { ok: false, problem: 'foreign_account', detail: 'owner' };
  const result = validateTables(raw.tables, owner);
  return result.ok ? { ...result, settings: parseSettings(raw.settings) } : result;
}

function parseSettings(raw: unknown): BackupSettings {
  if (!isRow(raw)) return {};
  const settings: BackupSettings = {};
  if (raw.weightUnit === 'kg' || raw.weightUnit === 'lb') settings.weightUnit = raw.weightUnit;
  if (typeof raw.accentColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(raw.accentColor)) settings.accentColor = raw.accentColor;
  if (raw.themeMode === 'system' || raw.themeMode === 'light' || raw.themeMode === 'dark') settings.themeMode = raw.themeMode;
  return settings;
}

/**
 * Exercises are created by name on each phone, so the same exercise can have
 * different IDs on the old and the new phone. A snapshot exercise whose name
 * already exists locally is mapped onto the local ID (and not inserted), so
 * history and plans end up on one exercise instead of two with the same name.
 */
export function remapExercises(tables: SnapshotTables, local: { id: string; name: string }[]): { tables: SnapshotTables; remapped: number } {
  const byName = new Map(local.map(exercise => [exercise.name.trim().toLowerCase(), exercise.id]));
  const localIds = new Set(local.map(exercise => exercise.id));
  const mapping = new Map<string, string>();
  const keep: Row[] = [];
  for (const exercise of tables.exercises ?? []) {
    const id = exercise.id as string;
    const match = byName.get(String(exercise.name ?? '').trim().toLowerCase());
    if (localIds.has(id)) continue; // already here under the same ID
    if (match && match !== id) mapping.set(id, match);
    else keep.push(exercise);
  }
  const swap = (rows: Row[] | undefined) => rows?.map(row => {
    const target = mapping.get(row.exerciseId as string);
    return target ? { ...row, exerciseId: target } : row;
  });
  return {
    tables: {
      ...tables,
      exercises: keep,
      template_exercise_slots: swap(tables.template_exercise_slots),
      logged_exercises: swap(tables.logged_exercises),
    },
    remapped: mapping.size,
  };
}

export function buildBootstrap(tables: SnapshotTables): BackupBootstrap {
  const profile = tables.athlete_profiles?.[0];
  const onboarding = tables.onboarding_state?.[0];
  const activeProgram = tables.programs?.find(row => row.active === true && row.archivedAt == null);
  const activeMealPlan = tables.meal_plans?.find(row => row.active === true);
  return {
    profile: profile && typeof profile.fullName === 'string' ? { fullName: profile.fullName } : null,
    onboardingStatus: typeof onboarding?.status === 'string' ? onboarding.status : null,
    activeProgramId: (activeProgram?.id as string | undefined) ?? null,
    activeMealPlanId: (activeMealPlan?.id as string | undefined) ?? null,
    hasGenerationPreferences: (tables.generation_profiles?.length ?? 0) > 0,
  };
}

/** Row counts the athlete recognises, for previews and coverage. */
export function summarizeTables(tables: SnapshotTables) {
  const count = (table: BackupTable) => tables[table]?.length ?? 0;
  return {
    workouts: count('workout_sessions'),
    sets: count('logged_sets'),
    plans: count('programs') + count('meal_plans'),
    meals: count('consumptions') + count('meal_log_entries'),
    measurements: count('body_measurements'),
    total: BACKUP_TABLES.reduce((sum, table) => sum + count(table), 0),
  };
}

// ── JSON export (format pulso-export, version 1) ────────────────────────────

export type ExportProblem = 'not_an_export' | 'unsupported_version' | 'too_large';

/** Largest export file accepted for import. */
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter(isRow) : [];
}

function one(value: unknown): Row[] {
  return isRow(value) ? [value] : [];
}

/**
 * Turns the free JSON export (`pulso-export` v1: phone + server sections)
 * into snapshot tables. Only the phone's own data is imported; sessions,
 * tokens, device leases, sharing permissions and professional records are
 * never part of it. The result still goes through validateTables.
 */
export function tablesFromExport(raw: unknown): { ok: true; tables: Row } | { ok: false; problem: ExportProblem } {
  if (!isRow(raw) || raw.format !== 'pulso-export') return { ok: false, problem: 'not_an_export' };
  if (raw.version !== 1) return { ok: false, problem: 'unsupported_version' };
  const phone = isRow(raw.phone) ? raw.phone : {};
  const habits = isRow(phone.habits) ? phone.habits : {};
  const training = isRow(phone.training) ? phone.training : {};
  const nutrition = isRow(phone.nutrition) ? phone.nutrition : {};
  const ai = isRow(phone.ai) ? phone.ai : {};
  const onboarding = isRow(phone.onboarding) ? phone.onboarding : {};
  return {
    ok: true,
    tables: {
      athlete_profiles: one(phone.profile),
      onboarding_state: one(onboarding.state),
      generation_profiles: one(onboarding.generationProfile),
      nutrition_settings: one(nutrition.settings),
      exercises: rows(training.exercises),
      programs: rows(training.plans),
      program_phases: rows(training.phases),
      workout_templates: rows(training.templates),
      template_exercise_slots: rows(training.slots),
      workout_sessions: rows(training.sessions),
      logged_exercises: rows(training.loggedExercises),
      logged_sets: rows(training.sets),
      session_cards: rows(training.sessionCards),
      weekly_summaries: rows(training.weeklySummaries),
      body_measurements: rows(phone.bodyMeasurements),
      sleep_entries: rows(isRow(phone.health) ? phone.health.sleepEntries : undefined),
      daily_check_ins: rows(habits.dailyCheckIns),
      athlete_achievements: rows(habits.achievements),
      meal_plans: rows(nutrition.mealPlans),
      meal_slots: rows(nutrition.mealSlots),
      meal_slot_skips: rows(nutrition.mealSlotSkips),
      daily_nutrition_logs: rows(nutrition.dailyLogs),
      meal_log_entries: rows(nutrition.mealEntries),
      water_logs: rows(nutrition.water),
      saved_foods: rows(nutrition.savedFoods),
      beverage_containers: rows(nutrition.containers),
      consumptions: rows(nutrition.consumptions),
      ai_recommendations: rows(ai.recommendations),
      ai_feedback: rows(ai.feedback),
    },
  };
}
