// Reads a full personal snapshot from the phone's database and writes one
// back. Everything is scoped to one account (several can share the phone).
// Restoring only ever adds rows by their stable IDs — it never overwrites a
// row the phone already has — so a repeated restore or import is a no-op and
// newer local edits always survive.

import { and, eq, getTableColumns, inArray, isNull, ne } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';

import { BACKUP_TABLES, BackupTable, KEY_COLUMN, Row, SnapshotTables } from '@/lib/backup-format';
import { ownedIds, within } from './account-data';
import { db } from './index';
import {
  achievementDefinitions,
  aiFeedback,
  aiRecommendations,
  athleteAchievements,
  athleteProfiles,
  beverageContainers,
  bodyMeasurements,
  consumptions,
  dailyCheckIns,
  dailyNutritionLogs,
  exercises,
  generationProfiles,
  loggedExercises,
  loggedSets,
  mealLogEntries,
  mealPlans,
  mealSlots,
  mealSlotSkips,
  nutritionSettings,
  onboardingState,
  programPhases,
  programs,
  savedFoods,
  sessionCards,
  sleepEntries,
  templateExerciseSlots,
  waterLogs,
  weeklySummaries,
  workoutSessions,
  workoutTemplates,
} from './schema';
import { recomputeAllRecords } from './workout';

export const TABLES: Record<BackupTable, SQLiteTable> = {
  athlete_profiles: athleteProfiles,
  onboarding_state: onboardingState,
  generation_profiles: generationProfiles,
  nutrition_settings: nutritionSettings,
  exercises,
  programs,
  program_phases: programPhases,
  workout_templates: workoutTemplates,
  template_exercise_slots: templateExerciseSlots,
  workout_sessions: workoutSessions,
  logged_exercises: loggedExercises,
  logged_sets: loggedSets,
  session_cards: sessionCards,
  weekly_summaries: weeklySummaries,
  body_measurements: bodyMeasurements,
  sleep_entries: sleepEntries,
  daily_check_ins: dailyCheckIns,
  athlete_achievements: athleteAchievements,
  meal_plans: mealPlans,
  meal_slots: mealSlots,
  meal_slot_skips: mealSlotSkips,
  daily_nutrition_logs: dailyNutritionLogs,
  meal_log_entries: mealLogEntries,
  water_logs: waterLogs,
  saved_foods: savedFoods,
  beverage_containers: beverageContainers,
  consumptions,
  ai_recommendations: aiRecommendations,
  ai_feedback: aiFeedback,
};

