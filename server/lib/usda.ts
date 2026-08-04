// USDA FoodData Central client (https://fdc.nal.usda.gov/api-guide) —
// server-side only, requires a free API key from api.data.gov. Fallback/
// verification source: PULSO's curated library_foods catalog is first
// priority (server/lib/library.ts); this only fills gaps. Data are CC0.
//
// Restricted to Foundation + SR Legacy data types — those report nutrients
// per 100 g (matching PULSO's own food model), unlike Branded foods which
// report per-serving and add brand-name noise irrelevant to plan generation.

const BASE = 'https://api.nal.usda.gov/fdc/v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PREFERRED_DATA_TYPES = 'Foundation,SR Legacy';

// USDA nutrient IDs — stable across the database, not tied to a food's own numbering
const NUTRIENT_ID = { kcal: 1008, protein: 1003, fat: 1004, carbs: 1005 } as const;

export interface UsdaFood {
  id: string; // "usda_<fdcId>" — namespaced so it never collides with PULSO's own catalog ids
  externalId: number;
  name: string;
  kcal: number; // per 100 g
  proteinG: number; // per 100 g
  fatG: number; // per 100 g
  carbsG: number; // per 100 g
}

interface UsdaRawNutrient {
  nutrientId: number;
  value: number;
}

interface UsdaRawFood {
  fdcId: number;
  description: string;
  dataType: string;
  foodNutrients: UsdaRawNutrient[];
}

interface UsdaRawSearchResponse {
  foods: UsdaRawFood[];
}

const cache = new Map<string, { at: number; data: UsdaFood[] }>();

function requireApiKey(): string {
  const key = process.env.USDA_API_KEY;
  if (!key) throw new Error('usda_key_missing');
  return key;
}

/** Foods missing any of the four core macros are dropped rather than guessed at. */
function normalizeFood(raw: UsdaRawFood): UsdaFood | null {
  const byId = new Map(raw.foodNutrients.map(n => [n.nutrientId, n.value]));
  const kcal = byId.get(NUTRIENT_ID.kcal);
  const proteinG = byId.get(NUTRIENT_ID.protein);
  const fatG = byId.get(NUTRIENT_ID.fat);
  const carbsG = byId.get(NUTRIENT_ID.carbs);
  if (kcal == null || proteinG == null || fatG == null || carbsG == null) return null;

  return {
    id: `usda_${raw.fdcId}`,
    externalId: raw.fdcId,
    name: raw.description,
    kcal,
    proteinG,
    fatG,
    carbsG,
  };
}

/** Search USDA FoodData Central for foods matching `query`, per-100g basis only. */
export async function searchUsdaFoods(query: string, limit = 10): Promise<UsdaFood[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const key = requireApiKey();

  const cacheKey = `${q.toLowerCase()}:${limit}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const url = `${BASE}/foods/search`
    + `?query=${encodeURIComponent(q)}`
    + `&dataType=${encodeURIComponent(PREFERRED_DATA_TYPES)}`
    + `&pageSize=${limit}`
    + `&api_key=${key}`;
  const res = await fetch(url);
  if (!res.ok) {
    // 429 = USDA's default 1,000/hour quota — serve stale cache if we have it rather than failing
    if (hit) return hit.data;
    throw new Error(`usda_${res.status}`);
  }
  const json = (await res.json()) as UsdaRawSearchResponse;
  const data = json.foods.map(normalizeFood).filter((f): f is UsdaFood => f != null);
  cache.set(cacheKey, { at: Date.now(), data });
  return data;
}
