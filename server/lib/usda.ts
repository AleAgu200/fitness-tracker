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

// USDA's search only matches its own English source text, and unlike WorkoutX
// there is no lang=es param — the API has no localized endpoint at all. So the
// query is translated ES→EN before the request, and results are translated
// EN→ES word-by-word after. Coverage is common-food vocabulary, not
// exhaustive: any term missing from a dictionary is left as-is rather than
// guessed at, same tradeoff as workoutx.ts's translateQuery.

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const ES_QUERY_PHRASES: [string, string][] = [
  ['pechuga de pollo', 'chicken breast'],
  ['carne molida', 'ground beef'],
  ['carne de res', 'beef'],
  ['leche descremada', 'skim milk'],
  ['leche entera', 'whole milk'],
  ['aceite de oliva', 'olive oil'],
  ['papa dulce', 'sweet potato'],
  ['batata', 'sweet potato'],
  ['frijoles negros', 'black beans'],
  ['frijol negro', 'black beans'],
  ['frijoles rojos', 'kidney beans'],
  ['frijol rojo', 'kidney beans'],
  ['clara de huevo', 'egg white'],
  ['yema de huevo', 'egg yolk'],
  ['pan integral', 'whole wheat bread'],
  ['arroz integral', 'brown rice'],
];

const ES_QUERY_TOKENS: Record<string, string> = {
  pollo: 'chicken', res: 'beef', cerdo: 'pork', pavo: 'turkey', pescado: 'fish',
  camaron: 'shrimp', camarones: 'shrimp', huevo: 'egg', huevos: 'eggs',
  leche: 'milk', queso: 'cheese', yogur: 'yogurt', yogurt: 'yogurt', crema: 'cream',
  arroz: 'rice', pan: 'bread', pasta: 'pasta', fideos: 'noodles', avena: 'oats',
  papa: 'potato', papas: 'potatoes', frijol: 'beans', frijoles: 'beans',
  lenteja: 'lentils', lentejas: 'lentils', garbanzo: 'chickpea', garbanzos: 'chickpeas',
  maiz: 'corn', elote: 'corn', manzana: 'apple', platano: 'banana', banana: 'banana',
  naranja: 'orange', uva: 'grape', uvas: 'grapes', fresa: 'strawberry', fresas: 'strawberries',
  brocoli: 'broccoli', espinaca: 'spinach', tomate: 'tomato', zanahoria: 'carrot',
  cebolla: 'onion', lechuga: 'lettuce', pepino: 'cucumber', chile: 'pepper',
  repollo: 'cabbage', coliflor: 'cauliflower', tofu: 'tofu', tempeh: 'tempeh',
  quinoa: 'quinoa', aguacate: 'avocado', palta: 'avocado', pina: 'pineapple',
  sandia: 'watermelon', mango: 'mango', pera: 'pear', calabaza: 'squash',
  atun: 'tuna', salmon: 'salmon', tilapia: 'tilapia', mani: 'peanut', mantequilla: 'butter',
  jamon: 'ham', tocino: 'bacon', salchicha: 'sausage', cangrejo: 'crab', langosta: 'lobster',
  trigo: 'wheat', harina: 'flour', cereal: 'cereal', jugo: 'juice', yuca: 'cassava',
  crudo: 'raw', cocido: 'cooked', cocida: 'cooked', asado: 'roasted', asada: 'roasted',
  hervido: 'boiled', hervida: 'boiled', frito: 'fried', frita: 'fried',
  molida: 'ground', molido: 'ground', entera: 'whole', entero: 'whole',
  descremada: 'skim', desnatada: 'skim', magra: 'lean', fresco: 'fresh', fresca: 'fresh',
  congelado: 'frozen', congelada: 'frozen', seco: 'dried', seca: 'dried', dulce: 'sweet',
  almendra: 'almond', almendras: 'almonds', nuez: 'nut', nueces: 'nuts',
};

function normalizeQuery(q: string): string {
  return stripAccents(q.trim().toLowerCase());
}

/** Spanish→English so the search term matches USDA's English source text. */
function translateQuery(q: string): string {
  let s = normalizeQuery(q);
  for (const [es, en] of ES_QUERY_PHRASES) {
    s = s.split(es).join(en);
  }
  s = s.split(/\s+/).map(tok => ES_QUERY_TOKENS[tok] ?? tok).join(' ');
  return s;
}

const EN_RESULT_PHRASES: [RegExp, string][] = [
  [/\bmeat only\b/gi, 'solo carne'],
  [/\bboneless,? skinless\b/gi, 'sin hueso, sin piel'],
  [/\bsweet potato(es)?\b/gi, 'batata'],
  [/\begg white(s)?\b/gi, 'clara de huevo'],
  [/\begg yolk(s)?\b/gi, 'yema de huevo'],
  [/\bground beef\b/gi, 'carne molida de res'],
  [/\bbrown rice\b/gi, 'arroz integral'],
  [/\bwhole wheat\b/gi, 'trigo integral'],
];

