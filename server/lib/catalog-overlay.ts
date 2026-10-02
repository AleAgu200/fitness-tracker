import { db } from "@/db";
import { catalogExercises } from "@/db/schema";
import { setCatalogOverrides } from "@/lib/exercise-catalog";

// Admin edits to the exercise catalog live in catalog_exercises and are merged
// into the static JSON in memory. One process serves every request, so a short
// cache plus an explicit invalidation after each admin write keeps reads cheap
// and edits visible immediately on this instance.

const TTL_MS = 60_000;
let loadedAt = 0;
let inflight: Promise<void> | null = null;

async function load(): Promise<void> {
  const rows = await db.select().from(catalogExercises);
  setCatalogOverrides(rows.map(row => ({
    id: row.id,
    name: row.name,
    muscleGroup: row.muscleGroup,
    equipment: row.equipment,
    target: row.target,
    secondaryMuscles: row.secondaryMuscles ?? [],
    instructions: row.instructions,
    mediaPath: row.mediaPath,
    hidden: row.hidden,
  })));
  loadedAt = Date.now();
}

/** Make sure the in-memory catalog reflects admin edits. Never throws: a DB
 *  hiccup leaves the last good catalog (or the static one) in place. */
export async function ensureCatalogOverlay(): Promise<void> {
  if (Date.now() - loadedAt < TTL_MS) return;
  inflight ??= load().catch(error => {
    console.error("[catalog] overlay load failed", error);
  }).finally(() => { inflight = null; });
  await inflight;
}

export async function reloadCatalogOverlay(): Promise<void> {
  loadedAt = 0;
  await ensureCatalogOverlay();
}
