// WorkoutX exercise database client (https://workoutxapp.com).
// Server-side only: the API key lives in .env and every response is cached
// aggressively — the free tier allows 500 requests/month, max 10 results each.

const BASE = "https://api.workoutxapp.com/v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h — the catalog barely changes

export interface WxExercise {
  id: string;
  name: string;
  bodyPart: string;
  target: string;
  equipment: string;
  gifUrl?: string;
  difficulty?: string;
  secondaryMuscles?: string[];
}

const cache = new Map<string, { at: number; data: WxExercise[] }>();

/** Responses come either as a bare array or wrapped as { total, count, data } */
function unwrap(json: unknown): WxExercise[] {
  if (Array.isArray(json)) return json as WxExercise[];
  if (json && typeof json === "object" && Array.isArray((json as { data?: unknown }).data)) {
    return (json as { data: WxExercise[] }).data;
  }
  return [];
}

async function wxFetch(path: string): Promise<WxExercise[]> {
  const key = process.env.WORKOUTX_API_KEY;
  if (!key) throw new Error("workoutx_key_missing");

  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const res = await fetch(`${BASE}${path}`, {
    headers: { "X-WorkoutX-Key": key },
  });
  if (!res.ok) {
    // 429 = quota — serve stale cache if we have it rather than failing
    if (hit) return hit.data;
    throw new Error(`workoutx_${res.status}`);
  }
  const data = unwrap(await res.json());
  cache.set(path, { at: Date.now(), data });
  return data;
}

/** Fetch a GIF from WorkoutX while keeping the API key on the server. */
export async function fetchGif(file: string): Promise<Response> {
  if (!/^[a-zA-Z0-9_-]+\.gif$/.test(file)) {
    throw new Error("workoutx_invalid_gif");
  }

  const key = process.env.WORKOUTX_API_KEY;
  if (!key) throw new Error("workoutx_key_missing");

  return fetch(`${BASE}/gifs/${encodeURIComponent(file)}`, {
    headers: { "X-WorkoutX-Key": key },
    next: { revalidate: 24 * 60 * 60 },
  });
}

// The API's `name` filter matches the English source name even with lang=es,
// so translate common Spanish gym terms before querying. Phrases first.
const ES_PHRASES: [string, string][] = [
  ["peso muerto", "deadlift"],
  ["press de banca", "bench press"],
  ["press banca", "bench press"],
  ["press militar", "military press"],
  ["elevaciones laterales", "lateral raise"],
  ["prensa de piernas", "leg press"],
  ["flexiones de brazos", "push up"],
];

const ES_TOKENS: Record<string, string> = {
  sentadilla: "squat", sentadillas: "squat",
  banca: "bench", banco: "bench",
  dominada: "pull up", dominadas: "pull up",
  remo: "row", jalon: "pulldown",
  apertura: "fly", aperturas: "fly",
  fondos: "dip", zancada: "lunge", zancadas: "lunge", estocada: "lunge", estocadas: "lunge",
  flexiones: "push up", plancha: "plank",
  abdominales: "crunch", abdominal: "crunch",
  pantorrilla: "calf", pantorrillas: "calf", gemelos: "calf",
  femoral: "hamstring", femorales: "hamstring",
  extension: "extension", extensiones: "extension",
  elevacion: "raise", elevaciones: "raise",
  prensa: "leg press",
  gluteo: "glute", gluteos: "glute", cadera: "hip",
  pecho: "chest", espalda: "back", hombro: "shoulder", hombros: "shoulder",
  pierna: "leg", piernas: "leg",
  mancuerna: "dumbbell", mancuernas: "dumbbell",
  barra: "barbell", polea: "cable",
  militar: "military", inclinado: "incline", declinado: "decline",
};

function normalize(q: string): string {
  return q.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function translateQuery(q: string): string {
  let s = normalize(q);
  for (const [es, en] of ES_PHRASES) {
    s = s.replace(es, en);
  }
  s = s
    .split(/\s+/)
    .map(tok => ES_TOKENS[tok] ?? tok)
    .join(" ");
  return s;
}

/** Search exercises by partial name (Spanish terms translated), localized responses. Max 10 (free-tier cap). */
export async function searchExercises(q: string): Promise<WxExercise[]> {
  const query = translateQuery(q);
  if (query.length < 2) return [];
  return wxFetch(`/exercises?name=${encodeURIComponent(query)}&limit=10&lang=es`);
}

// ── mapping to PULSO's library vocabulary ────────────────────────────────────
// With lang=es the API returns localized labels ("Piernas superiores", "Barra"),
// so match by substring against both languages.

export function mapMuscleGroup(bodyPart: string): string {
  const s = bodyPart.toLowerCase();
  if (s.includes("pecho") || s.includes("chest")) return "pecho";
  if (s.includes("espalda") || s.includes("back")) return "espalda";
  if (s.includes("pierna") || s.includes("leg")) return "piernas";
  if (s.includes("hombro") || s.includes("shoulder")) return "hombros";
  if (s.includes("brazo") || s.includes("arm")) return "brazos";
  if (s.includes("cintura") || s.includes("waist") || s.includes("core") || s.includes("abdom")) return "core";
  if (s.includes("cuello") || s.includes("neck")) return "otro";
  if (s.includes("cardio")) return "full body";
  return "full body";
}

export function mapEquipment(equipment: string): string {
  const s = equipment.toLowerCase();
  if (s.includes("barra") || s.includes("barbell") || s.includes("trap bar")) return "barra";
  if (s.includes("mancuerna") || s.includes("dumbbell") || s.includes("pesa rusa") || s.includes("kettlebell")) return "mancuernas";
  if (s.includes("polea") || s.includes("cable") || s.includes("cuerda") || s.includes("rope")) return "polea";
  if (s.includes("máquina") || s.includes("machine") || s.includes("bicicleta") || s.includes("bike") || s.includes("ergometer") || s.includes("ergómetro")) return "máquina";
  if (s.includes("peso corporal") || s.includes("body weight")) return "peso corporal";
  return "otro";
}
