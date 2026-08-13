// Local exercise catalog (1324 exercises with GIF animations), imported once via
// scripts/import-exercise-catalog.mjs from hasaneyldrm/exercises-dataset. Unlike
// WorkoutX (lib/workoutx.ts) this is static local data — no network calls, no
// rate limit, media served straight from /public/exercises (see next.config).

import catalogData from "./exercise-catalog.json";

export interface CatalogExercise {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  target: string;
  secondaryMuscles: string[];
  imagePath: string;
  gifPath: string;
}

const CATALOG = catalogData as CatalogExercise[];

function normalize(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Band variants are real exercises but the dataset has a lot of them clustered
// right at the start of most name/target groups, crowding out the barbell/dumbbell/
// machine/bodyweight version most people expect as the default. Rank them last
// instead of dropping them — still findable, just not the first thing shown.
const BAND_VARIANT = /\bbanda\b/i;

/** Substring match against the (Spanish) name: startsWith ranked above includes,
 *  non-band ranked above band within each. */
export function searchCatalog(q: string, limit = 10): CatalogExercise[] {
  const query = normalize(q);
  if (query.length < 2) return [];

  const startsPrimary: CatalogExercise[] = [];
  const startsBand: CatalogExercise[] = [];
  const includesPrimary: CatalogExercise[] = [];
  const includesBand: CatalogExercise[] = [];
  for (const ex of CATALOG) {
    const name = normalize(ex.name);
    const band = BAND_VARIANT.test(ex.name);
    if (name.startsWith(query)) (band ? startsBand : startsPrimary).push(ex);
    else if (name.includes(query)) (band ? includesBand : includesPrimary).push(ex);
  }
  return [...startsPrimary, ...startsBand, ...includesPrimary, ...includesBand].slice(0, limit);
}

export function getCatalogExercise(id: string): CatalogExercise | undefined {
  return CATALOG.find(ex => ex.id === id);
}

// Stretches, mobility drills, yoga poses and warm-up activation work — held/paced
// exercises, not sets×reps — don't fit a "popular exercise" suggestion meant to
// be added straight into a lifting plan.
const NON_STRENGTH_NAME = /estiramiento|elongaci[oó]n|movilidad|calentamiento|postura|yoga|c[ií]rculos?\b|tabla de equilibrio|toque de pies|abrazo al bal[oó]n|activaci[oó]n/i;

/** Exercises whose `target` is one of the given values (e.g. muscle-map suggestions),
 *  non-band ranked above band (see BAND_VARIANT above). */
export function listByTarget(targets: string[], limit = 5): CatalogExercise[] {
  const wanted = new Set(targets);
  const primary: CatalogExercise[] = [];
  const bandFallback: CatalogExercise[] = [];
  for (const ex of CATALOG) {
    if (!wanted.has(ex.target) || NON_STRENGTH_NAME.test(ex.name)) continue;
    (BAND_VARIANT.test(ex.name) ? bandFallback : primary).push(ex);
  }
  return [...primary, ...bandFallback].slice(0, limit);
}
