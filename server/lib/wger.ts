// wger exercise database client (https://wger.de/api/v2/) — public catalog
// endpoints, no auth required. The whole catalog (~830 exercises) is small
// enough to cache in full and search client-side rather than round-tripping
// per query. Source data is CC-BY-SA; attribution required if redistributed.

const BASE = 'https://wger.de/api/v2';
const SPANISH_LANGUAGE_ID = 4;
const ENGLISH_LANGUAGE_ID = 2;
const PAGE_LIMIT = 100;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CATALOG_FETCH_TIMEOUT_MS = 30_000;

interface WgerRawTranslation {
  language: number;
  name: string;
}

interface WgerRawExercise {
  id: number;
  category: { id: number; name: string };
  equipment: { id: number; name: string }[];
  translations: WgerRawTranslation[];
}

interface WgerRawListResponse {
  count: number;
  next: string | null;
  results: WgerRawExercise[];
}

export interface WgerExercise {
  id: string; // "wger_<id>" — namespaced so it never collides with PULSO's own catalog ids
  externalId: number;
  name: string; // Spanish translation, falls back to English
  muscleGroup: string; // mapped to PULSO's MUSCLE_GROUPS vocab
  equipment: string; // mapped to PULSO's EQUIPMENT vocab
}

const CATEGORY_TO_MUSCLE_GROUP: Record<string, string> = {
  Chest: 'pecho',
  Back: 'espalda',
  Legs: 'piernas',
  Shoulders: 'hombros',
  Arms: 'brazos',
  Abs: 'core',
  Calves: 'piernas',
  Cardio: 'full body',
};

const EQUIPMENT_TO_PULSO: Record<string, string> = {
  Barbell: 'barra',
  'SZ-Bar': 'barra',
  Dumbbell: 'mancuernas',
  Kettlebell: 'mancuernas',
  'Cable machine': 'polea',
  'Resistance band': 'polea',
  'none (bodyweight exercise)': 'peso corporal',
};

function mapEquipment(names: string[]): string {
  for (const name of names) {
    const mapped = EQUIPMENT_TO_PULSO[name];
    if (mapped) return mapped;
  }
  return names.length ? 'otro' : 'peso corporal';
}

function pickName(translations: WgerRawTranslation[]): string | null {
  const es = translations.find(t => t.language === SPANISH_LANGUAGE_ID);
  if (es?.name) return es.name;
  const en = translations.find(t => t.language === ENGLISH_LANGUAGE_ID);
  return en?.name ?? null;
}

async function fetchAllExerciseInfo(): Promise<WgerRawExercise[]> {
  const all: WgerRawExercise[] = [];
  let url: string | null = `${BASE}/exerciseinfo/?limit=${PAGE_LIMIT}&format=json`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CATALOG_FETCH_TIMEOUT_MS);
  try {
    while (url) {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`wger_${res.status}`);
      const json = (await res.json()) as WgerRawListResponse;
      all.push(...json.results);
      url = json.next;
    }
    return all;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`wger_timeout_${CATALOG_FETCH_TIMEOUT_MS}ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

let catalogCache: { at: number; data: WgerExercise[] } | null = null;
let catalogRefresh: Promise<WgerExercise[]> | null = null;

async function refreshCatalog(): Promise<WgerExercise[]> {
  const raw = await fetchAllExerciseInfo();
  const data: WgerExercise[] = [];
  for (const ex of raw) {
    const name = pickName(ex.translations);
    if (!name) continue;
    data.push({
      id: `wger_${ex.id}`,
      externalId: ex.id,
      name,
      muscleGroup: CATEGORY_TO_MUSCLE_GROUP[ex.category.name] ?? 'full body',
      equipment: mapEquipment(ex.equipment.map(e => e.name)),
    });
  }
  // Serve stale cache rather than an empty catalog if this refresh produced nothing
  if (data.length > 0 || !catalogCache) {
    catalogCache = { at: Date.now(), data };
  }
  return catalogCache.data;
}

async function getCatalog(): Promise<WgerExercise[]> {
  if (catalogCache && Date.now() - catalogCache.at < CACHE_TTL_MS) return catalogCache.data;
  if (catalogRefresh) return catalogRefresh;

  const pending = refreshCatalog();
  catalogRefresh = pending;
  try {
    return await pending;
  } finally {
    // A failed refresh must never be cached: the next caller can retry.
    if (catalogRefresh === pending) catalogRefresh = null;
  }
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Search the cached wger catalog by (Spanish, normalized) name substring. */
export async function searchWgerExercises(query: string, limit = 10): Promise<WgerExercise[]> {
  const q = normalize(query.trim());
  if (q.length < 2) return [];
  const catalog = await getCatalog();
  return catalog.filter(e => normalize(e.name).includes(q)).slice(0, limit);
}

/** All cached exercises for a PULSO muscle group — used to build the eligible-exercise set for generation. */
export async function listWgerExercisesByMuscleGroup(muscleGroup: string): Promise<WgerExercise[]> {
  const catalog = await getCatalog();
  return catalog.filter(e => e.muscleGroup === muscleGroup);
}

/** Full cached catalog — used to build the eligible-exercise set for generation. */
export async function listAllWgerExercises(): Promise<WgerExercise[]> {
  return getCatalog();
}
