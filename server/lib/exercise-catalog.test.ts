import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import {
  getCatalogExercise,
  listGenerationCatalog,
  searchCatalog,
  searchCatalogPage,
} from "./exercise-catalog";

test("catalog exercises keep their Spanish technique guide next to the GIF", () => {
  const exercise = getCatalogExercise("gv_0001");

  assert.ok(exercise);
  assert.match(exercise.gifPath, /^\/exercises\/gifs\/.+\.gif$/);
  assert.ok(exercise.instructions.length > 80);
  assert.match(exercise.instructions, /rodillas|espalda|abdomen/i);
});

test("exercise search returns results ready for the complete learning flow", () => {
  const results = searchCatalog("sentadilla", 5);

  assert.ok(results.length > 0);
  assert.ok(results.every(exercise => exercise.instructions.trim().length > 0));
  assert.ok(results.every(exercise => exercise.gifPath.trim().length > 0));
});

test("plan generation only receives exercises with a visual technique reference", () => {
  const exercises = listGenerationCatalog();
  const earlyArmTargets = new Set(
    exercises.filter(exercise => exercise.muscleGroup === "brazos").slice(0, 20).map(exercise => exercise.target),
  );

  assert.ok(exercises.length > 100);
  assert.ok(exercises.every(exercise => exercise.gifPath.trim().length > 0));
  assert.ok(exercises.every(exercise => exercise.instructions.trim().length > 0));
  assert.ok(exercises.every(exercise => !/estiramiento|movilidad|calentamiento|yoga/i.test(exercise.name)));
  assert.ok(new Set(exercises.map(exercise => exercise.muscleGroup)).size >= 6);
  assert.ok(earlyArmTargets.size >= 3);
});

test("every triceps extension in the catalog has a physical GIF", () => {
  const results = searchCatalog("extensión de tríceps", 100);

  assert.equal(results.length, 60);
  assert.ok(results.every(exercise => existsSync(new URL(`../public${exercise.gifPath}`, import.meta.url))));
});

test("muscle searches include name, target and secondary-muscle matches with pagination", () => {
  const firstPage = searchCatalogPage("tríceps", 1, 25);
  const secondPage = searchCatalogPage("triceps", 2, 25);

  assert.equal(firstPage.total, 409);
  assert.equal(firstPage.exercises.length, 25);
  assert.equal(firstPage.pageCount, 17);
  assert.equal(secondPage.page, 2);
  assert.equal(secondPage.total, firstPage.total);
  assert.equal(
    firstPage.exercises.some(first => secondPage.exercises.some(second => second.id === first.id)),
    false,
  );
});
