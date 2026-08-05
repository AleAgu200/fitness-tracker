// WorkoutX exercise suggestions, proxied through our server (the API key never
// ships in the app). Best-effort: offline just means no suggestions.

import { apiFetch } from './api';
import { getAuthHeaders, SERVER_URL } from './auth-client';

export interface WxSuggestion {
  id: string;
  name: string;
  muscleGroup: string;
  localEquipment: string;
  target: string;
  gifUrl: string | null;
}

export async function searchWorkoutX(q: string, signal?: AbortSignal): Promise<WxSuggestion[]> {
  if (q.trim().length < 2) return [];
  const res = await apiFetch<{ exercises: WxSuggestion[] }>(
    `/api/workoutx/exercises?q=${encodeURIComponent(q.trim())}`,
    { signal },
  );
  return res.exercises;
}

/** Relative gif path for a known WorkoutX id — mirrors the server's search response shape,
 *  so an already-saved exercise can show its demo without re-searching. */
export function workoutXGifUrlFromId(id: string): string {
  return `/api/workoutx/gifs/${encodeURIComponent(id)}.gif`;
}

/** Absolute, authenticated source for expo-image. */
export function workoutXGifSource(gifUrl: string) {
  const uri = gifUrl.startsWith('http')
    ? gifUrl
    : `${SERVER_URL.replace(/\/$/, '')}/${gifUrl.replace(/^\//, '')}`;

  return { uri, headers: getAuthHeaders() };
}
