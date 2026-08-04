import { and, eq } from 'drizzle-orm';

import { db } from './index';
import { athleteProfiles, generationProfiles, onboardingState, personalRecords, workoutSessions } from './schema';

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';
export type OnboardingStep =
  | 'account' | 'body' | 'goal' | 'training' | 'nutrition' | 'safety' | 'review' | 'generating' | 'results';

export interface OnboardingProgress {
  status: OnboardingStatus;
  currentStep: OnboardingStep | null;
}

export async function getOnboardingProgress(userId: string): Promise<OnboardingProgress> {
  const rows = await db.select().from(onboardingState).where(eq(onboardingState.userId, userId)).limit(1);
  const row = rows[0];
  if (!row) return { status: 'not_started', currentStep: null };
  return { status: row.status as OnboardingStatus, currentStep: row.currentStep as OnboardingStep | null };
}

/** A saved profile or any recorded workout activity means this is an existing user, not a fresh signup. */
export async function hasExistingActivity(userId: string): Promise<boolean> {
  const [profile, session, pr] = await Promise.all([
    db.select({ userId: athleteProfiles.userId }).from(athleteProfiles).where(eq(athleteProfiles.userId, userId)).limit(1),
    db.select({ id: workoutSessions.id }).from(workoutSessions).where(eq(workoutSessions.athleteId, userId)).limit(1),
    db.select({ id: personalRecords.id }).from(personalRecords).where(eq(personalRecords.athleteId, userId)).limit(1),
  ]);
  return profile.length > 0 || session.length > 0 || pr.length > 0;
}

async function upsertOnboardingState(userId: string, values: Partial<typeof onboardingState.$inferInsert>): Promise<void> {
  const now = new Date();
  const existing = await db.select({ userId: onboardingState.userId }).from(onboardingState).where(eq(onboardingState.userId, userId)).limit(1);
  if (existing.length) {
    await db.update(onboardingState).set({ ...values, updatedAt: now }).where(eq(onboardingState.userId, userId));
  } else {
    await db.insert(onboardingState).values({ userId, status: 'not_started', schemaVersion: 1, updatedAt: now, ...values });
  }
}

async function markOnboardingSkipped(userId: string): Promise<void> {
  await upsertOnboardingState(userId, { status: 'skipped', completedAt: new Date() });
}

/** Whether the app should send this user into the onboarding flow. Existing
 *  users are auto-marked 'skipped' the first time this runs for them, so the
 *  check becomes a single cheap row lookup afterward. */
export async function shouldShowOnboarding(userId: string): Promise<boolean> {
  const progress = await getOnboardingProgress(userId);
  if (progress.status === 'completed' || progress.status === 'skipped') return false;
  // Once a user has deliberately entered the wizard, their profile/body data
  // is onboarding data rather than evidence that they are a legacy user.
  if (progress.status === 'in_progress') return true;

  if (await hasExistingActivity(userId)) {
    await markOnboardingSkipped(userId);
    return false;
  }
  return true;
}

export async function startOnboarding(userId: string): Promise<void> {
  await upsertOnboardingState(userId, { status: 'in_progress', currentStep: 'account', startedAt: new Date() });
}

export async function setOnboardingStep(userId: string, step: OnboardingStep): Promise<void> {
  await upsertOnboardingState(userId, { currentStep: step, status: 'in_progress' });
}

/** Save a late screen effect without reviving an already completed wizard. */
export async function setOnboardingStepIfInProgress(
  userId: string,
  step: OnboardingStep,
): Promise<void> {
  await db.update(onboardingState)
    .set({ currentStep: step, updatedAt: new Date() })
    .where(and(
      eq(onboardingState.userId, userId),
      eq(onboardingState.status, 'in_progress'),
    ));
}

export async function completeOnboarding(userId: string): Promise<void> {
  await upsertOnboardingState(userId, { status: 'completed', currentStep: null, completedAt: new Date() });
}

