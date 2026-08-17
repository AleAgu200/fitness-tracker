import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const syncOutbox = sqliteTable('sync_outbox', {
  mutationId:    text('mutation_id').primaryKey(),
  athleteId:     text('athlete_id').notNull(),
  schemaVersion: integer('schema_version').notNull().default(2),
  entityType:    text('entity_type', {
                   enum: ['training_session', 'training_set', 'nutrition_entry', 'body_measurement', 'checkin_response'],
                 }).notNull(),
  entityId:      text('entity_id').notNull(),
  operation:     text('operation', { enum: ['create', 'update', 'delete'] }).notNull(),
  baseVersion:   integer('base_version'),
  occurredAt:    integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
  payload:       text('payload').notNull(),
  status:        text('status', { enum: ['pending', 'retryable', 'rejected'] }).notNull().default('pending'),
  attempts:      integer('attempts').notNull().default(0),
  serverSequence: integer('server_sequence'),
  errorCode:     text('error_code'),
  nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp_ms' }),
  createdAt:     integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt:     integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, table => [
  index('sync_outbox_ready').on(table.athleteId, table.status, table.nextAttemptAt, table.createdAt),
  index('sync_outbox_entity_order').on(table.athleteId, table.entityType, table.entityId, table.createdAt),
]);

export const syncState = sqliteTable('sync_state', {
  athleteId:      text('athlete_id').primaryKey(),
  deviceId:       text('device_id').notNull(),
  cursor:         text('cursor'),
  lastAckSequence: integer('last_ack_sequence').notNull().default(0),
  lastSyncAt:     integer('last_sync_at', { mode: 'timestamp_ms' }),
  lastSuccessAt:  integer('last_success_at', { mode: 'timestamp_ms' }),
  lastError:      text('last_error'),
  upgradeRequired: integer('upgrade_required', { mode: 'boolean' }).notNull().default(false),
  writerConflict: integer('writer_conflict', { mode: 'boolean' }).notNull().default(false),
  updatedAt:      integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const professionalCheckinRequests = sqliteTable('professional_checkin_requests', {
  id:            text('id').primaryKey(),
  athleteId:     text('athlete_id').notNull(),
  dueAt:         integer('due_at', { mode: 'timestamp_ms' }).notNull(),
  schemaVersion: integer('schema_version').notNull(),
  questions:     text('questions').notNull(),
  status:        text('status', { enum: ['pending', 'submitted', 'reviewed', 'cancelled'] }).notNull().default('pending'),
  receivedAt:    integer('received_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt:     integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const professionalCheckinResponses = sqliteTable('professional_checkin_responses', {
  id:            text('id').primaryKey(),
  requestId:     text('request_id').notNull().references(() => professionalCheckinRequests.id, { onDelete: 'restrict' }),
  schemaVersion: integer('schema_version').notNull(),
  answers:       text('answers').notNull(),
  submittedAt:   integer('submitted_at', { mode: 'timestamp_ms' }).notNull(),
}, table => [
  uniqueIndex('professional_checkin_response_request').on(table.requestId),
]);

export const localCareAssignments = sqliteTable('local_care_assignments', {
  id:             text('id').primaryKey(),
  athleteId:      text('athlete_id').notNull(),
  organizationId: text('organization_id').notNull(),
  discipline:     text('discipline', { enum: ['coach', 'nutritionist'] }).notNull(),
  primary:        integer('primary_assignment', { mode: 'boolean' }).notNull().default(false),
  active:         integer('active', { mode: 'boolean' }).notNull().default(true),
  updatedAt:      integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, table => [
  index('local_care_assignment_org').on(table.athleteId, table.organizationId, table.active),
]);

export const localSharingConsents = sqliteTable('local_sharing_consents', {
  id:             text('id').primaryKey(),
  athleteId:      text('athlete_id').notNull(),
  organizationId: text('organization_id').notNull(),
  category:       text('category', { enum: ['training', 'nutrition', 'metrics', 'checkins', 'photos'] }).notNull(),
  granted:        integer('granted', { mode: 'boolean' }).notNull(),
  updatedAt:      integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, table => [
  uniqueIndex('local_sharing_consent_org_category').on(table.athleteId, table.organizationId, table.category),
]);

export type SyncOutboxRow = typeof syncOutbox.$inferSelect;
export type ProfessionalCheckinRequest = typeof professionalCheckinRequests.$inferSelect;
