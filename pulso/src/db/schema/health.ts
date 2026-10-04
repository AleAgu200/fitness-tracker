import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Health Connect (Android) and Apple Health (iOS), behind one model. All of it
// is local to the phone: imported records are never sent to a professional,
// and personal cloud backup covers them only with its own disclosed opt-in.

export const HEALTH_PROVIDERS = ['health_connect', 'apple_health'] as const;
export type HealthProviderId = typeof HEALTH_PROVIDERS[number];

export const HEALTH_METRICS = ['steps', 'weight', 'sleep', 'heart_rate'] as const;
export type HealthMetric = typeof HEALTH_METRICS[number];

/** What the athlete connected, per provider. Disconnecting stops imports. */
export const healthConnections = sqliteTable('health_connections', {
  athleteId:      text('athlete_id').notNull(),
  provider:       text('provider', { enum: HEALTH_PROVIDERS }).notNull(),
  status:         text('status', { enum: ['connected', 'disconnected'] }).notNull(),
  /** JSON HealthMetric[] the athlete asked to read. */
  readMetrics:    text('read_metrics').notNull().default('[]'),
  writeWorkouts:  integer('write_workouts', { mode: 'boolean' }).notNull().default(false),
  connectedAt:    integer('connected_at', { mode: 'timestamp_ms' }),
  disconnectedAt: integer('disconnected_at', { mode: 'timestamp_ms' }),
  lastImportAt:   integer('last_import_at', { mode: 'timestamp_ms' }),
  lastError:      text('last_error'),
  updatedAt:      integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, t => [
  primaryKey({ columns: [t.athleteId, t.provider] }),
]);

/** Provider change token / anchor per metric. Saved only after its batch is applied. */
export const healthSyncCursors = sqliteTable('health_sync_cursors', {
  athleteId: text('athlete_id').notNull(),
  provider:  text('provider', { enum: HEALTH_PROVIDERS }).notNull(),
  metric:    text('metric', { enum: HEALTH_METRICS }).notNull(),
  cursor:    text('cursor').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, t => [
  primaryKey({ columns: [t.athleteId, t.provider, t.metric] }),
]);

/**
 * Imported observations: heart rate and sleep intervals. (Weight goes to
 * body_measurements with its provenance; steps are daily summaries below.)
 * The record's identity is provider + the provider's own record ID, so a
 * repeated import updates instead of duplicating.
 */
export const healthSamples = sqliteTable('health_samples', {
  id:           text('id').primaryKey(), // `${provider}:${externalId}`
  athleteId:    text('athlete_id').notNull(),
  provider:     text('provider', { enum: HEALTH_PROVIDERS }).notNull(),
  externalId:   text('external_id').notNull(),
  sourceApp:    text('source_app'),
  kind:         text('kind', { enum: ['heart_rate', 'sleep'] }).notNull(),
  startAt:      integer('start_at', { mode: 'timestamp_ms' }).notNull(),
  endAt:        integer('end_at', { mode: 'timestamp_ms' }).notNull(),
  /** Minutes east of UTC where it was recorded; null when the provider does not say. */
  tzOffsetMin:  integer('tz_offset_min'),
  /** Beats per minute for heart rate; null for sleep. */
  value:        real('value'),
  /** Sleep stage: asleep, light, deep, rem, awake, in_bed. */
  stage:        text('stage'),
  version:      text('version'),
  deletedAt:    integer('deleted_at', { mode: 'timestamp_ms' }),
  importedAt:   integer('imported_at', { mode: 'timestamp_ms' }).notNull(),
}, t => [
  uniqueIndex('health_samples_provider_external').on(t.athleteId, t.provider, t.externalId),
  index('health_samples_kind_time').on(t.athleteId, t.kind, t.endAt),
]);

/** Steps per local day, as each provider aggregates them (deduplicated across its sources). */
export const healthDailySteps = sqliteTable('health_daily_steps', {
  athleteId: text('athlete_id').notNull(),
  provider:  text('provider', { enum: HEALTH_PROVIDERS }).notNull(),
  localDate: text('local_date').notNull(),
  steps:     integer('steps').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, t => [
  primaryKey({ columns: [t.athleteId, t.provider, t.localDate] }),
]);

/**
 * Manually entered sleep for a wake-up date. Overrides the provider summary
 * shown for that date without deleting or adding to provider intervals.
 */
export const sleepEntries = sqliteTable('sleep_entries', {
  id:        text('id').primaryKey(),
  athleteId: text('athlete_id').notNull(),
  wakeDate:  text('wake_date').notNull(),
  minutes:   integer('minutes').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, t => [
  uniqueIndex('sleep_entries_athlete_date').on(t.athleteId, t.wakeDate),
]);

/** Which provider is shown for a metric when restored history holds more than one. */
export const healthMetricSources = sqliteTable('health_metric_sources', {
  athleteId: text('athlete_id').notNull(),
  metric:    text('metric', { enum: HEALTH_METRICS }).notNull(),
  provider:  text('provider', { enum: HEALTH_PROVIDERS }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, t => [
  primaryKey({ columns: [t.athleteId, t.metric] }),
]);

/**
 * Durable queue of completed PULSO workouts to write to the provider. The
 * client record ID is stable per session, so a retry or an edit updates the
 * same provider record instead of writing a second one.
 */
export const healthWorkoutExports = sqliteTable('health_workout_exports', {
  id:             text('id').primaryKey(), // `${provider}:${sessionId}`
  athleteId:      text('athlete_id').notNull(),
  provider:       text('provider', { enum: HEALTH_PROVIDERS }).notNull(),
  sessionId:      text('session_id').notNull(),
  clientRecordId: text('client_record_id').notNull(),
  version:        integer('version').notNull().default(1),
  externalId:     text('external_id'),
  status:         text('status', { enum: ['pending', 'written', 'failed', 'delete_pending', 'deleted'] }).notNull(),
  attempts:       integer('attempts').notNull().default(0),
  lastError:      text('last_error'),
  updatedAt:      integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, t => [
  index('health_workout_exports_status').on(t.athleteId, t.status),
]);

export type HealthConnection = typeof healthConnections.$inferSelect;
export type HealthSample = typeof healthSamples.$inferSelect;