/** Every row of the account that a snapshot covers, by table. */
export async function collectBackupTables(userId: string): Promise<SnapshotTables> {
  const ids = await ownedIds(userId);
  const [
    profile, onboarding, generation, nutrition,
    plans, phases, templates, slots, sessions, logged, sets, cards, summaries,
    measurements, sleep, checkIns, achievements,
    mealPlanRows, mealSlotRows, dailyLogs, mealEntries, water, foods, containers, consumed,
    recommendations, feedback,
  ] = await Promise.all([
    db.select().from(athleteProfiles).where(eq(athleteProfiles.userId, userId)),
    db.select().from(onboardingState).where(eq(onboardingState.userId, userId)),
    db.select().from(generationProfiles).where(eq(generationProfiles.userId, userId)),
    db.select().from(nutritionSettings).where(eq(nutritionSettings.athleteId, userId)),
    db.select().from(programs).where(within(programs.id, ids.programIds)),
    db.select().from(programPhases).where(within(programPhases.programId, ids.programIds)),
    db.select().from(workoutTemplates).where(within(workoutTemplates.id, ids.templateIds)),
    db.select().from(templateExerciseSlots).where(within(templateExerciseSlots.templateId, ids.templateIds)),
    db.select().from(workoutSessions).where(within(workoutSessions.id, ids.sessionIds)),
    db.select().from(loggedExercises).where(within(loggedExercises.id, ids.loggedExerciseIds)),
    db.select().from(loggedSets).where(within(loggedSets.loggedExerciseId, ids.loggedExerciseIds)),
    db.select().from(sessionCards).where(eq(sessionCards.athleteId, userId)),
    db.select().from(weeklySummaries).where(eq(weeklySummaries.athleteId, userId)),
    // Imported weights stay on the phone (see BACKUP_EXCLUSIONS).
    db.select().from(bodyMeasurements).where(and(eq(bodyMeasurements.athleteId, userId), eq(bodyMeasurements.source, 'manual'))),
    db.select().from(sleepEntries).where(eq(sleepEntries.athleteId, userId)),
    db.select().from(dailyCheckIns).where(eq(dailyCheckIns.athleteId, userId)),
    db.select().from(athleteAchievements).where(eq(athleteAchievements.athleteId, userId)),
    db.select().from(mealPlans).where(within(mealPlans.id, ids.mealPlanIds)),
    db.select().from(mealSlots).where(within(mealSlots.mealPlanId, ids.mealPlanIds)),
    db.select().from(dailyNutritionLogs).where(within(dailyNutritionLogs.id, ids.dailyLogIds)),
    db.select().from(mealLogEntries).where(within(mealLogEntries.dailyLogId, ids.dailyLogIds)),
    db.select().from(waterLogs).where(eq(waterLogs.athleteId, userId)),
    db.select().from(savedFoods).where(eq(savedFoods.athleteId, userId)),
    db.select().from(beverageContainers).where(eq(beverageContainers.athleteId, userId)),
    db.select().from(consumptions).where(eq(consumptions.athleteId, userId)),
    db.select().from(aiRecommendations).where(within(aiRecommendations.id, ids.recommendationIds)),
    db.select().from(aiFeedback).where(within(aiFeedback.recommendationId, ids.recommendationIds)),
  ]);
  const skips = await db.select().from(mealSlotSkips).where(within(mealSlotSkips.slotId, mealSlotRows.map(row => row.id)));
  // Full rows of every exercise the history or plans point at (custom ones included).
  const exerciseIds = [...new Set([...slots.map(row => row.exerciseId), ...logged.map(row => row.exerciseId)])];
  const exerciseRows = await db.select().from(exercises).where(within(exercises.id, exerciseIds));

  return {
    athlete_profiles: profile,
    onboarding_state: onboarding,
    generation_profiles: generation,
    nutrition_settings: nutrition,
    exercises: exerciseRows,
    programs: plans,
    program_phases: phases,
    workout_templates: templates,
    template_exercise_slots: slots,
    workout_sessions: sessions,
    logged_exercises: logged,
    logged_sets: sets,
    session_cards: cards,
    weekly_summaries: summaries,
    body_measurements: measurements,
    sleep_entries: sleep,
    daily_check_ins: checkIns,
    athlete_achievements: achievements,
    meal_plans: mealPlanRows,
    meal_slots: mealSlotRows,
    meal_slot_skips: skips,
    daily_nutrition_logs: dailyLogs,
    meal_log_entries: mealEntries,
    water_logs: water,
    saved_foods: foods,
    beverage_containers: containers,
    consumptions: consumed,
    ai_recommendations: recommendations,
    ai_feedback: feedback,
  } satisfies Record<BackupTable, unknown[]> as SnapshotTables;
}

/** Whether the phone already holds history for this account (not just a profile). */
export async function hasLocalHistory(userId: string): Promise<boolean> {
  const [session, consumed, measurement, plan] = await Promise.all([
    db.select({ id: workoutSessions.id }).from(workoutSessions).where(eq(workoutSessions.athleteId, userId)).limit(1),
    db.select({ id: consumptions.id }).from(consumptions).where(eq(consumptions.athleteId, userId)).limit(1),
    db.select({ id: bodyMeasurements.id }).from(bodyMeasurements)
      .where(and(eq(bodyMeasurements.athleteId, userId), eq(bodyMeasurements.source, 'manual'))).limit(2),
    db.select({ id: programs.id }).from(programs).where(and(eq(programs.athleteId, userId), ne(programs.origin, 'coach'))).limit(1),
  ]);
  // One measurement is what profile sync restores on its own; it is not history.
  return session.length > 0 || consumed.length > 0 || measurement.length > 1 || plan.length > 0;
}

