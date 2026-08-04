import type { Food } from '@/lib/library';

// Deterministic catalog filtering — this decides *which* foods/exercises are
// even offered to the model; the model can then only pick among these, never
// invent or bypass a restriction. Keep all logic here pure/testable.

export type DietaryStyle = 'omnivoro' | 'vegetariano' | 'vegano' | 'pescetariano';
export type PulsoMuscleGroup = 'pecho' | 'espalda' | 'piernas' | 'hombros' | 'brazos' | 'core' | 'full body';

export interface FoodRestrictions {
  dietaryStyle?: DietaryStyle;
  allergies?: string[]; // free text, matched as substrings against the food name
  dislikedFoods?: string[]; // free text, matched as substrings against the food name
}

export interface ExerciseRestrictions {
  availableEquipment?: string[]; // subset of EQUIPMENT from lib/library; empty/undefined = no equipment filter
  excludedMuscleGroups?: string[]; // e.g. injury sites, subset of MUSCLE_GROUPS
  excludedExerciseNames?: string[];
}

interface ExerciseCandidate {
  name: string;
  muscleGroup: string;
  equipment: string;
}

const PULSO_MUSCLE_GROUP_ORDER: readonly PulsoMuscleGroup[] = [
  'pecho',
  'espalda',
  'piernas',
  'hombros',
  'brazos',
  'core',
  'full body',
];

interface LimitationMappingRule {
  terms: readonly string[];
  groups: readonly PulsoMuscleGroup[];
}

// A conservative, deterministic bridge from the wizard's free text to the
// catalog's coarse muscle-group vocabulary. Related groups are excluded where
// a joint is commonly loaded by several movement families; every recognized
// limitation also excludes full-body movements.
const LIMITATION_MAPPING_RULES: readonly LimitationMappingRule[] = [
  {
    terms: ['pecho', 'pectoral', 'pectorales', 'esternón'],
    groups: ['pecho', 'full body'],
  },
  {
    terms: ['espalda', 'columna', 'lumbar', 'lumbares', 'lumbalgia', 'dorsal', 'dorsales', 'ciática', 'ciático'],
    groups: ['espalda', 'piernas', 'core', 'full body'],
  },
  {
    terms: ['cervical', 'cervicales', 'cuello'],
    groups: ['espalda', 'hombros', 'core', 'full body'],
  },
  {
    terms: [
      'pierna', 'piernas', 'rodilla', 'rodillas', 'menisco', 'meniscos', 'rótula', 'rótulas', 'patela', 'patelas',
      'tobillo', 'tobillos', 'cadera', 'caderas', 'glúteo', 'glúteos', 'isquiotibial', 'isquiotibiales',
      'cuádriceps', 'pantorrilla', 'pantorrillas', 'gemelo', 'gemelos', 'muslo', 'muslos', 'aductor', 'aductores',
      'ingle', 'pie', 'pies', 'talón', 'talones', 'aquiles',
    ],
    groups: ['piernas', 'full body'],
  },
  {
    terms: ['pelvis', 'pélvico', 'pélvica'],
    groups: ['piernas', 'core', 'full body'],
  },
  {
    terms: ['hombro', 'hombros', 'deltoide', 'deltoides', 'manguito rotador', 'clavícula', 'clavículas'],
    groups: ['pecho', 'espalda', 'hombros', 'brazos', 'full body'],
  },
  {
    terms: ['brazo', 'brazos', 'codo', 'codos', 'muñeca', 'muñecas', 'mano', 'manos', 'bíceps', 'tríceps', 'antebrazo', 'antebrazos'],
    groups: ['pecho', 'espalda', 'hombros', 'brazos', 'full body'],
  },
  {
    terms: ['core', 'abdomen', 'abdominal', 'abdominales', 'hernia', 'hernias'],
    groups: ['core', 'full body'],
  },
  {
    terms: ['full body', 'cuerpo completo', 'cuerpo entero'],
    groups: ['full body'],
  },
];

