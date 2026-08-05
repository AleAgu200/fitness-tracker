// Food catalog lookup, proxied through our server (the USDA key never ships in
// the app). Best-effort: offline just means no suggestions, and the manual
// macro fields stay available as a fallback.

import { apiFetch } from './api';

export interface FoodResult {
  id: string;
  source: 'pulso' | 'usda';
  name: string;
  /** per 100 g */
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface PickedFood {
  food: FoodResult;
  grams: number;
}

export interface Macros {
  kcal: number;
  p: number;
  c: number;
  g: number;
}

export async function searchFoods(q: string, signal?: AbortSignal): Promise<FoodResult[]> {
  if (q.trim().length < 2) return [];
  const res = await apiFetch<{ foods: FoodResult[] }>(
    `/api/library/foods/search?q=${encodeURIComponent(q.trim())}`,
    { signal },
  );
  return res.foods;
}

/** Sum first, round once. Rounding each item before adding drifts by several
 *  grams across a meal, which then shows up as a meal whose macros do not match
 *  the foods listed in it. */
export function totalsFor(items: PickedFood[]): Macros {
  const sum = items.reduce(
    (acc, { food, grams }) => {
      const factor = grams / 100;
      return {
        kcal: acc.kcal + food.kcal * factor,
        p: acc.p + food.proteinG * factor,
        c: acc.c + food.carbsG * factor,
        g: acc.g + food.fatG * factor,
      };
    },
    { kcal: 0, p: 0, c: 0, g: 0 },
  );
  return {
    kcal: Math.round(sum.kcal),
    p: Math.round(sum.p),
    c: Math.round(sum.c),
    g: Math.round(sum.g),
  };
}

/** The human-readable description stored on the meal slot. */
export function describeFoods(items: PickedFood[]): string {
  return items.map(({ food, grams }) => `${food.name} (${grams} g)`).join(', ');
}