export async function listLocalExercises(): Promise<{ id: string; name: string }[]> {
  return db.select({ id: exercises.id, name: exercises.name }).from(exercises);
}

/** JSON carries timestamps as ms or ISO strings; Drizzle's timestamp columns need Dates. */
export function toInsertRow(table: SQLiteTable, row: Row): Row {
  const columns = getTableColumns(table) as Record<string, { dataType: string }>;
  const result: Row = {};
  for (const [key, column] of Object.entries(columns)) {
    if (!(key in row)) continue;
    const value = row[key];
    if (column.dataType === 'date' && value != null) {
      const date = typeof value === 'number' ? new Date(value) : new Date(String(value));
      result[key] = Number.isNaN(date.getTime()) ? null : date;
    } else {
      result[key] = value;
    }
  }
  return result;
}

export interface ApplyResult {
  /** Rows added, per table. */
  inserted: Partial<Record<BackupTable, number>>;
  /** Rows the phone already had (kept as they are). */
  kept: number;
  totalInserted: number;
}

const BATCH = 40;

/**
 * Writes validated snapshot tables in one transaction: everything or nothing.
 * Existing rows win (newer local edits are kept), so repeating it changes
 * nothing. Afterwards one plan and one meal plan stay active — the
 * snapshot's — and records are recomputed from the surviving sets.
 */
