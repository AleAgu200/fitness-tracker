// Everything this phone stores for one account: collected for the data export
// and wiped when the athlete deletes their account. Several accounts can share
// the phone's database, so every query is scoped to the user, following
// parent → child links for tables without an owner column.

import { eq, inArray, or, SQL, sql } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

import { db } from './index';
import {
  aiContextSnapshots,
  aiFeedback,
  aiRecommendations,
  athleteAchievements,
  athleteProfiles,
  beverageContainers,
  bodyMeasurements,
  coachMessages,
  coachProfiles,
  consumptions,
  dailyCheckIns,
  dailyNutritionLogs,
  devices,
  exercises,
  generationProfiles,
  localCareAssignments,
  localSharingConsents,
  loggedExercises,
  loggedSets,
  mealLogEntries,
  mealPlans,
  mealSlots,
  nutritionSettings,
  onboardingState,
  personalRecords,
  professionalCheckinRequests,
  professionalCheckinResponses,
  programPhases,
  programs,
  progressPhotos,
  savedFoods,
  sessionCards,
  syncOutbox,
  syncState,
  templateExerciseSlots,
  waterLogs,
  weeklySummaries,
  workoutSessions,
  workoutTemplates,
} from './schema';

/** `column IN ids`, or a never-true condition for an empty list. */
function within(column: SQLiteColumn, ids: string[]): SQL {
  return ids.length ? inArray(column, ids) : sql`0`;
}

async function ownedIds(userId: string) {
  const [programRows, sessionRows, mealPlanRows, dailyLogRows, requestRows, recommendationRows] = await Promise.all([
    db.select({ id: programs.id }).from(programs).where(eq(programs.athleteId, userId)),
    db.select({ id: workoutSessions.id, templateId: workoutSessions.templateId }).from(workoutSessions).where(eq(workoutSessions.athleteId, userId)),
    db.select({ id: mealPlans.id }).from(mealPlans).where(eq(mealPlans.athleteId, userId)),
    db.select({ id: dailyNutritionLogs.id }).from(dailyNutritionLogs).where(eq(dailyNutritionLogs.athleteId, userId)),
    db.select({ id: professionalCheckinRequests.id }).from(professionalCheckinRequests).where(eq(professionalCheckinRequests.athleteId, userId)),
    db.select({ id: aiRecommendations.id }).from(aiRecommendations).where(eq(aiRecommendations.athleteId, userId)),
  ]);
  const programIds = programRows.map(row => row.id);
  const sessionIds = sessionRows.map(row => row.id);
  // Plan templates hang from the athlete's programs; free-session templates
  // (no program) are only reachable through the athlete's sessions.
  const templateRows = await db.select({ id: workoutTemplates.id }).from(workoutTemplates).where(or(
    within(workoutTemplates.programId, programIds),
    within(workoutTemplates.id, sessionRows.flatMap(row => (row.templateId ? [row.templateId] : []))),
  ));
  const loggedRows = await db.select({ id: loggedExercises.id }).from(loggedExercises)
    .where(within(loggedExercises.sessionId, sessionIds));
  return {
    programIds,
    sessionIds,
    templateIds: templateRows.map(row => row.id),
    loggedExerciseIds: loggedRows.map(row => row.id),
    mealPlanIds: mealPlanRows.map(row => row.id),
    dailyLogIds: dailyLogRows.map(row => row.id),
    requestIds: requestRows.map(row => row.id),
    recommendationIds: recommendationRows.map(row => row.id),
  };
}