// The seeded catalog (server/lib/library.ts) has no dietary-tag column yet, so
// vegan/vegetarian/pescetarian exclusion is done by matching name/category
// text against these keyword lists. This is a v1 approximation — a proper
// per-food dietary-tag column would replace it once the catalog grows past
// the current curated seed list.
const MEAT_KEYWORDS = ['pollo', 'carne', 'cerdo', 'res', 'nalga'];
const FISH_KEYWORDS = ['merluza', 'atún', 'pescado'];
const EGG_KEYWORDS = ['huevo'];
const DAIRY_KEYWORDS = ['yogur', 'queso', 'leche'];
const WHEY_KEYWORDS = ['whey'];

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function normalizeWords(value: string): string {
  return normalize(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

function containsWholeTerm(normalizedText: string, term: string): boolean {
  if (!normalizedText) return false;
  return ` ${normalizedText} `.includes(` ${normalizeWords(term)} `);
}

/** Map free-text injuries/limitations to stable catalog muscle groups. Unknown
 * text maps to nothing rather than being forwarded to the model. */
export function mapLimitationsToExcludedMuscleGroups(
  limitations: readonly string[] | undefined,
): PulsoMuscleGroup[] {
  const excluded = new Set<PulsoMuscleGroup>();

  for (const limitation of limitations ?? []) {
    const normalized = normalizeWords(limitation);
    for (const rule of LIMITATION_MAPPING_RULES) {
      if (!rule.terms.some((term) => containsWholeTerm(normalized, term))) continue;
      for (const group of rule.groups) excluded.add(group);
    }
  }

  return PULSO_MUSCLE_GROUP_ORDER.filter((group) => excluded.has(group));
}

function matchesAny(haystack: string, needles: string[]): boolean {
  if (!needles.length) return false;
  const normalized = normalize(haystack);
  return needles.some(needle => normalized.includes(normalize(needle)));
}

function excludedByDietaryStyle(food: Food, style: DietaryStyle | undefined): boolean {
  if (!style || style === 'omnivoro') return false;
  if (style === 'vegano') {
    return food.category === 'lácteo' ||
      matchesAny(food.name, [...MEAT_KEYWORDS, ...FISH_KEYWORDS, ...EGG_KEYWORDS, ...DAIRY_KEYWORDS, ...WHEY_KEYWORDS]);
  }
  if (style === 'vegetariano') {
    return matchesAny(food.name, [...MEAT_KEYWORDS, ...FISH_KEYWORDS]);
  }
  if (style === 'pescetariano') {
    return matchesAny(food.name, MEAT_KEYWORDS);
  }
  return false;
}

export function filterEligibleFoods(foods: Food[], restrictions: FoodRestrictions): Food[] {
  const allergies = restrictions.allergies ?? [];
  const disliked = restrictions.dislikedFoods ?? [];
  return foods.filter(food =>
    !excludedByDietaryStyle(food, restrictions.dietaryStyle) &&
    !matchesAny(food.name, allergies) &&
    !matchesAny(food.name, disliked),
  );
}

export function filterEligibleExercises<T extends ExerciseCandidate>(
  exercises: T[],
  restrictions: ExerciseRestrictions,
): T[] {
  const equipment = restrictions.availableEquipment ?? [];
  const excludedGroups = restrictions.excludedMuscleGroups ?? [];
  const excludedNames = restrictions.excludedExerciseNames ?? [];
  return exercises.filter(exercise => {
    // Bodyweight exercises need no equipment, so they're always eligible regardless of the filter
    if (equipment.length && exercise.equipment !== 'peso corporal' && !equipment.includes(exercise.equipment)) return false;
    if (excludedGroups.includes(exercise.muscleGroup)) return false;
    if (matchesAny(exercise.name, excludedNames)) return false;
    return true;
  });
}