export async function applySnapshotTables(
  userId: string,
  tables: SnapshotTables,
  active: { programId: string | null; mealPlanId: string | null },
): Promise<ApplyResult> {
  const knownAchievements = new Set((await db.select({ id: achievementDefinitions.id }).from(achievementDefinitions)).map(row => row.id));
  const result: ApplyResult = { inserted: {}, kept: 0, totalInserted: 0 };

  await db.transaction(async tx => {
    // A coach's or nutritionist's plan may already have been re-applied on
    // this phone (assignment sync runs at load) under a new ID. The snapshot's
    // copy carries the history, so the fresh duplicate is archived below.
    const snapshotIds = (rows: Row[] | undefined) => new Set((rows ?? []).map(row => row.id as string));
    const [localCoachPrograms, localNutritionistPlans] = await Promise.all([
      tx.select({ id: programs.id }).from(programs)
        .where(and(eq(programs.athleteId, userId), eq(programs.origin, 'coach'), isNull(programs.archivedAt))),
      tx.select({ id: mealPlans.id }).from(mealPlans)
        .where(and(eq(mealPlans.athleteId, userId), eq(mealPlans.origin, 'nutritionist'), isNull(mealPlans.archivedAt))),
    ]);

    for (const name of BACKUP_TABLES) {
      let rows = tables[name] ?? [];
      if (name === 'athlete_achievements') rows = rows.filter(row => knownAchievements.has(row.achievementId as string));
      if (!rows.length) continue;
      const table = TABLES[name];
      const key = KEY_COLUMN[name];
      const keyColumn = (getTableColumns(table) as Record<string, unknown>)[key];
      let inserted = 0;
      for (let start = 0; start < rows.length; start += BATCH) {
        const batch = rows.slice(start, start + BATCH).map(row => toInsertRow(table, row));
        const written = await tx.insert(table).values(batch as never).onConflictDoNothing()
          .returning({ key: keyColumn as never });
        inserted += written.length;
      }
      result.inserted[name] = inserted;
      result.totalInserted += inserted;
      result.kept += rows.length - inserted;
    }

    const snapshotPrograms = snapshotIds(tables.programs);
    const snapshotMealPlans = snapshotIds(tables.meal_plans);
    const restoredCoach = (tables.programs ?? []).some(row => row.origin === 'coach' && row.archivedAt == null);
    const restoredNutritionist = (tables.meal_plans ?? []).some(row => row.origin === 'nutritionist' && row.archivedAt == null);
    const now = new Date();
    const strayPrograms = localCoachPrograms.map(row => row.id).filter(id => !snapshotPrograms.has(id));
    if (restoredCoach && strayPrograms.length) {
      await tx.update(programs).set({ archivedAt: now, active: false }).where(inArray(programs.id, strayPrograms));
    }
    const strayMealPlans = localNutritionistPlans.map(row => row.id).filter(id => !snapshotMealPlans.has(id));
    if (restoredNutritionist && strayMealPlans.length) {
      await tx.update(mealPlans).set({ archivedAt: now, active: false }).where(inArray(mealPlans.id, strayMealPlans));
    }

    // A finished onboarding in the snapshot beats a wizard this phone only
    // started (or never started): a returning athlete never sees it again.
    const onboarding = tables.onboarding_state?.[0];
    if (onboarding && (onboarding.status === 'completed' || onboarding.status === 'skipped')) {
      const completedAt = toInsertRow(onboardingState, onboarding).completedAt as Date | null | undefined;
      await tx.update(onboardingState)
        .set({ status: onboarding.status, currentStep: null, completedAt: completedAt ?? new Date(), updatedAt: new Date() })
        .where(and(eq(onboardingState.userId, userId), inArray(onboardingState.status, ['not_started', 'in_progress'])));
    }

    // One active plan of each kind afterwards: the one asked for, if it exists.
    if (active.programId) {
      const [target] = await tx.select({ id: programs.id }).from(programs)
        .where(and(eq(programs.id, active.programId), eq(programs.athleteId, userId))).limit(1);
      if (target) {
        await tx.update(programs).set({ active: false })
          .where(and(eq(programs.athleteId, userId), ne(programs.id, target.id)));
        await tx.update(programs).set({ active: true }).where(eq(programs.id, target.id));
      }
    }
    if (active.mealPlanId) {
      const [target] = await tx.select({ id: mealPlans.id }).from(mealPlans)
        .where(and(eq(mealPlans.id, active.mealPlanId), eq(mealPlans.athleteId, userId))).limit(1);
      if (target) {
        await tx.update(mealPlans).set({ active: false })
          .where(and(eq(mealPlans.athleteId, userId), ne(mealPlans.id, target.id)));
        await tx.update(mealPlans).set({ active: true }).where(eq(mealPlans.id, target.id));
      }
    }
  });

  await recomputeAllRecords(userId);
  return result;
}

/** The plans this phone uses now, so an import keeps them active. */
export async function currentActivePlans(userId: string): Promise<{ programId: string | null; mealPlanId: string | null }> {
  const [[program], [mealPlan]] = await Promise.all([
    db.select({ id: programs.id }).from(programs).where(and(eq(programs.athleteId, userId), eq(programs.active, true))).limit(1),
    db.select({ id: mealPlans.id }).from(mealPlans).where(and(eq(mealPlans.athleteId, userId), eq(mealPlans.active, true))).limit(1),
  ]);
  return { programId: program?.id ?? null, mealPlanId: mealPlan?.id ?? null };
}

/** IDs from a snapshot that already exist on the phone, to preview what an import adds. */
export async function countExisting(tables: SnapshotTables): Promise<number> {
  let existing = 0;
  for (const name of BACKUP_TABLES) {
    const rows = tables[name] ?? [];
    if (!rows.length) continue;
    const table = TABLES[name];
    const keyColumn = (getTableColumns(table) as Record<string, unknown>)[KEY_COLUMN[name]];
    const keys = rows.map(row => row[KEY_COLUMN[name]] as string);
    for (let start = 0; start < keys.length; start += 400) {
      const found = await db.select({ key: keyColumn as never }).from(table)
        .where(inArray(keyColumn as never, keys.slice(start, start + 400)));
      existing += found.length;
    }
  }
  return existing;
}