/** The account's local history, as plain rows grouped by area. */
export async function collectLocalData(userId: string) {
  const ids = await ownedIds(userId);
  const [
    profile, measurements, photos, checkIns, achievements, messages,
    plans, phases, templates, slots, sessions, logged, sets, records, cards, summaries,
    mealPlanRows, slotsMeals, dailyLogs, mealEntries, water,
    consumed, containers, foods, nutritionPrefs,
    requests, responses, care, consents, recommendations, feedback, onboarding, generation,
  ] = await Promise.all([
    db.select().from(athleteProfiles).where(eq(athleteProfiles.userId, userId)),
    db.select().from(bodyMeasurements).where(eq(bodyMeasurements.athleteId, userId)),
    db.select().from(progressPhotos).where(eq(progressPhotos.athleteId, userId)),
    db.select().from(dailyCheckIns).where(eq(dailyCheckIns.athleteId, userId)),
    db.select().from(athleteAchievements).where(eq(athleteAchievements.athleteId, userId)),
    db.select().from(coachMessages).where(or(eq(coachMessages.senderId, userId), eq(coachMessages.receiverId, userId))),
    db.select().from(programs).where(within(programs.id, ids.programIds)),
    db.select().from(programPhases).where(within(programPhases.programId, ids.programIds)),
    db.select().from(workoutTemplates).where(within(workoutTemplates.id, ids.templateIds)),
    db.select().from(templateExerciseSlots).where(within(templateExerciseSlots.templateId, ids.templateIds)),
    db.select().from(workoutSessions).where(within(workoutSessions.id, ids.sessionIds)),
    db.select().from(loggedExercises).where(within(loggedExercises.id, ids.loggedExerciseIds)),
    db.select().from(loggedSets).where(within(loggedSets.loggedExerciseId, ids.loggedExerciseIds)),
    db.select().from(personalRecords).where(eq(personalRecords.athleteId, userId)),
    db.select().from(sessionCards).where(eq(sessionCards.athleteId, userId)),
    db.select().from(weeklySummaries).where(eq(weeklySummaries.athleteId, userId)),
    db.select().from(mealPlans).where(within(mealPlans.id, ids.mealPlanIds)),
    db.select().from(mealSlots).where(within(mealSlots.mealPlanId, ids.mealPlanIds)),
    db.select().from(dailyNutritionLogs).where(within(dailyNutritionLogs.id, ids.dailyLogIds)),
    db.select().from(mealLogEntries).where(within(mealLogEntries.dailyLogId, ids.dailyLogIds)),
    db.select().from(waterLogs).where(eq(waterLogs.athleteId, userId)),
    db.select().from(consumptions).where(eq(consumptions.athleteId, userId)),
    db.select().from(beverageContainers).where(eq(beverageContainers.athleteId, userId)),
    db.select().from(savedFoods).where(eq(savedFoods.athleteId, userId)),
    db.select().from(nutritionSettings).where(eq(nutritionSettings.athleteId, userId)),
    db.select().from(professionalCheckinRequests).where(within(professionalCheckinRequests.id, ids.requestIds)),
    db.select().from(professionalCheckinResponses).where(within(professionalCheckinResponses.requestId, ids.requestIds)),
    db.select().from(localCareAssignments).where(eq(localCareAssignments.athleteId, userId)),
    db.select().from(localSharingConsents).where(eq(localSharingConsents.athleteId, userId)),
    db.select().from(aiRecommendations).where(within(aiRecommendations.id, ids.recommendationIds)),
    db.select().from(aiFeedback).where(within(aiFeedback.recommendationId, ids.recommendationIds)),
    db.select().from(onboardingState).where(eq(onboardingState.userId, userId)),
    db.select().from(generationProfiles).where(eq(generationProfiles.userId, userId)),
  ]);
  // Exercise names, so logged sets and plan slots are readable on their own.
  const exerciseIds = [...new Set([...logged.map(row => row.exerciseId), ...slots.map(row => row.exerciseId), ...records.map(row => row.exerciseId)])];
  const exerciseRows = await db.select({ id: exercises.id, name: exercises.name, muscleGroup: exercises.muscleGroup, equipment: exercises.equipment })
    .from(exercises).where(within(exercises.id, exerciseIds));

  return {
    profile: profile[0] ?? null,
    bodyMeasurements: measurements,
    progressPhotos: photos.map(({ id, takenAt }) => ({ id, takenAt })), // the images stay in your gallery
    habits: { dailyCheckIns: checkIns, achievements },
    training: {
      exercises: exerciseRows,
      plans, phases, templates, slots,
      sessions, loggedExercises: logged, sets,
      personalRecords: records,
      sessionCards: cards,
      weeklySummaries: summaries,
    },
    nutrition: {
      mealPlans: mealPlanRows, mealSlots: slotsMeals, dailyLogs, mealEntries, water,
      consumptions: consumed, containers, savedFoods: foods, settings: nutritionPrefs[0] ?? null,
    },
    team: { careAssignments: care, sharingConsents: consents, checkinRequests: requests, checkinResponses: responses, messages },
    ai: { recommendations, feedback },
    onboarding: { state: onboarding[0] ?? null, generationProfile: generation[0] ?? null },
  };
}

