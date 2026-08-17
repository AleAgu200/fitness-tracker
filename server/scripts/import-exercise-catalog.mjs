// One-off import of the hasaneyldrm/exercises-dataset catalog (1324 exercises,
// GIF + thumbnail per exercise) into PULSO's local exercise catalog.
//
// The dataset's text (data/exercises.json) is MIT; its media (images/GIFs) is
// © Gym visual, redistributed to that repo under a separate permission — see
// that repo's NOTICE.md. Media is copied here for local use only and never
// committed to this repo (see server/.gitignore: /public/exercises/).
//
// Usage:
//   git clone --depth 1 https://github.com/hasaneyldrm/exercises-dataset.git /tmp/exercises-dataset
//   node scripts/import-exercise-catalog.mjs --source /tmp/exercises-dataset
//
// Requires scripts/exercise-names-es.json (id -> Spanish name for every
// exercise in the dataset) to already exist — fails fast if any id is missing
// a translation, since the app is Spanish-only everywhere else.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const sourceArgIdx = process.argv.indexOf("--source");
const SOURCE = sourceArgIdx !== -1 ? process.argv[sourceArgIdx + 1] : null;
if (!SOURCE || !existsSync(join(SOURCE, "data", "exercises.json"))) {
  console.error("Usage: node scripts/import-exercise-catalog.mjs --source <path to exercises-dataset checkout>");
  process.exit(1);
}

const IMAGES_OUT = join(ROOT, "public", "exercises", "images");
const GIFS_OUT = join(ROOT, "public", "exercises", "gifs");
mkdirSync(IMAGES_OUT, { recursive: true });
mkdirSync(GIFS_OUT, { recursive: true });

const NAMES_ES_PATH = join(__dirname, "exercise-names-es.json");
const namesEs = JSON.parse(readFileSync(NAMES_ES_PATH, "utf8"));

const raw = JSON.parse(readFileSync(join(SOURCE, "data", "exercises.json"), "utf8"));

// ── PULSO vocabulary (must match server/lib/library.ts) ─────────────────────
// MUSCLE_GROUPS = ["pecho", "espalda", "piernas", "hombros", "brazos", "core", "full body"]
// EQUIPMENT     = ["barra", "mancuernas", "polea", "máquina", "peso corporal", "otro"]

const BODY_PART_TO_MUSCLE_GROUP = {
  chest: "pecho",
  back: "espalda",
  "upper legs": "piernas",
  "lower legs": "piernas",
  shoulders: "hombros",
  "upper arms": "brazos",
  "lower arms": "brazos",
  waist: "core",
  neck: "espalda",
  cardio: "full body",
};

const EQUIPMENT_TO_PULSO = {
  barbell: "barra",
  "ez barbell": "barra",
  "olympic barbell": "barra",
  "trap bar": "barra",
  "smith machine": "máquina",
  dumbbell: "mancuernas",
  kettlebell: "mancuernas",
  cable: "polea",
  rope: "polea",
  band: "polea",
  "resistance band": "polea",
  "leverage machine": "máquina",
  "sled machine": "máquina",
  "elliptical machine": "máquina",
  "skierg machine": "máquina",
  "stepmill machine": "máquina",
  "stationary bike": "máquina",
  "upper body ergometer": "máquina",
  "body weight": "peso corporal",
  assisted: "peso corporal",
  weighted: "peso corporal",
  "bosu ball": "otro",
  "stability ball": "otro",
  "medicine ball": "otro",
  "wheel roller": "otro",
  roller: "otro",
  tire: "otro",
  hammer: "otro",
};

function mapMuscleGroup(bodyPart) {
  return BODY_PART_TO_MUSCLE_GROUP[bodyPart] ?? "full body";
}

function mapEquipment(equipment) {
  return EQUIPMENT_TO_PULSO[equipment] ?? "otro";
}

const catalog = [];
const missingNames = [];
const muscleGroupCounts = {};
const equipmentCounts = {};

for (const ex of raw) {
  const nameEs = namesEs[ex.id];
  if (!nameEs) {
    missingNames.push(ex.id);
    continue;
  }

  const imageFile = ex.image.replace(/^images\//, "");
  const gifFile = ex.gif_url.replace(/^videos\//, "");
  copyFileSync(join(SOURCE, ex.image), join(IMAGES_OUT, imageFile));
  copyFileSync(join(SOURCE, ex.gif_url), join(GIFS_OUT, gifFile));

  const muscleGroup = mapMuscleGroup(ex.body_part);
  const equipment = mapEquipment(ex.equipment);
  muscleGroupCounts[muscleGroup] = (muscleGroupCounts[muscleGroup] ?? 0) + 1;
  equipmentCounts[equipment] = (equipmentCounts[equipment] ?? 0) + 1;

  catalog.push({
    id: `gv_${ex.id}`,
    name: nameEs,
    muscleGroup,
    equipment,
    target: ex.target,
    secondaryMuscles: ex.secondary_muscles,
    instructions: ex.instructions?.es?.trim() || ex.instructions?.en?.trim() || "",
    imagePath: `/exercises/images/${imageFile}`,
    gifPath: `/exercises/gifs/${gifFile}`,
  });
}

if (missingNames.length) {
  console.error(`✗ Missing Spanish name for ${missingNames.length} exercise id(s): ${missingNames.slice(0, 20).join(", ")}${missingNames.length > 20 ? "…" : ""}`);
  console.error(`  Add them to ${NAMES_ES_PATH} and re-run.`);
  process.exit(1);
}

writeFileSync(
  join(ROOT, "lib", "exercise-catalog.json"),
  JSON.stringify(catalog, null, 0),
  "utf8",
);

console.log(`✓ imported ${catalog.length} exercises`);
console.log("  by muscle group:", muscleGroupCounts);
console.log("  by equipment:", equipmentCounts);
console.log(`  media copied to ${IMAGES_OUT} and ${GIFS_OUT}`);
console.log(`  catalog written to server/lib/exercise-catalog.json`);
