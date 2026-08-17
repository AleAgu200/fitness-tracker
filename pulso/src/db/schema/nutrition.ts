import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { programPhases } from './workouts';

export const mealPlans = sqliteTable('meal_plans', {
  id:             text('id').primaryKey(),
  athleteId:      text('athlete_id')
                    .notNull(),
  coachId:        text('coach_id'),
  name:           text('name').notNull(),
  targetKcal:     integer('target_kcal').notNull(),
  targetProteinG: integer('target_protein_g').notNull(),
  targetCarbsG:   integer('target_carbs_g').notNull(),
  targetFatG:     integer('target_fat_g').notNull(),
  phaseId:        text('phase_id').references(() => programPhases.id, { onDelete: 'set null' }),
  active:         integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt:      integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const mealSlots = sqliteTable('meal_slots', {
  id:             text('id').primaryKey(),
  mealPlanId:     text('meal_plan_id')
                    .notNull()
                    .references(() => mealPlans.id, { onDelete: 'cascade' }),
  // Uses lib/dates weekdayOf(): 1 = Sunday .. 7 = Saturday, the same numbering
  // as workout_templates.weekday — NOT the server's 1 = Monday, which
  // results.tsx converts on the way in.
  //
  // Plans used to be a single daily template shared by every day; existing rows
  // land on the default and are expanded across the week on first read, so a
  // device upgrading mid-week keeps showing its meals.
  weekday:        integer('weekday').notNull().default(1),
  name:           text('name').notNull(),
  scheduledTime:  text('scheduled_time'),
  slotOrder:      integer('slot_order').notNull(),
  defaultName:    text('default_name').notNull(),
  targetKcal:     integer('target_kcal'),
  targetProteinG: integer('target_protein_g'),
  targetCarbsG:   integer('target_carbs_g'),
  targetFatG:     integer('target_fat_g'),
});

export const dailyNutritionLogs = sqliteTable('daily_nutrition_logs', {
  id:         text('id').primaryKey(),
  athleteId:  text('athlete_id')
                .notNull(),
  date:       text('date').notNull(),
  mealPlanId: text('meal_plan_id').references(() => mealPlans.id, { onDelete: 'set null' }),
  createdAt:  integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, t => [
  uniqueIndex('daily_nutrition_athlete_date').on(t.athleteId, t.date),
]);

export const mealLogEntries = sqliteTable('meal_log_entries', {
  id:             text('id').primaryKey(),
  dailyLogId:     text('daily_log_id')
                    .notNull()
                    .references(() => dailyNutritionLogs.id, { onDelete: 'cascade' }),
  slotId:         text('slot_id')
                    .notNull()
                    .references(() => mealSlots.id, { onDelete: 'restrict' }),
  status:         text('status', {
                    enum: ['completed', 'substituted', 'pending'],
                  }).notNull().default('pending'),
  substituteNote: text('substitute_note'),
  loggedAt:       integer('logged_at', { mode: 'timestamp_ms' }),
  syncVersion:    integer('sync_version').notNull().default(0),
}, t => [
  uniqueIndex('meal_entry_log_slot').on(t.dailyLogId, t.slotId),
]);

export const waterLogs = sqliteTable('water_logs', {
  id:        text('id').primaryKey(),
  athleteId: text('athlete_id')
               .notNull(),
  date:      text('date').notNull(),
  glasses:   integer('glasses').notNull().default(0),
  mlTotal:   integer('ml_total').notNull().default(0),
}, t => [
  uniqueIndex('water_athlete_date').on(t.athleteId, t.date),
]);

export type MealPlan      = typeof mealPlans.$inferSelect;
export type MealLogEntry  = typeof mealLogEntries.$inferSelect;
export type WaterLog      = typeof waterLogs.$inferSelect;

