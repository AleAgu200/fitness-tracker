import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Tracks progress through the onboarding flow — separate from generationProfiles
// so the wizard's position survives even if the answers below are still empty.
export const onboardingState = sqliteTable('onboarding_state', {
  userId:        text('user_id').primaryKey(),
  status:        text('status', {
                   enum: ['not_started', 'in_progress', 'completed', 'skipped'],
                 }).notNull().default('not_started'),
  currentStep:   text('current_step', {
                   enum: ['account', 'body', 'goal', 'training', 'nutrition', 'safety', 'review', 'generating', 'results'],
                 }),
  schemaVersion: integer('schema_version').notNull().default(1),
  startedAt:     integer('started_at', { mode: 'timestamp_ms' }),
  completedAt:   integer('completed_at', { mode: 'timestamp_ms' }),
  updatedAt:     integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * Local-only onboarding answers used to build an AI generation request.
 * Deliberately does not duplicate dateOfBirth/heightCm/weight/sex — those
 * already live in athleteProfiles (saved via the existing profile screens).
 * List-type answers are stored as JSON-encoded text, matching this codebase's
 * existing convention for free-form payloads (see assignments/ai snapshots).
 */
export const generationProfiles = sqliteTable('generation_profiles', {
  userId: text('user_id').primaryKey(),

  // goal
  goal: text('goal', {
    enum: ['fat_loss', 'muscle_gain', 'strength', 'recomposition', 'maintenance'],
  }),
  pace: text('pace', { enum: ['slow', 'moderate', 'aggressive'] }),

  // training
  experienceLevel: text('experience_level', { enum: ['beginner', 'intermediate', 'advanced'] }),
  daysPerWeek:     integer('days_per_week'),
  sessionMinutes:  integer('session_minutes'),
  activityOutsideTraining: text('activity_outside_training', {
    enum: ['sedentary', 'light', 'moderate', 'active', 'very_active'],
  }),
  availableEquipment:     text('available_equipment'), // JSON string[]
  trainingLocation:       text('training_location', { enum: ['gym', 'home', 'outdoor'] }),
  injuriesAndLimitations: text('injuries_and_limitations'), // JSON string[]
  excludedExercises:      text('excluded_exercises'), // JSON string[]

  // nutrition
  dietaryStyle: text('dietary_style', {
    enum: ['omnivoro', 'vegetariano', 'vegano', 'pescetariano'],
  }),
  allergies:           text('allergies'), // JSON string[]
  intolerances:        text('intolerances'), // JSON string[]
  dislikedFoods:       text('disliked_foods'), // JSON string[]
  mealsPerDay:         integer('meals_per_day'),
  preferredMealTimes:  text('preferred_meal_times'), // JSON string[]
  cookingTimeBudget:   text('cooking_time_budget', { enum: ['minimal', 'moderate', 'flexible'] }),
  budgetLevel:         text('budget_level', { enum: ['low', 'medium', 'high'] }),
  hondurasLatinPreference: integer('honduras_latin_preference', { mode: 'boolean' }),

  // safety screening answers (see server calculator's screenSafety)
  isPregnantOrBreastfeeding:       integer('is_pregnant_or_breastfeeding', { mode: 'boolean' }),
  hasEatingDisorderHistory:        integer('has_eating_disorder_history', { mode: 'boolean' }),
  hasUncontrolledMedicalCondition: integer('has_uncontrolled_medical_condition', { mode: 'boolean' }),

  // consent — required before any onboarding data is sent off-device
  consentedToExternalProcessing: integer('consented_to_external_processing', { mode: 'boolean' }).notNull().default(false),
  consentedAt: integer('consented_at', { mode: 'timestamp_ms' }),

  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export type OnboardingState    = typeof onboardingState.$inferSelect;
export type GenerationProfileRow = typeof generationProfiles.$inferSelect;
