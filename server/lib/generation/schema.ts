import { z } from "zod";

// AI plan generation — shapes shared between the deterministic pipeline (caller),
// the OpenRouter client, and whatever eventually persists an accepted plan.
// The LLM only ever proposes *structure* (which catalog exercise/food, how much,
// which day) — it never emits numbers we could get wrong silently (calories,
// macros); those are always computed server-side from the catalog data below.

// Bumped from 1: `meals` (a single daily template) became `week` (seven days).
export const SCHEMA_VERSION = 2;
export const PROGRAM_DURATION_WEEKS = 4;

/** Days in a meal week. Fixed at 7 — the rotation covers every weekday. */
export const DAYS_PER_MEAL_WEEK = 7;

/** How many interchangeable versions of each meal the model is asked for. Three
 *  gives every weekday a different combination without a seventh of them
 *  repeating twice in a row. */
export const MEAL_OPTIONS_PER_SLOT = 3;

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
  gifPath: z.string().min(1),
  instructions: z.string().min(1),
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
});
export type GenerationProfileSummary = z.infer<typeof generationProfileSummarySchema>;

export const generationInputSchema = z.object({
  targets: generationTargetsSchema,
  profile: generationProfileSummarySchema,
  eligibleFoods: z.array(eligibleFoodSchema).min(1),
  eligibleExercises: z.array(eligibleExerciseSchema).min(1),
});
export type GenerationInput = z.infer<typeof generationInputSchema>;

// ── stored plan shapes: catalog ids, server-assigned times/weekdays ──

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

// ── model output: the only shape the LLM is asked to produce ──
// Deliberately smaller than the stored plan. The model proposes *structure*
// only — which catalog entry, roughly how much, in what order. Everything it
// has repeatedly gotten wrong is now computed server-side instead of asked for:
//
//   catalog ids  → 1-based `ref` into the catalog it was shown. Opaque 24-hex
//                  ids were transcribed wrong on nearly every meal item.
//   meal times   → assigned from profile.preferredMealTimes.
//   weekdays     → assigned from a canonical spread for profile.daysPerWeek.
//   grams        → treated as a *proposal* and rescaled to hit the macro
//                  targets exactly (see fitMacros); an LLM cannot pick grams
//                  that sum to within ±5% of a calorie target.
//   durationWeeks→ stamped as PROGRAM_DURATION_WEEKS.

export const modelExerciseSlotSchema = z.object({
  exerciseRef: z.number().int().min(1),
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
export type ModelExerciseSlot = z.infer<typeof modelExerciseSlotSchema>;

export const modelWorkoutDaySchema = z.object({
  name: z.string(),
  exercises: z.array(modelExerciseSlotSchema).min(1).max(12),
});
export type ModelWorkoutDay = z.infer<typeof modelWorkoutDaySchema>;

export const modelMealItemSchema = z.object({
  foodRef: z.number().int().min(1),
  grams: z.number().positive(),
});
export type ModelMealItem = z.infer<typeof modelMealItemSchema>;

export const modelMealOptionSchema = z.object({
  items: z.array(modelMealItemSchema).min(1).max(12),
});
export type ModelMealOption = z.infer<typeof modelMealOptionSchema>;

export const modelMealSlotSchema = z.object({
  label: z.string(),
  // Interchangeable versions of the same meal. The server rotates them across
  // the week (see composeWeek), which buys seven distinct days for roughly the
  // output of three — asking the model for seven full days instead costs ~4.8k
  // completion tokens against a 6k cap and pushes latency past the 90 s
  // request timeout.
  options: z.array(modelMealOptionSchema).min(1).max(MEAL_OPTIONS_PER_SLOT),
});
export type ModelMealSlot = z.infer<typeof modelMealSlotSchema>;

export const modelOutputSchema = z.object({
  assumptions: z.array(z.string()).max(12),
  safetyNotes: z.array(z.string()).max(12),
  workout: z.object({
    days: z.array(modelWorkoutDaySchema).min(1).max(7),
  }),
  meals: z.array(modelMealSlotSchema).min(1).max(8),
});
export type ModelOutput = z.infer<typeof modelOutputSchema>;

/** The same shape, with the ref bounds narrowed to the catalog this request
 *  actually showed the model. Providers enforcing `strict` JSON schema can then
 *  reject an out-of-range ref during decoding rather than after the fact. */
export function buildModelOutputSchema(foodCount: number, exerciseCount: number) {
  const exerciseSlot = modelExerciseSlotSchema.extend({
    exerciseRef: z.number().int().min(1).max(Math.max(1, exerciseCount)),
  });
  const mealItem = modelMealItemSchema.extend({
    foodRef: z.number().int().min(1).max(Math.max(1, foodCount)),
  });
  return modelOutputSchema.extend({
    workout: z.object({
      days: z
        .array(modelWorkoutDaySchema.extend({ exercises: z.array(exerciseSlot).min(1).max(12) }))
        .min(1)
        .max(7),
    }),
    meals: z
      .array(
        modelMealSlotSchema.extend({
          options: z
            .array(z.object({ items: z.array(mealItem).min(1).max(12) }))
            .min(1)
            .max(MEAL_OPTIONS_PER_SLOT),
        }),
      )
      .min(1)
      .max(8),
  });
}

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
  totals: nutritionTotalsSchema,
});
export type ComputedMealSlot = z.infer<typeof computedMealSlotSchema>;

/** One weekday's meals. Every day is fitted to the same daily targets on its
 *  own, so `dailyTotals` is per day rather than a single figure for a template
 *  that no longer exists. */
export const mealDaySchema = z.object({
  weekday: z.number().int().min(1).max(7), // 1 = Monday
  meals: z.array(computedMealSlotSchema).min(1),
  dailyTotals: nutritionTotalsSchema,
});
export type MealDay = z.infer<typeof mealDaySchema>;

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
  week: z.array(mealDaySchema).length(DAYS_PER_MEAL_WEEK),
});
export type GeneratedPlan = z.infer<typeof generatedPlanSchema>;
