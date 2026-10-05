import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Multi-device sync (PULSO Plus). SQLite triggers (migration 0019) record every
// insert, update and delete of the synced tables here, so no write path has
// to remember to; the sync pushes these and clears them once the server has them.

/** One pending change per record: the latest op and when it happened (device clock). */
export const syncChanges = sqliteTable('sync_changes', {
  tableName: text('table_name').notNull(),
  recordId:  text('record_id').notNull(),
  op:        text('op', { enum: ['upsert', 'delete'] }).notNull(),
  changedAt: integer('changed_at').notNull(),
}, t => [
  primaryKey({ columns: [t.tableName, t.recordId] }),
]);

/** Single row (id 1). While `paused` is 1 the triggers record nothing (account wipe on deletion). */
export const syncCaptureGuard = sqliteTable('sync_capture_guard', {
  id:     integer('id').primaryKey(),
  paused: integer('paused').notNull().default(0),
});

/**
 * Records being written by an incoming sync right now: their triggers record
 * nothing (they must not echo back), while every other write keeps recording.
 */
export const syncApplying = sqliteTable('sync_applying', {
  tableName: text('table_name').notNull(),
  recordId:  text('record_id').notNull(),
}, t => [
  primaryKey({ columns: [t.tableName, t.recordId] }),
]);

/** Per account on this device: whether sync is on and how far it has pulled. */
export const deviceSyncState = sqliteTable('device_sync_state', {
  athleteId:    text('athlete_id').primaryKey(),
  enabled:      integer('enabled', { mode: 'boolean' }).notNull().default(false),
  cursor:       integer('cursor').notNull().default(0),
  backfilledAt: integer('backfilled_at', { mode: 'timestamp_ms' }),
  lastSyncAt:   integer('last_sync_at', { mode: 'timestamp_ms' }),
  lastError:    text('last_error'),
  updatedAt:    integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
