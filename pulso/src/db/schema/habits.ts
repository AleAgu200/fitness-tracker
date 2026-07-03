import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';


export const dailyCheckIns = sqliteTable('daily_check_ins', {
  id:                 text('id').primaryKey(),
  athleteId:          text('athlete_id')
                        .notNull(),
  date:               text('date').notNull(),
  workoutCompleted:   integer('workout_completed',   { mode: 'boolean' }).notNull().default(false),
  nutritionCompleted: integer('nutrition_completed', { mode: 'boolean' }).notNull().default(false),
  hydrationCompleted: integer('hydration_completed', { mode: 'boolean' }).notNull().default(false),
  streakDay:          integer('streak_day').notNull().default(0),
}, t => [
  uniqueIndex('checkin_athlete_date').on(t.athleteId, t.date),
]);

export const achievementDefinitions = sqliteTable('achievement_definitions', {
  id:             text('id').primaryKey(),
  key:            text('key').notNull().unique(),
  name:           text('name').notNull(),
  description:    text('description'),
  icon:           text('icon'),
  conditionType:  text('condition_type', {
                    enum: [
                      'pr_count', 'streak_days', 'weight_lost_kg',
                      'session_count', 'nutrition_adherence', 'custom',
                    ],
                  }).notNull(),
  conditionValue: real('condition_value'),
});

export const athleteAchievements = sqliteTable('athlete_achievements', {
  id:            text('id').primaryKey(),
  athleteId:     text('athlete_id')
                   .notNull(),
  achievementId: text('achievement_id')
                   .notNull()
                   .references(() => achievementDefinitions.id, { onDelete: 'cascade' }),
  earnedAt:      integer('earned_at', { mode: 'timestamp_ms' }).notNull(),
}, t => [
  uniqueIndex('achievement_athlete_def').on(t.athleteId, t.achievementId),
]);

export const coachMessages = sqliteTable('coach_messages', {
  id:         text('id').primaryKey(),
  senderId:   text('sender_id')
                .notNull(),
  receiverId: text('receiver_id')
                .notNull(),
  content:    text('content').notNull(),
  sentAt:     integer('sent_at', { mode: 'timestamp_ms' }).notNull(),
  readAt:     integer('read_at', { mode: 'timestamp_ms' }),
});

export type DailyCheckIn          = typeof dailyCheckIns.$inferSelect;
export type AchievementDefinition = typeof achievementDefinitions.$inferSelect;
export type AthleteAchievement    = typeof athleteAchievements.$inferSelect;