/** Removes everything this phone stores for the account, children first. */
export async function wipeLocalData(userId: string): Promise<void> {
  const ids = await ownedIds(userId);
  await db.transaction(async tx => {
    await tx.delete(loggedSets).where(within(loggedSets.loggedExerciseId, ids.loggedExerciseIds));
    await tx.delete(loggedExercises).where(within(loggedExercises.id, ids.loggedExerciseIds));
    await tx.delete(sessionCards).where(eq(sessionCards.athleteId, userId));
    await tx.delete(workoutSessions).where(within(workoutSessions.id, ids.sessionIds));
    await tx.delete(personalRecords).where(eq(personalRecords.athleteId, userId));
    await tx.delete(weeklySummaries).where(eq(weeklySummaries.athleteId, userId));
    await tx.delete(templateExerciseSlots).where(within(templateExerciseSlots.templateId, ids.templateIds));
    await tx.delete(workoutTemplates).where(within(workoutTemplates.id, ids.templateIds));
    await tx.delete(programPhases).where(within(programPhases.programId, ids.programIds));
    await tx.delete(programs).where(within(programs.id, ids.programIds));

    await tx.delete(mealLogEntries).where(within(mealLogEntries.dailyLogId, ids.dailyLogIds));
    await tx.delete(dailyNutritionLogs).where(within(dailyNutritionLogs.id, ids.dailyLogIds));
    await tx.delete(mealSlots).where(within(mealSlots.mealPlanId, ids.mealPlanIds));
    await tx.delete(mealPlans).where(within(mealPlans.id, ids.mealPlanIds));
    await tx.delete(waterLogs).where(eq(waterLogs.athleteId, userId));
    await tx.delete(consumptions).where(eq(consumptions.athleteId, userId));
    await tx.delete(beverageContainers).where(eq(beverageContainers.athleteId, userId));
    await tx.delete(savedFoods).where(eq(savedFoods.athleteId, userId));
    await tx.delete(nutritionSettings).where(eq(nutritionSettings.athleteId, userId));

    await tx.delete(professionalCheckinResponses).where(within(professionalCheckinResponses.requestId, ids.requestIds));
    await tx.delete(professionalCheckinRequests).where(within(professionalCheckinRequests.id, ids.requestIds));
    await tx.delete(aiFeedback).where(within(aiFeedback.recommendationId, ids.recommendationIds));
    await tx.delete(aiRecommendations).where(within(aiRecommendations.id, ids.recommendationIds));
    await tx.delete(aiContextSnapshots).where(eq(aiContextSnapshots.athleteId, userId));

    await tx.delete(bodyMeasurements).where(eq(bodyMeasurements.athleteId, userId));
    await tx.delete(progressPhotos).where(eq(progressPhotos.athleteId, userId));
    await tx.delete(dailyCheckIns).where(eq(dailyCheckIns.athleteId, userId));
    await tx.delete(athleteAchievements).where(eq(athleteAchievements.athleteId, userId));
    await tx.delete(coachMessages).where(or(eq(coachMessages.senderId, userId), eq(coachMessages.receiverId, userId)));
    await tx.delete(localCareAssignments).where(eq(localCareAssignments.athleteId, userId));
    await tx.delete(localSharingConsents).where(eq(localSharingConsents.athleteId, userId));
    await tx.delete(syncOutbox).where(eq(syncOutbox.athleteId, userId));
    await tx.delete(syncState).where(eq(syncState.athleteId, userId));
    await tx.delete(devices).where(eq(devices.userId, userId));
    await tx.delete(onboardingState).where(eq(onboardingState.userId, userId));
    await tx.delete(generationProfiles).where(eq(generationProfiles.userId, userId));
    await tx.delete(athleteProfiles).where(eq(athleteProfiles.userId, userId));
    await tx.delete(coachProfiles).where(eq(coachProfiles.userId, userId));
  });
}