const EN_RESULT_TOKENS: Record<string, string> = {
  chicken: 'pollo', breast: 'pechuga', thigh: 'muslo', drumstick: 'pierna', wing: 'ala',
  beef: 'res', pork: 'cerdo', turkey: 'pavo', fish: 'pescado', shrimp: 'camarón',
  egg: 'huevo', eggs: 'huevos', milk: 'leche', cheese: 'queso', yogurt: 'yogur', cream: 'crema',
  rice: 'arroz', bread: 'pan', pasta: 'pasta', noodles: 'fideos', oats: 'avena',
  potato: 'papa', potatoes: 'papas', beans: 'frijoles', lentils: 'lentejas', corn: 'maíz',
  apple: 'manzana', apples: 'manzanas', banana: 'plátano', bananas: 'plátanos',
  orange: 'naranja', oranges: 'naranjas', grape: 'uva', grapes: 'uvas',
  strawberry: 'fresa', strawberries: 'fresas', broccoli: 'brócoli', spinach: 'espinaca',
  tomato: 'tomate', tomatoes: 'tomates', carrot: 'zanahoria', carrots: 'zanahorias',
  onion: 'cebolla', onions: 'cebollas', lettuce: 'lechuga', cucumber: 'pepino',
  pepper: 'pimiento', peppers: 'pimientos', cabbage: 'repollo', cauliflower: 'coliflor',
  cooked: 'cocido', raw: 'crudo', roasted: 'asado', boiled: 'hervido', fried: 'frito',
  grilled: 'a la parrilla', baked: 'horneado', steamed: 'al vapor', dried: 'seco', fresh: 'fresco',
  frozen: 'congelado', canned: 'enlatado', whole: 'entero', skim: 'descremado', fat: 'grasa',
  lean: 'magro', ground: 'molido', without: 'sin', with: 'con', added: 'agregada',
  salt: 'sal', sugar: 'azúcar', water: 'agua', oil: 'aceite', butter: 'mantequilla',
  nuts: 'nueces', nut: 'nuez', almonds: 'almendras', almond: 'almendra',
  peanuts: 'maní', peanut: 'maní', seeds: 'semillas', seed: 'semilla', wheat: 'trigo',
  flour: 'harina', cereal: 'cereal', cereals: 'cereales', juice: 'jugo', tuna: 'atún',
  salmon: 'salmón', tilapia: 'tilapia', avocado: 'aguacate', avocados: 'aguacates',
  mango: 'mango', pineapple: 'piña', watermelon: 'sandía', melon: 'melón', pear: 'pera',
  squash: 'calabaza', pumpkin: 'calabaza', sweet: 'dulce', kale: 'col rizada',
  quinoa: 'quinoa', tofu: 'tofu', chickpeas: 'garbanzos', chickpea: 'garbanzo',
  vegetable: 'vegetal', vegetables: 'vegetales', fruit: 'fruta', fruits: 'frutas',
  meat: 'carne', poultry: 'aves', skinless: 'sin piel', boneless: 'sin hueso',
  bone: 'hueso', skin: 'piel', style: 'estilo', product: 'producto', mix: 'mezcla',
  drained: 'escurrido', solids: 'sólidos', liquid: 'líquido', unsweetened: 'sin azúcar',
  sweetened: 'endulzado', plain: 'natural', flavored: 'saborizado', reduced: 'reducido',
  large: 'grande', small: 'pequeño', bacon: 'tocino', sausage: 'salchicha', ham: 'jamón',
  crab: 'cangrejo', lobster: 'langosta', oyster: 'ostra', oysters: 'ostras',
  clam: 'almeja', clams: 'almejas', yuca: 'yuca', cassava: 'yuca',
};

function translateResultWord(word: string): string {
  const stripped = word.replace(/^[(]+|[).,]+$/g, '');
  const translated = EN_RESULT_TOKENS[stripped.toLowerCase()];
  if (!translated) return word;
  const prefix = word.match(/^[(]+/)?.[0] ?? '';
  const suffix = word.match(/[).,]+$/)?.[0] ?? '';
  return prefix + translated + suffix;
}

/** Best-effort EN→ES translation of USDA's comma-separated descriptions
 *  (e.g. "Chicken, breast, meat only, cooked, roasted"). Unrecognized words are
 *  left in English rather than guessed at. */
function translateResultName(description: string): string {
  const segments = description.split(',').map(segment => {
    let s = segment.trim();
    for (const [re, replacement] of EN_RESULT_PHRASES) s = s.replace(re, replacement);
    return s.split(/\s+/).map(translateResultWord).join(' ');
  });
  const joined = segments.join(', ');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
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
    name: translateResultName(raw.description),
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
    + `?query=${encodeURIComponent(translateQuery(q))}`
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
