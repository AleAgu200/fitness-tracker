import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// userId / coachId are Better Auth user IDs — no local FK since users live on the server
export const athleteProfiles = sqliteTable('athlete_profiles', {
  userId:       text('user_id').primaryKey(),
  coachId:      text('coach_id'),
  fullName:     text('full_name').notNull(),
  initials:     text('initials').notNull(),
  dateOfBirth:  text('date_of_birth'),
  sex:          text('sex', { enum: ['M', 'F', 'X'] }),
  heightCm:     real('height_cm'),
  goalWeightKg: real('goal_weight_kg'),
  notes:        text('notes'),
  createdAt:    integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt:    integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const coachProfiles = sqliteTable('coach_profiles', {
  userId:         text('user_id').primaryKey(),
  fullName:       text('full_name').notNull(),
  initials:       text('initials').notNull(),
  bio:            text('bio'),
  specialization: text('specialization'),
  createdAt:      integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt:      integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const bodyMeasurements = sqliteTable('body_measurements', {
  id:            text('id').primaryKey(),
  athleteId:     text('athlete_id').notNull(),
  measuredAt:    integer('measured_at', { mode: 'timestamp_ms' }).notNull(),
  weightKg:      real('weight_kg').notNull(),
  bodyFatPct:    real('body_fat_pct'),
  muscleMassPct: real('muscle_mass_pct'),
  notes:         text('notes'),
  syncVersion:   integer('sync_version').notNull().default(0),
});

export const progressPhotos = sqliteTable('progress_photos', {
  id:        text('id').primaryKey(),
  athleteId: text('athlete_id').notNull(),
  takenAt:   integer('taken_at', { mode: 'timestamp_ms' }).notNull(),
  localUri:  text('local_uri').notNull(),
  angle:     text('angle', { enum: ['front', 'back', 'side'] }),
  phaseId:   text('phase_id'),
});

export type AthleteProfile  = typeof athleteProfiles.$inferSelect;
export type BodyMeasurement = typeof bodyMeasurements.$inferSelect;
