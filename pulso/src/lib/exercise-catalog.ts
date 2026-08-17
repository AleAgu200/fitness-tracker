// Local exercise catalog search (1324 exercises with GIF demos), served from
// server/lib/exercise-catalog.json + server/public/exercises. Unlike WorkoutX
// (lib/workoutx.ts) media is public/static — no auth headers needed.

import { apiFetch } from './api';
import { SERVER_URL } from './auth-client';

export interface CatalogSuggestion {
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

export async function searchExerciseCatalog(q: string, signal?: AbortSignal): Promise<CatalogSuggestion[]> {
  if (q.trim().length < 2) return [];
  const res = await apiFetch<{ exercises: CatalogSuggestion[] }>(
    `/api/exercise-catalog/search?q=${encodeURIComponent(q.trim())}`,
    { signal },
  );
  return res.exercises;
}

/** Catalog exercises whose `target` matches one of the given muscle targets
 *  (e.g. "quads", "hamstrings") — used for the body-map's per-muscle suggestions,
 *  so every suggestion is guaranteed to have a GIF. */
export async function listCatalogByTargets(targets: string[], limit = 5, signal?: AbortSignal): Promise<CatalogSuggestion[]> {
  if (!targets.length) return [];
  const res = await apiFetch<{ exercises: CatalogSuggestion[] }>(
    `/api/exercise-catalog/by-target?targets=${encodeURIComponent(targets.join(','))}&limit=${limit}`,
    { signal },
  );
  return res.exercises;
}

/** Absolute URL for a catalog-relative media path (e.g. "/exercises/gifs/0001-2gPfomN.gif"). */
export function catalogMediaUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SERVER_URL.replace(/\/$/, '')}${path}`;
}
