import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';


export const aiRecommendations = sqliteTable('ai_recommendations', {
  id:              text('id').primaryKey(),
  athleteId:       text('athlete_id')
                     .notNull(),
  type:            text('type', {
                     enum: ['workout', 'nutrition', 'recovery', 'habit', 'progress'],
                   }).notNull(),
  title:           text('title').notNull(),
  body:            text('body').notNull(),
  contextSnapshot: text('context_snapshot'),
  priority:        integer('priority').notNull().default(1),
  model:           text('model'),
  generatedAt:     integer('generated_at',  { mode: 'timestamp_ms' }).notNull(),
  readAt:          integer('read_at',        { mode: 'timestamp_ms' }),
  dismissedAt:     integer('dismissed_at',   { mode: 'timestamp_ms' }),
  appliedAt:       integer('applied_at',     { mode: 'timestamp_ms' }),
});

export const aiFeedback = sqliteTable('ai_feedback', {
  id:               text('id').primaryKey(),
  recommendationId: text('recommendation_id')
                      .notNull()
                      .references(() => aiRecommendations.id, { onDelete: 'cascade' }),
  athleteId:        text('athlete_id')
                      .notNull(),
  rating:           integer('rating').notNull(),
  comment:          text('comment'),
  givenAt:          integer('given_at', { mode: 'timestamp_ms' }).notNull(),
});

export const aiContextSnapshots = sqliteTable('ai_context_snapshots', {
  id:            text('id').primaryKey(),
  athleteId:     text('athlete_id')
                   .notNull(),
  snapshotType:  text('snapshot_type', {
                   enum: ['weekly_summary', 'phase_progress', 'nutrition_week', 'pr_trend'],
                 }).notNull(),
  payload:       text('payload').notNull(),
  tokenEstimate: integer('token_estimate'),
  createdAt:     integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  expiresAt:     integer('expires_at', { mode: 'timestamp_ms' }),
});

export type AiRecommendation  = typeof aiRecommendations.$inferSelect;
export type AiContextSnapshot = typeof aiContextSnapshots.$inferSelect;