// ── generation profile (draft answers + consent) ────────────────────────────

export type Goal = 'fat_loss' | 'muscle_gain' | 'strength' | 'recomposition' | 'maintenance';
export type Pace = 'slow' | 'moderate' | 'aggressive';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type TrainingLocation = 'gym' | 'home' | 'outdoor';
export type DietaryStyle = 'omnivoro' | 'vegetariano' | 'vegano' | 'pescetariano';
export type CookingTimeBudget = 'minimal' | 'moderate' | 'flexible';
export type BudgetLevel = 'low' | 'medium' | 'high';

export interface GenerationProfileDraft {
  goal?: Goal;
  pace?: Pace;
  experienceLevel?: ExperienceLevel;
  daysPerWeek?: number;
  sessionMinutes?: number;
  activityOutsideTraining?: ActivityLevel;
  availableEquipment?: string[];
  trainingLocation?: TrainingLocation;
  injuriesAndLimitations?: string[];
  excludedExercises?: string[];
  dietaryStyle?: DietaryStyle;
  allergies?: string[];
  intolerances?: string[];
  dislikedFoods?: string[];
  mealsPerDay?: number;
  preferredMealTimes?: string[];
  cookingTimeBudget?: CookingTimeBudget;
  budgetLevel?: BudgetLevel;
  hondurasLatinPreference?: boolean;
  isPregnantOrBreastfeeding?: boolean;
  hasEatingDisorderHistory?: boolean;
  hasUncontrolledMedicalCondition?: boolean;
}

export interface GenerationProfile extends GenerationProfileDraft {
  consentedToExternalProcessing: boolean;
  consentedAt: Date | null;
}

type GenerationProfileInsert = typeof generationProfiles.$inferInsert;
type GenerationProfileRow = typeof generationProfiles.$inferSelect;

