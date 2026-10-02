import { FOOD_CATEGORIES } from "@/lib/library-constants";

// Validation of admin catalog forms. Pure, so it is unit-tested.

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export interface ExerciseFields {
  name: string;
  muscleGroup: string;
  equipment: string;
  target: string;
  secondaryMuscles: string[];
  instructions: string;
  mediaPath: string | null;
}

/** Validate an admin form. Media must be a path this server issued or the existing catalog one. */
export function parseExerciseFields(body: Record<string, unknown>): ExerciseFields | { error: string } {
  const fields: ExerciseFields = {
    name: str(body.name, 120),
    muscleGroup: str(body.muscleGroup, 40).toLowerCase(),
    equipment: str(body.equipment, 40).toLowerCase(),
    target: str(body.target, 60).toLowerCase(),
    secondaryMuscles: Array.isArray(body.secondaryMuscles)
      ? body.secondaryMuscles.map(m => str(m, 60).toLowerCase()).filter(Boolean).slice(0, 8)
      : [],
    instructions: str(body.instructions, 4000),
    mediaPath: body.mediaPath == null || body.mediaPath === "" ? null : str(body.mediaPath, 200),
  };
  if (!fields.name || !fields.muscleGroup || !fields.equipment) return { error: "missing_fields" };
  if (!fields.target) fields.target = fields.muscleGroup;
  if (fields.mediaPath && !/^\/(media|exercises)\/[\w./-]+$/.test(fields.mediaPath)) return { error: "invalid_media" };
  return fields;
}

export interface FoodFields {
  name: string;
  category: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export function parseFoodFields(body: Record<string, unknown>): FoodFields | { error: string } {
  const name = str(body.name, 120);
  const category = (FOOD_CATEGORIES as readonly string[]).includes(String(body.category)) ? String(body.category) : "otro";
  const [kcal, proteinG, carbsG, fatG] = [body.kcal, body.proteinG, body.carbsG, body.fatG]
    .map(v => Number(v));
  if (!name) return { error: "missing_fields" };
  if (![kcal, proteinG, carbsG, fatG].every(n => Number.isFinite(n) && n >= 0 && n <= 1000)) return { error: "invalid_values" };
  // Per 100 g: macros cannot weigh more than the portion itself.
  if (proteinG + carbsG + fatG > 100) return { error: "macros_over_100g" };
  return { name, category, kcal, proteinG, carbsG, fatG };
}

