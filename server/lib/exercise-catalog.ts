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
  instructions: string;
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

export interface CatalogSearchPage {
  exercises: CatalogExercise[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

function searchRank(exercise: CatalogExercise, query: string, tokens: string[]): number | null {
  const name = normalize(exercise.name);
  const target = normalize(exercise.target);
  const muscleGroup = normalize(exercise.muscleGroup);
  const equipment = normalize(exercise.equipment);
  const secondaryMuscles = exercise.secondaryMuscles.map(normalize);
  const searchable = `${name} ${target} ${muscleGroup} ${equipment} ${secondaryMuscles.join(" ")}`;

  // Every term must be represented, but terms may live in different fields.
  // This makes queries such as "tríceps polea" useful without weakening them
  // into an OR search that returns unrelated exercises.
  if (!tokens.every(token => searchable.includes(token))) return null;

  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.includes(query)) return 2;
  if (target === query) return 3;
  if (secondaryMuscles.includes(query)) return 4;
  if (muscleGroup === query) return 5;
  if (equipment === query) return 6;
  if (tokens.every(token => name.includes(token))) return 7;
  return 8;
}

function matchingCatalog(q: string): CatalogExercise[] {
  const query = normalize(q);
  if (query.length < 2) return [];
  const tokens = query.split(/\s+/).filter(Boolean);

  return CATALOG
    .map((exercise, index) => ({ exercise, index, rank: searchRank(exercise, query, tokens) }))
    .filter((result): result is { exercise: CatalogExercise; index: number; rank: number } => result.rank !== null)
    .sort((a, b) => a.rank - b.rank
      || Number(BAND_VARIANT.test(a.exercise.name)) - Number(BAND_VARIANT.test(b.exercise.name))
      || a.index - b.index)
    .map(result => result.exercise);
}

/** Ranked multi-field search with stable server-side pagination. */
export function searchCatalogPage(q: string, page = 1, pageSize = 10): CatalogSearchPage {
  const matches = matchingCatalog(q);
  const safePageSize = Math.min(50, Math.max(1, Math.trunc(pageSize) || 10));
  const pageCount = Math.ceil(matches.length / safePageSize);
  const safePage = pageCount > 0
    ? Math.min(pageCount, Math.max(1, Math.trunc(page) || 1))
    : 1;
  const offset = (safePage - 1) * safePageSize;

  return {
    exercises: matches.slice(offset, offset + safePageSize),
    total: matches.length,
    page: safePage,
    pageSize: safePageSize,
    pageCount,
  };
}

/** Backwards-compatible first-page helper used by suggestions and tests. */
export function searchCatalog(q: string, limit = 10): CatalogExercise[] {
  return matchingCatalog(q).slice(0, Math.max(0, Math.trunc(limit)));
}

export function getCatalogExercise(id: string): CatalogExercise | undefined {
  return CATALOG.find(ex => ex.id === id);
}

// Stretches, mobility drills, yoga poses and warm-up activation work — held/paced
// exercises, not sets×reps — don't fit a "popular exercise" suggestion meant to
// be added straight into a lifting plan.
const NON_STRENGTH_NAME = /estiramiento|elongaci[oó]n|movilidad|calentamiento|postura|yoga|c[ií]rculos?\b|tabla de equilibrio|toque de pies|abrazo al bal[oó]n|activaci[oó]n/i;

/** Strength exercises offered to plan generation. Every item carries a local
 * GIF and Spanish instructions. Within each muscle group, targets are
 * interleaved so the model's 120-item prompt cap does not fill up with only
 * one movement family (for example, only biceps exercises for arms). */
export function listGenerationCatalog(): CatalogExercise[] {
  const byGroup = new Map<string, Map<string, { primary: CatalogExercise[]; band: CatalogExercise[] }>>();

  for (const exercise of CATALOG) {
    if (NON_STRENGTH_NAME.test(exercise.name)) continue;
    const byTarget = byGroup.get(exercise.muscleGroup) ?? new Map();
    const bucket = byTarget.get(exercise.target) ?? { primary: [], band: [] };
    (BAND_VARIANT.test(exercise.name) ? bucket.band : bucket.primary).push(exercise);
    byTarget.set(exercise.target, bucket);
    byGroup.set(exercise.muscleGroup, byTarget);
  }

  const ordered: CatalogExercise[] = [];
  for (const byTarget of byGroup.values()) {
    const targetQueues = [...byTarget.values()].map(({ primary, band }) => [...primary, ...band]);
    for (let round = 0; ; round += 1) {
      let tookAny = false;
      for (const queue of targetQueues) {
        const exercise = queue[round];
        if (!exercise) continue;
        ordered.push(exercise);
        tookAny = true;
      }
      if (!tookAny) break;
    }
  }

  return ordered;
}

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
