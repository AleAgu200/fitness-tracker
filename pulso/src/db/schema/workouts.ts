import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// athleteId / coachId / createdByUserId are Better Auth user IDs — no local FK
export const programs = sqliteTable('programs', {
  id:        text('id').primaryKey(),
  athleteId: text('athlete_id').notNull(),
  coachId:   text('coach_id'),
  name:      text('name').notNull(),
  startDate: text('start_date').notNull(),
  endDate:   text('end_date'),
  active:    integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const programPhases = sqliteTable('program_phases', {
  id:         text('id').primaryKey(),
  programId:  text('program_id')
                .notNull()
                .references(() => programs.id, { onDelete: 'cascade' }),
  name:       text('name').notNull(),
  type:       text('type', {
                enum: ['volumen', 'fuerza', 'deficit', 'recomposicion'],
              }).notNull(),
  phaseOrder: integer('phase_order').notNull(),
  weekNumber: integer('week_number').notNull().default(1),
  totalWeeks: integer('total_weeks').notNull(),
  startDate:  text('start_date'),
  endDate:    text('end_date'),
});

export const exercises = sqliteTable('exercises', {
  id:              text('id').primaryKey(),
  name:            text('name').notNull(),
  muscleGroup:     text('muscle_group', {
                     enum: ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'full'],
                   }),
  equipment:       text('equipment', {
                     enum: ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'other'],
                   }),
  isCustom:        integer('is_custom', { mode: 'boolean' }).notNull().default(false),
  createdByUserId: text('created_by_user_id'),
});

export const personalRecords = sqliteTable('personal_records', {
  id:         text('id').primaryKey(),
  athleteId:  text('athlete_id')
                .notNull(),
  exerciseId: text('exercise_id')
                .notNull()
                .references(() => exercises.id, { onDelete: 'cascade' }),
  weightKg:   real('weight_kg').notNull(),
  reps:       integer('reps').notNull(),
  e1rm:       real('e1rm'),
  achievedAt: integer('achieved_at', { mode: 'timestamp_ms' }).notNull(),
  sessionId:  text('session_id'),
}, t => [
  uniqueIndex('pr_athlete_exercise').on(t.athleteId, t.exerciseId),
]);

export const workoutTemplates = sqliteTable('workout_templates', {
  id:            text('id').primaryKey(),
  programId:     text('program_id').references(() => programs.id, { onDelete: 'cascade' }),
  coachId:       text('coach_id'),
  name:          text('name').notNull(),
  sessionLabel:  text('session_label'),
  type:          text('type', {
                   enum: ['full_body', 'upper', 'lower', 'push', 'pull', 'legs'],
                 }),
  templateOrder: integer('template_order'),
  // 1 = Monday .. 7 = Sunday; null = not tied to a specific day (legacy single-plan
  // templates, and the pre-weekly-plan fallback shown until a day gets its own template)
  weekday:       integer('weekday'),
  createdAt:     integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const templateExerciseSlots = sqliteTable('template_exercise_slots', {
  id:             text('id').primaryKey(),
  templateId:     text('template_id')
                    .notNull()
                    .references(() => workoutTemplates.id, { onDelete: 'cascade' }),
  exerciseId:     text('exercise_id')
                    .notNull()
                    .references(() => exercises.id, { onDelete: 'restrict' }),
  slotOrder:      integer('slot_order').notNull(),
  targetSets:     integer('target_sets').notNull(),
  targetReps:     integer('target_reps').notNull(),
  targetRpeMin:   integer('target_rpe_min'),
  targetRpeMax:   integer('target_rpe_max'),
  targetWeightKg: real('target_weight_kg'),
  restSeconds:    integer('rest_seconds').notNull().default(90),
  stepKg:         real('step_kg').notNull().default(2.5),
  coachNotes:     text('coach_notes'),
});

export const workoutSessions = sqliteTable('workout_sessions', {
  id:             text('id').primaryKey(),
  athleteId:      text('athlete_id')
                    .notNull(),
  templateId:     text('template_id')
                    .references(() => workoutTemplates.id, { onDelete: 'set null' }),
  scheduledFor:   integer('scheduled_for', { mode: 'timestamp_ms' }),
  startedAt:      integer('started_at',    { mode: 'timestamp_ms' }),
  finishedAt:     integer('finished_at',   { mode: 'timestamp_ms' }),
  status:         text('status', {
                    enum: ['in_progress', 'completed', 'skipped'],
                  }).notNull().default('in_progress'),
  totalTonnageKg: real('total_tonnage_kg').notNull().default(0),
  coachNotes:     text('coach_notes'),
  athleteNotes:   text('athlete_notes'),
  createdAt:      integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const loggedExercises = sqliteTable('logged_exercises', {
  id:            text('id').primaryKey(),
  sessionId:     text('session_id')
                   .notNull()
                   .references(() => workoutSessions.id, { onDelete: 'cascade' }),
  exerciseId:    text('exercise_id')
                   .notNull()
                   .references(() => exercises.id, { onDelete: 'restrict' }),
  slotId:        text('slot_id')
                   .references(() => templateExerciseSlots.id, { onDelete: 'set null' }),
  exerciseOrder: integer('exercise_order').notNull(),
});

export const loggedSets = sqliteTable('logged_sets', {
  id:               text('id').primaryKey(),
  loggedExerciseId: text('logged_exercise_id')
                      .notNull()
                      .references(() => loggedExercises.id, { onDelete: 'cascade' }),
  setNumber:        integer('set_number').notNull(),
  weightKg:         real('weight_kg').notNull(),
  reps:             integer('reps').notNull(),
  rpe:              integer('rpe'),
  isPR:             integer('is_pr', { mode: 'boolean' }).notNull().default(false),
  completedAt:      integer('completed_at', { mode: 'timestamp_ms' }).notNull(),
});

export type Exercise       = typeof exercises.$inferSelect;
export type WorkoutSession = typeof workoutSessions.$inferSelect;
export type LoggedSet      = typeof loggedSets.$inferSelect;
export type PersonalRecord = typeof personalRecords.$inferSelect;

