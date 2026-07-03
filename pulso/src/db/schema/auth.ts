// Auth (users, sessions) is managed by Better Auth on the Next.js server.
// The local DB keeps only the devices table for push tokens and
// per-device AI personalisation. userId is the Better Auth user ID.

import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const devices = sqliteTable('devices', {
  id:          text('id').primaryKey(),
  userId:      text('user_id').notNull(),
  fingerprint: text('fingerprint').notNull(),
  platform:    text('platform', { enum: ['ios', 'android', 'web'] }).notNull(),
  osVersion:   text('os_version'),
  appVersion:  text('app_version'),
  pushToken:   text('push_token'),
  lastSeenAt:  integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt:   integer('created_at',  { mode: 'timestamp_ms' }).notNull(),
}, t => [
  uniqueIndex('devices_fingerprint_user').on(t.fingerprint, t.userId),
]);

export type Device = typeof devices.$inferSelect;
