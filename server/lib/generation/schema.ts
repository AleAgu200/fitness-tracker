import { z } from "zod";

// AI plan generation — shapes shared between the deterministic pipeline (caller),
// the OpenRouter client, and whatever eventually persists an accepted plan.
// The LLM only ever proposes *structure* (which catalog exercise/food, how much,
// which day) — it never emits numbers we could get wrong silently (calories,
// macros); those are always computed server-side from the catalog data below.

export const SCHEMA_VERSION = 1;
export const PROGRAM_DURATION_WEEKS = 4;

export const SAFE_RANGES = {
  sets: { min: 1, max: 6 },
  reps: { min: 1, max: 30 },
  rir: { min: 0, max: 5 },
  restSeconds: { min: 15, max: 300 },
  progressionIncrementKg: { min: 0, max: 10 },
} as const;

export const CALORIE_TOLERANCE = 0.05; // ±5% of daily target
export const PROTEIN_TOLERANCE = 0.1; // ±10% of daily target

// ── input: eligible catalog + targets, already filtered/computed upstream ──
// (equipment, injuries, allergies, dislikes are applied before this point —
// anything in these lists is assumed safe to offer the model.)

export const eligibleFoodSchema = z.object({
  id: z.string(),
  source: z.enum(["pulso", "usda"]),
  name: z.string(),
  kcal: z.number().nonnegative(), // per 100 g
  proteinG: z.number().nonnegative(), // per 100 g
  carbsG: z.number().nonnegative(), // per 100 g
  fatG: z.number().nonnegative(), // per 100 g
});
export type EligibleFood = z.infer<typeof eligibleFoodSchema>;

export const eligibleExerciseSchema = z.object({
  id: z.string(),
  source: z.enum(["pulso", "wger", "workoutx"]),
  name: z.string(),
  muscleGroup: z.string(),
  equipment: z.string(),
});
export type EligibleExercise = z.infer<typeof eligibleExerciseSchema>;

export const generationTargetsSchema = z.object({
  dailyCalories: z.number().positive(),
  proteinGrams: z.number().positive(),
  carbsGrams: z.number().positive(),
  fatGrams: z.number().positive(),
});
export type GenerationTargets = z.infer<typeof generationTargetsSchema>;

export const generationProfileSummarySchema = z.object({
  goal: z.enum(["fat_loss", "muscle_gain", "strength", "recomposition", "maintenance"]),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]),
  daysPerWeek: z.number().int().min(1).max(7),
  sessionMinutes: z.number().int().positive(),
  mealsPerDay: z.number().int().min(1).max(8),
  ageYears: z.number().int().positive(),
  trainingLocation: z.enum(["gym", "home", "outdoor"]).optional(),
  preferredMealTimes: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).max(8).optional(),
  cookingTimeBudget: z.enum(["minimal", "moderate", "flexible"]).optional(),
  budgetLevel: z.enum(["low", "medium", "high"]).optional(),
  hondurasLatinPreference: z.boolean().optional(),
});
export type GenerationProfileSummary = z.infer<typeof generationProfileSummarySchema>;

export const generationInputSchema = z.object({
  targets: generationTargetsSchema,
  profile: generationProfileSummarySchema,
  eligibleFoods: z.array(eligibleFoodSchema).min(1),
  eligibleExercises: z.array(eligibleExerciseSchema).min(1),
});
export type GenerationInput = z.infer<typeof generationInputSchema>;

// ── model output: the only shape the LLM is asked to produce ──
// No nutrient numbers, no schemaVersion/model/promptVersion — those are
// stamped/computed by the server after validation, never trusted from the model.

export const exerciseSlotSchema = z.object({
  exerciseId: z.string(),
  sets: z.number().int().min(SAFE_RANGES.sets.min).max(SAFE_RANGES.sets.max),
  repsMin: z.number().int().min(SAFE_RANGES.reps.min).max(SAFE_RANGES.reps.max),
  repsMax: z.number().int().min(SAFE_RANGES.reps.min).max(SAFE_RANGES.reps.max),
  rirMin: z.number().int().min(SAFE_RANGES.rir.min).max(SAFE_RANGES.rir.max),
  rirMax: z.number().int().min(SAFE_RANGES.rir.min).max(SAFE_RANGES.rir.max),
  restSeconds: z.number().int().min(SAFE_RANGES.restSeconds.min).max(SAFE_RANGES.restSeconds.max),
  progressionIncrementKg: z
    .number()
    .min(SAFE_RANGES.progressionIncrementKg.min)
    .max(SAFE_RANGES.progressionIncrementKg.max),
});
export type ExerciseSlot = z.infer<typeof exerciseSlotSchema>;

export const workoutDaySchema = z.object({
  weekday: z.number().int().min(1).max(7), // 1 = Monday
  order: z.number().int().min(1),
  name: z.string(),
  exercises: z.array(exerciseSlotSchema).min(1).max(12),
});
export type WorkoutDay = z.infer<typeof workoutDaySchema>;

export const mealItemInputSchema = z.object({
  foodId: z.string(),
  source: z.enum(["pulso", "usda"]),
  grams: z.number().positive(),
});
export type MealItemInput = z.infer<typeof mealItemInputSchema>;

export const mealSlotInputSchema = z.object({
  label: z.string(),
  time: z.string(), // "HH:MM"
  items: z.array(mealItemInputSchema).min(1).max(12),
  // Required (possibly empty) rather than optional: OpenAI-style strict JSON
  // schema mode requires every property to be listed in `required`.
  substitutions: z.array(mealItemInputSchema).max(12),
});
export type MealSlotInput = z.infer<typeof mealSlotInputSchema>;

export const modelOutputSchema = z.object({
  assumptions: z.array(z.string()).max(12),
  safetyNotes: z.array(z.string()).max(12),
  workout: z.object({
    durationWeeks: z.literal(PROGRAM_DURATION_WEEKS),
    days: z.array(workoutDaySchema).min(1).max(7),
  }),
  meals: z.array(mealSlotInputSchema).min(1).max(8),
});
export type ModelOutput = z.infer<typeof modelOutputSchema>;

// ── final stored/returned shape: model output + server-computed nutrition ──

export const nutritionTotalsSchema = z.object({
  kcal: z.number(),
  proteinGrams: z.number(),
  carbsGrams: z.number(),
  fatGrams: z.number(),
});
export type NutritionTotals = z.infer<typeof nutritionTotalsSchema>;

export const computedMealItemSchema = mealItemInputSchema.extend({
  kcal: z.number(),
  proteinGrams: z.number(),
  carbsGrams: z.number(),
  fatGrams: z.number(),
});
export type ComputedMealItem = z.infer<typeof computedMealItemSchema>;

export const computedMealSlotSchema = z.object({
  label: z.string(),
  time: z.string(),
  items: z.array(computedMealItemSchema).min(1),
  substitutions: z.array(computedMealItemSchema),
  totals: nutritionTotalsSchema,
});
export type ComputedMealSlot = z.infer<typeof computedMealSlotSchema>;

export const generatedPlanSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  model: z.string(),
  promptVersion: z.string(),
  assumptions: z.array(z.string()),
  safetyNotes: z.array(z.string()),
  workout: z.object({
    durationWeeks: z.literal(PROGRAM_DURATION_WEEKS),
    days: z.array(workoutDaySchema).min(1),
  }),
  meals: z.array(computedMealSlotSchema).min(1),
  dailyTotals: nutritionTotalsSchema,
});
export type GeneratedPlan = z.infer<typeof generatedPlanSchema>;
