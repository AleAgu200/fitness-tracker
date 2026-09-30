import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
  // Same library model as programs: the nutritionist's plan lives apart from
  // the athlete's own ones, and one plan is active at a time.
  origin:         text('origin', { enum: ['own', 'nutritionist', 'ai'] }).notNull().default('own'),
  createdAt:      integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  lastActivatedAt: integer('last_activated_at', { mode: 'timestamp_ms' }),
  // Deleting a plan archives it: logged meals keep pointing at its slots.
  archivedAt:     integer('archived_at', { mode: 'timestamp_ms' }),
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


/**
 * What the athlete actually ate or drank — one row per logged item, owned by
 * the athlete and a date, independent of any plan slot (removing a plan never
 * removes history). Beverages are consumptions too, so one entry adds volume
 * and nutrients exactly once. Edits bump `version` on the same row; deleting
 * leaves a tombstone so undo and sync stay idempotent.
 */
export const consumptions = sqliteTable('consumptions', {
  id:              text('id').primaryKey(),
  athleteId:       text('athlete_id').notNull(),
  /** Local calendar date the item counts for (YYYY-MM-DD). */
  localDate:       text('local_date').notNull(),
  timezone:        text('timezone'),
  /** Null when only the date is known (legacy rows). */
  occurredAt:      integer('occurred_at', { mode: 'timestamp_ms' }),
  timePrecision:   text('time_precision', { enum: ['exact', 'date_only'] }).notNull().default('exact'),
  version:         integer('version').notNull().default(1),
  /** Last version handed to the sync outbox; lower than `version` = pending. */
  enqueuedVersion: integer('enqueued_version').notNull().default(0),
  deletedAt:       integer('deleted_at', { mode: 'timestamp_ms' }),
  kind:            text('kind', { enum: ['meal', 'food', 'beverage'] }).notNull(),
  /** Meal it belongs to (DESAYUNO…); free text so plans can name their own. */
  mealLabel:       text('meal_label'),
  /** Plan slot it fulfils, if any. No FK on purpose: history outlives slots. */
  planSlotId:      text('plan_slot_id'),
  name:            text('name').notNull(),
  amount:          real('amount'),
  unit:            text('unit', { enum: ['g', 'ml'] }),
  source:          text('source', { enum: ['plan', 'library', 'catalog', 'manual', 'label', 'barcode', 'legacy'] }).notNull(),
  completeness:    text('completeness', { enum: ['complete', 'partial', 'estimated'] }).notNull(),
  /** Consumed totals, NutrientKey → number | null (null = unknown). */
  nutrientsJson:   text('nutrients_json').notNull().default('{}'),
  /** Components with their own source, basis and amount (may be empty). */
  componentsJson:  text('components_json').notNull().default('[]'),
  volumeMl:        real('volume_ml'),
  plainWater:      integer('plain_water', { mode: 'boolean' }).notNull().default(false),
  containerId:     text('container_id'),
  /** Migrated daily aggregate (old meal statuses / water glasses). */
  legacyAggregate: integer('legacy_aggregate', { mode: 'boolean' }).notNull().default(false),
  note:            text('note'),
  createdAt:       integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt:       integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, t => [
  index('consumptions_athlete_date').on(t.athleteId, t.localDate),
]);

/** Personal bottles and glasses: one tap logs capacity × usual drink. */
export const beverageContainers = sqliteTable('beverage_containers', {
  id:           text('id').primaryKey(),
  athleteId:    text('athlete_id').notNull(),
  name:         text('name').notNull(),
  capacityMl:   real('capacity_ml').notNull(),
  beverageName: text('beverage_name').notNull().default('Agua'),
  plainWater:   integer('plain_water', { mode: 'boolean' }).notNull().default(true),
  /** Saved food (ml basis) describing the usual drink's nutrients, if any. */
  savedFoodId:  text('saved_food_id'),
  sortOrder:    integer('sort_order').notNull().default(0),
  archivedAt:   integer('archived_at', { mode: 'timestamp_ms' }),
  createdAt:    integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

/** "Mis alimentos": saved products, favourites and recents, usable offline. */
export const savedFoods = sqliteTable('saved_foods', {
  id:            text('id').primaryKey(),
  athleteId:     text('athlete_id').notNull(),
  name:          text('name').notNull(),
  brand:         text('brand'),
  source:        text('source', { enum: ['catalog', 'manual', 'label', 'barcode'] }).notNull(),
  /** Catalog id or barcode the values came from. */
  sourceRef:     text('source_ref'),
  basisAmount:   real('basis_amount').notNull(),
  basisUnit:     text('basis_unit', { enum: ['g', 'ml'] }).notNull(),
  /** Nutrients per basis, NutrientKey → number | null. */
  nutrientsJson: text('nutrients_json').notNull().default('{}'),
  /** A named portion ("1 envase") and its size in the basis unit. */
  servingLabel:  text('serving_label'),
  servingAmount: real('serving_amount'),
  favorite:      integer('favorite', { mode: 'boolean' }).notNull().default(false),
  lastUsedAt:    integer('last_used_at', { mode: 'timestamp_ms' }),
  archivedAt:    integer('archived_at', { mode: 'timestamp_ms' }),
  createdAt:     integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt:     integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const nutritionSettings = sqliteTable('nutrition_settings', {
  athleteId:           text('athlete_id').primaryKey(),
  /** Null = no goal; PULSO never prescribes one on its own. */
  waterGoalMl:         real('water_goal_ml'),
  /** Set once the default containers were created, so deleting them sticks. */
  containersSeededAt:  integer('containers_seeded_at', { mode: 'timestamp_ms' }),
  updatedAt:           integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export type Consumption       = typeof consumptions.$inferSelect;
export type BeverageContainer = typeof beverageContainers.$inferSelect;
export type SavedFood         = typeof savedFoods.$inferSelect;
