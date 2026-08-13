// One-off export of the full wger catalog and whatever WorkoutX exposes, so
// exercises can be reviewed offline and matched to hand-produced/sourced demo
// videos. Read-only against both APIs; writes CSVs to
// exercise-catalog-exports/ (gitignored). Usage: node scripts/export-exercise-catalogs.mjs
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "exercise-catalog-exports");

// ── minimal .env loader (these scripts run standalone via `node`, not Next.js) ──
function loadEnv() {
  const path = join(ROOT, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(rows, headers) {
  return [headers.join(","), ...rows.map(r => headers.map(h => csvEscape(r[h])).join(","))].join("\n");
}

// ── wger: full public catalog, paginated, no auth (mirrors server/lib/wger.ts) ──
const WGER_BASE = "https://wger.de/api/v2";
const SPANISH_LANGUAGE_ID = 4;
const ENGLISH_LANGUAGE_ID = 2;

const CATEGORY_TO_MUSCLE_GROUP = {
  Chest: "pecho", Back: "espalda", Legs: "piernas", Shoulders: "hombros",
  Arms: "brazos", Abs: "core", Calves: "piernas", Cardio: "full body",
};
const EQUIPMENT_TO_PULSO = {
  Barbell: "barra", "SZ-Bar": "barra", Dumbbell: "mancuernas", Kettlebell: "mancuernas",
  "Cable machine": "polea", "Resistance band": "polea", "none (bodyweight exercise)": "peso corporal",
};
function mapEquipment(names) {
  for (const name of names) if (EQUIPMENT_TO_PULSO[name]) return EQUIPMENT_TO_PULSO[name];
  return names.length ? "otro" : "peso corporal";
}
function pickName(translations) {
  const es = translations.find(t => t.language === SPANISH_LANGUAGE_ID);
  if (es?.name) return es.name;
  const en = translations.find(t => t.language === ENGLISH_LANGUAGE_ID);
  return en?.name ?? null;
}

async function fetchAllWgerExercises() {
  const all = [];
  let url = `${WGER_BASE}/exerciseinfo/?limit=100&format=json`;
  while (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`wger_${res.status}`);
    const json = await res.json();
    all.push(...json.results);
    url = json.next;
    process.stdout.write(`\rwger: fetched ${all.length}${json.count ? `/${json.count}` : ""}`);
  }
  console.log();
  return all;
}

async function exportWger() {
  const raw = await fetchAllWgerExercises();
  const rows = [];
  for (const ex of raw) {
    const name = pickName(ex.translations);
    if (!name) continue;
    rows.push({
      id: `wger_${ex.id}`,
      name,
      muscleGroup: CATEGORY_TO_MUSCLE_GROUP[ex.category?.name] ?? "full body",
      equipment: mapEquipment((ex.equipment ?? []).map(e => e.name)),
      category: ex.category?.name ?? "",
    });
  }
  const csv = toCsv(rows, ["id", "name", "muscleGroup", "equipment", "category"]);
  writeFileSync(join(OUT_DIR, "wger-exercises.csv"), csv, "utf8");
  console.log(`✓ wger: ${rows.length} exercises written to exercise-catalog-exports/wger-exercises.csv`);
}

// ── WorkoutX: no confirmed "list everything" endpoint in current usage ──
// (server/lib/workoutx.ts only ever calls /exercises?name=...&limit=10). Probe
// for a bare/high-limit list call first; fall back to a small set of
// representative per-muscle-group queries if that 4xx/empties out, and label
// the output as a partial sample rather than "all of them".
const WX_BASE = "https://api.workoutxapp.com/v1";

async function wxFetch(path) {
  const key = process.env.WORKOUTX_API_KEY;
  if (!key) throw new Error("WORKOUTX_API_KEY missing from server/.env");
  const res = await fetch(`${WX_BASE}${path}`, { headers: { "X-WorkoutX-Key": key } });
  return res;
}
function unwrap(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.data)) return json.data;
  return [];
}

async function probeWorkoutXFullList() {
  for (const path of ["/exercises?limit=1000", "/exercises?limit=10000&format=json", "/exercises"]) {
    try {
      const res = await wxFetch(path);
      if (!res.ok) continue;
      const data = unwrap(await res.json());
      // A "full list" probe that just silently returns the default 10-result
      // page isn't proof of a real bulk endpoint — require more than that.
      if (data.length > 10) return data;
    } catch {
      // try next candidate
    }
  }
  return null;
}

const WX_SAMPLE_QUERIES = [
  "chest", "back", "legs", "shoulders", "biceps", "triceps", "abs", "glutes", "calves", "cardio",
];

async function sampleWorkoutXByQueries() {
  const seen = new Map();
  for (const q of WX_SAMPLE_QUERIES) {
    try {
      const res = await wxFetch(`/exercises?name=${encodeURIComponent(q)}&limit=10&lang=es`);
      if (!res.ok) {
        console.warn(`  workoutx query "${q}" → HTTP ${res.status}`);
        continue;
      }
      const data = unwrap(await res.json());
      for (const ex of data) seen.set(ex.id, ex);
    } catch (err) {
      console.warn(`  workoutx query "${q}" failed:`, err.message);
    }
  }
  return [...seen.values()];
}

function wxRowsFrom(data) {
  return data.map(ex => ({
    id: ex.id, name: ex.name, bodyPart: ex.bodyPart ?? "", target: ex.target ?? "",
    equipment: ex.equipment ?? "", difficulty: ex.difficulty ?? "", gifUrl: ex.gifUrl ?? "",
  }));
}

async function exportWorkoutX() {
  if (!process.env.WORKOUTX_API_KEY) {
    console.warn("✗ workoutx: WORKOUTX_API_KEY not set in server/.env — skipping");
    return;
  }

  console.log("workoutx: probing for a bulk-list endpoint…");
  const full = await probeWorkoutXFullList();
  if (full) {
    const rows = wxRowsFrom(full);
    writeFileSync(join(OUT_DIR, "workoutx-exercises.csv"), toCsv(rows, ["id", "name", "bodyPart", "target", "equipment", "difficulty", "gifUrl"]), "utf8");
    console.log(`✓ workoutx: ${rows.length} exercises (bulk endpoint) written to exercise-catalog-exports/workoutx-exercises.csv`);
    return;
  }

  console.log("workoutx: no bulk-list endpoint found (only /exercises?name=... is supported by this API/key).");
  console.log(`workoutx: sampling ${WX_SAMPLE_QUERIES.length} representative queries instead (NOT the full catalog, capped 10 results each)…`);
  const sample = await sampleWorkoutXByQueries();
  const rows = wxRowsFrom(sample);
  writeFileSync(join(OUT_DIR, "workoutx-sample-exercises.csv"), toCsv(rows, ["id", "name", "bodyPart", "target", "equipment", "difficulty", "gifUrl"]), "utf8");
  console.log(`✓ workoutx: ${rows.length} exercises (PARTIAL SAMPLE, deduped across ${WX_SAMPLE_QUERIES.length} queries) written to exercise-catalog-exports/workoutx-sample-exercises.csv`);
  console.log("  → this is not the full WorkoutX catalog; there is no confirmed bulk endpoint in the free tier used here.");
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  await exportWger();
  await exportWorkoutX();
}

main().catch(err => {
  console.error("export failed:", err);
  process.exit(1);
});