function encodeDraft(draft: GenerationProfileDraft): Partial<GenerationProfileInsert> {
  const out: Partial<GenerationProfileInsert> = {};
  if (draft.goal !== undefined) out.goal = draft.goal;
  if (draft.pace !== undefined) out.pace = draft.pace;
  if (draft.experienceLevel !== undefined) out.experienceLevel = draft.experienceLevel;
  if (draft.daysPerWeek !== undefined) out.daysPerWeek = draft.daysPerWeek;
  if (draft.sessionMinutes !== undefined) out.sessionMinutes = draft.sessionMinutes;
  if (draft.activityOutsideTraining !== undefined) out.activityOutsideTraining = draft.activityOutsideTraining;
  if (draft.availableEquipment !== undefined) out.availableEquipment = JSON.stringify(draft.availableEquipment);
  if (draft.trainingLocation !== undefined) out.trainingLocation = draft.trainingLocation;
  if (draft.injuriesAndLimitations !== undefined) out.injuriesAndLimitations = JSON.stringify(draft.injuriesAndLimitations);
  if (draft.excludedExercises !== undefined) out.excludedExercises = JSON.stringify(draft.excludedExercises);
  if (draft.dietaryStyle !== undefined) out.dietaryStyle = draft.dietaryStyle;
  if (draft.allergies !== undefined) out.allergies = JSON.stringify(draft.allergies);
  if (draft.intolerances !== undefined) out.intolerances = JSON.stringify(draft.intolerances);
  if (draft.dislikedFoods !== undefined) out.dislikedFoods = JSON.stringify(draft.dislikedFoods);
  if (draft.mealsPerDay !== undefined) out.mealsPerDay = draft.mealsPerDay;
  if (draft.preferredMealTimes !== undefined) out.preferredMealTimes = JSON.stringify(draft.preferredMealTimes);
  if (draft.cookingTimeBudget !== undefined) out.cookingTimeBudget = draft.cookingTimeBudget;
  if (draft.budgetLevel !== undefined) out.budgetLevel = draft.budgetLevel;
  if (draft.hondurasLatinPreference !== undefined) out.hondurasLatinPreference = draft.hondurasLatinPreference;
  if (draft.isPregnantOrBreastfeeding !== undefined) out.isPregnantOrBreastfeeding = draft.isPregnantOrBreastfeeding;
  if (draft.hasEatingDisorderHistory !== undefined) out.hasEatingDisorderHistory = draft.hasEatingDisorderHistory;
  if (draft.hasUncontrolledMedicalCondition !== undefined) out.hasUncontrolledMedicalCondition = draft.hasUncontrolledMedicalCondition;
  return out;
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function decodeRow(row: GenerationProfileRow): GenerationProfile {
  return {
    goal: row.goal ?? undefined,
    pace: row.pace ?? undefined,
    experienceLevel: row.experienceLevel ?? undefined,
    daysPerWeek: row.daysPerWeek ?? undefined,
    sessionMinutes: row.sessionMinutes ?? undefined,
    activityOutsideTraining: row.activityOutsideTraining ?? undefined,
    availableEquipment: parseJsonArray(row.availableEquipment),
    trainingLocation: row.trainingLocation ?? undefined,
    injuriesAndLimitations: parseJsonArray(row.injuriesAndLimitations),
    excludedExercises: parseJsonArray(row.excludedExercises),
    dietaryStyle: row.dietaryStyle ?? undefined,
    allergies: parseJsonArray(row.allergies),
    intolerances: parseJsonArray(row.intolerances),
    dislikedFoods: parseJsonArray(row.dislikedFoods),
    mealsPerDay: row.mealsPerDay ?? undefined,
    preferredMealTimes: parseJsonArray(row.preferredMealTimes),
    cookingTimeBudget: row.cookingTimeBudget ?? undefined,
    budgetLevel: row.budgetLevel ?? undefined,
    hondurasLatinPreference: row.hondurasLatinPreference ?? undefined,
    isPregnantOrBreastfeeding: row.isPregnantOrBreastfeeding ?? undefined,
    hasEatingDisorderHistory: row.hasEatingDisorderHistory ?? undefined,
    hasUncontrolledMedicalCondition: row.hasUncontrolledMedicalCondition ?? undefined,
    consentedToExternalProcessing: row.consentedToExternalProcessing,
    consentedAt: row.consentedAt,
  };
}

export async function getGenerationProfile(userId: string): Promise<GenerationProfile | null> {
  const rows = await db.select().from(generationProfiles).where(eq(generationProfiles.userId, userId)).limit(1);
  return rows[0] ? decodeRow(rows[0]) : null;
}

/** Shallow-merges into whatever draft answers already exist for this user. */
export async function saveGenerationProfileDraft(userId: string, draft: GenerationProfileDraft): Promise<void> {
  const now = new Date();
  const values = encodeDraft(draft);
  const existing = await db.select({ userId: generationProfiles.userId }).from(generationProfiles).where(eq(generationProfiles.userId, userId)).limit(1);
  if (existing.length) {
    await db.update(generationProfiles).set({ ...values, updatedAt: now }).where(eq(generationProfiles.userId, userId));
  } else {
    await db.insert(generationProfiles).values({ userId, updatedAt: now, ...values });
  }
}

export async function setGenerationConsent(userId: string, consented: boolean): Promise<void> {
  const now = new Date();
  const values = { consentedToExternalProcessing: consented, consentedAt: consented ? now : null, updatedAt: now };
  const existing = await db.select({ userId: generationProfiles.userId }).from(generationProfiles).where(eq(generationProfiles.userId, userId)).limit(1);
  if (existing.length) {
    await db.update(generationProfiles).set(values).where(eq(generationProfiles.userId, userId));
  } else {
    await db.insert(generationProfiles).values({ userId, ...values });
  }
}

/** Clears the local draft after a plan is accepted (or onboarding is abandoned) — nothing here should outlive that. */
export async function clearGenerationProfile(userId: string): Promise<void> {
  await db.delete(generationProfiles).where(eq(generationProfiles.userId, userId));
}
