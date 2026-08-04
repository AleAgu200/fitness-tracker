import { z } from "zod";

import { listExercises, listFoods } from "@/lib/library";
import { listAllWgerExercises } from "@/lib/wger";

import {
  calculateTargets,
  screenSafety,
  type ActivityLevel,
  type Goal,
  type Pace,
  type Sex,
} from "./calculator";
import {
  filterEligibleExercises,
  filterEligibleFoods,
  mapLimitationsToExcludedMuscleGroups,
  type DietaryStyle,
} from "./eligibility";
import { generatePlan, type GenerationProgress } from "./openrouter";
import type {
  EligibleExercise,
  EligibleFood,
  GeneratedPlan,
  GenerationInput,
} from "./schema";

export interface RawGenerationRequest {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activityOutsideTraining: ActivityLevel;
  goal: Goal;
  pace: Pace;
  experienceLevel: "beginner" | "intermediate" | "advanced";
  daysPerWeek: number;
  sessionMinutes: number;
  mealsPerDay: number;
  availableEquipment?: string[];
  trainingLocation?: "gym" | "home" | "outdoor";
  injuriesAndLimitations?: string[];
  excludedExercises?: string[];
  dietaryStyle?: DietaryStyle;
  allergies?: string[];
  intolerances?: string[];
  dislikedFoods?: string[];
  preferredMealTimes?: string[];
  cookingTimeBudget?: "minimal" | "moderate" | "flexible";
  budgetLevel?: "low" | "medium" | "high";
  hondurasLatinPreference?: boolean;
  isPregnantOrBreastfeeding?: boolean;
  hasEatingDisorderHistory?: boolean;
  hasUncontrolledMedicalCondition?: boolean;
}

const nonEmptyText = z.string().trim().min(1);

export const rawGenerationRequestSchema: z.ZodType<RawGenerationRequest> = z.object({
  sex: z.enum(["M", "F", "X"]),
  ageYears: z.number().int().positive(),
  heightCm: z.number().positive(),
  weightKg: z.number().positive(),
  activityOutsideTraining: z.enum(["sedentary", "light", "moderate", "active", "very_active"]),
  goal: z.enum(["fat_loss", "muscle_gain", "strength", "recomposition", "maintenance"]),
  pace: z.enum(["slow", "moderate", "aggressive"]),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]),
  daysPerWeek: z.number().int().min(1).max(7),
  sessionMinutes: z.number().int().positive(),
  mealsPerDay: z.number().int().min(1).max(8),
  availableEquipment: z.array(nonEmptyText).optional(),
  trainingLocation: z.enum(["gym", "home", "outdoor"]).optional(),
  injuriesAndLimitations: z.array(nonEmptyText).optional(),
  excludedExercises: z.array(nonEmptyText).optional(),
  dietaryStyle: z.enum(["omnivoro", "vegetariano", "vegano", "pescetariano"]).optional(),
  allergies: z.array(nonEmptyText).optional(),
  intolerances: z.array(nonEmptyText).optional(),
  dislikedFoods: z.array(nonEmptyText).optional(),
  preferredMealTimes: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).max(8).optional(),
  cookingTimeBudget: z.enum(["minimal", "moderate", "flexible"]).optional(),
  budgetLevel: z.enum(["low", "medium", "high"]).optional(),
  hondurasLatinPreference: z.boolean().optional(),
  isPregnantOrBreastfeeding: z.boolean().optional(),
  hasEatingDisorderHistory: z.boolean().optional(),
  hasUncontrolledMedicalCondition: z.boolean().optional(),
});

export type AssembleAndGenerateResult =
  | {
      ok: true;
      plan: GeneratedPlan;
      eligibleFoods: EligibleFood[];
      eligibleExercises: EligibleExercise[];
    }
  | {
      ok: false;
      reason: "requires_review";
      reasons: string[];
    };

export type AssembleAndGenerateProgress =
  | { phase: "preparing"; attempt: 0 }
  | GenerationProgress;

export interface AssembleAndGenerateOptions {
  onProgress?: (progress: AssembleAndGenerateProgress) => void | Promise<void>;
}

export async function assembleAndGenerate(
  input: RawGenerationRequest,
  options: AssembleAndGenerateOptions = {},
): Promise<AssembleAndGenerateResult> {
  await options.onProgress?.({ phase: "preparing", attempt: 0 });

  const safety = screenSafety({
    ageYears: input.ageYears,
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    goal: input.goal,
    isPregnantOrBreastfeeding: input.isPregnantOrBreastfeeding,
    hasEatingDisorderHistory: input.hasEatingDisorderHistory,
    hasUncontrolledMedicalCondition: input.hasUncontrolledMedicalCondition,
  });

  if (!safety.eligibleForAutoGeneration) {
    return {
      ok: false,
      reason: "requires_review",
      reasons: safety.reasons,
    };
  }

  const calculatedTargets = calculateTargets({
    sex: input.sex,
    ageYears: input.ageYears,
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    activityLevel: input.activityOutsideTraining,
    goal: input.goal,
    pace: input.pace,
  });

  const pulsoFoods = listFoods();
  const pulsoExercises = listExercises();
  const wgerExercises = await listAllWgerExercises();

  const eligibleFoods: EligibleFood[] = filterEligibleFoods(pulsoFoods, {
    dietaryStyle: input.dietaryStyle,
    allergies: [...(input.allergies ?? []), ...(input.intolerances ?? [])],
    dislikedFoods: input.dislikedFoods,
  }).map((food) => ({
    id: food.id,
    source: "pulso",
    name: food.name,
    kcal: food.kcal,
    proteinG: food.proteinG,
    carbsG: food.carbsG,
    fatG: food.fatG,
  }));

  const exerciseRestrictions = {
    availableEquipment: input.availableEquipment,
    excludedMuscleGroups: mapLimitationsToExcludedMuscleGroups(input.injuriesAndLimitations),
    excludedExerciseNames: input.excludedExercises,
  };
  const eligibleExercises: EligibleExercise[] = [
    ...filterEligibleExercises(pulsoExercises, exerciseRestrictions).map((exercise) => ({
      id: exercise.id,
      source: "pulso" as const,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      equipment: exercise.equipment,
    })),
    ...filterEligibleExercises(wgerExercises, exerciseRestrictions).map((exercise) => ({
      id: exercise.id,
      source: "wger" as const,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      equipment: exercise.equipment,
    })),
  ];

  const generationInput: GenerationInput = {
    targets: {
      dailyCalories: calculatedTargets.dailyCalories,
      proteinGrams: calculatedTargets.proteinGrams,
      carbsGrams: calculatedTargets.carbsGrams,
      fatGrams: calculatedTargets.fatGrams,
    },
    profile: {
      goal: input.goal,
      experienceLevel: input.experienceLevel,
      daysPerWeek: input.daysPerWeek,
      sessionMinutes: input.sessionMinutes,
      mealsPerDay: input.mealsPerDay,
      ageYears: input.ageYears,
      trainingLocation: input.trainingLocation,
      preferredMealTimes: input.preferredMealTimes,
      cookingTimeBudget: input.cookingTimeBudget,
      budgetLevel: input.budgetLevel,
      hondurasLatinPreference: input.hondurasLatinPreference,
    },
    eligibleFoods,
    eligibleExercises,
  };

  const plan = await generatePlan(generationInput, {
    onProgress: options.onProgress,
  });
  return { ok: true, plan, eligibleFoods, eligibleExercises };
}
