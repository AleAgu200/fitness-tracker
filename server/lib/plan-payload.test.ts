import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_EXERCISES,
  MAX_MEALS,
  normalizeMeals,
  normalizePlanPayload,
  PlanPayloadError,
  normalizeExercises,
} from "./plan-payload";

test("exercise gif paths accept only http(s) and app-relative sources", () => {
  const [absolute, relative, script, data, empty] = normalizeExercises([
    { nombre: "Press", gifPath: "https://cdn.test/a.gif" },
    { nombre: "Press", gifPath: "/media/a.gif" },
    { nombre: "Press", gifPath: "javascript:alert(1)" },
    { nombre: "Press", gifPath: "data:image/gif;base64,AAAA" },
    { nombre: "Press" },
  ]);

  assert.equal(absolute.gifPath, "https://cdn.test/a.gif");
  assert.equal(relative.gifPath, "/media/a.gif");
  // The phone renders gifPath as an image source, so anything that is not a
  // plain fetchable location has to come back null rather than pass through.
  assert.equal(script.gifPath, null);
  assert.equal(data.gifPath, null);
  assert.equal(empty.gifPath, null);
});

test("exercise numbers are clamped to trainable values", () => {
  const [negative] = normalizeExercises([
    { nombre: "Sentadilla", target: -2, reps: -5, peso: -10, step: -1, restSeconds: 1 },
  ]);

  assert.equal(negative.target, 1);
  assert.equal(negative.reps, 1);
  assert.equal(negative.peso, 0);
  assert.equal(negative.step, 0.5);
  assert.equal(negative.restSeconds, 15);

  // Zero and non-numeric fall back to the defaults rather than clamping to 1:
  // an exercise with "0 sets" is a mistake, not an instruction.
  const [zeroed] = normalizeExercises([{ nombre: "Sentadilla", target: 0, reps: 0, restSeconds: "x" }]);
  assert.equal(zeroed.target, 3);
  assert.equal(zeroed.reps, 8);
  assert.equal(zeroed.restSeconds, 90);
});

test("exercises reject empty names, empty lists and oversized lists", () => {
  assert.throws(() => normalizeExercises([{ nombre: "   " }]), (error: PlanPayloadError) => error.code === "invalid_exercise");
  assert.throws(() => normalizeExercises([]), (error: PlanPayloadError) => error.code === "invalid_body");
  assert.throws(() => normalizeExercises("nope"), (error: PlanPayloadError) => error.code === "invalid_body");
  assert.throws(
    () => normalizeExercises(Array.from({ length: MAX_EXERCISES + 1 }, () => ({ nombre: "Press" }))),
    (error: PlanPayloadError) => error.code === "too_many_exercises",
  );
});

test("meals uppercase labels, clamp macros and drop weightless items", () => {
  const [meal] = normalizeMeals([
    {
      label: " desayuno ",
      n: " Avena ",
      kcal: -20,
      p: 12.6,
      items: [
        { foodId: "f1", name: " Avena ", grams: 80 },
        { foodId: "f2", name: "Agua", grams: 0 },
        { foodId: "f3", grams: 50 },
      ],
    },
  ]);

  assert.equal(meal.label, "DESAYUNO");
  assert.equal(meal.n, "Avena");
  assert.equal(meal.kcal, 0);
  assert.equal(meal.p, 13);
  assert.deepEqual(meal.items, [{ foodId: "f1", name: "Avena", grams: 80 }]);
});

test("meals reject missing label or description and oversized lists", () => {
  assert.throws(() => normalizeMeals([{ label: "", n: "Avena" }]), (error: PlanPayloadError) => error.code === "invalid_meal");
  assert.throws(() => normalizeMeals([{ label: "CENA", n: "" }]), (error: PlanPayloadError) => error.code === "invalid_meal");
  assert.throws(
    () => normalizeMeals(Array.from({ length: MAX_MEALS + 1 }, () => ({ label: "CENA", n: "Pollo" }))),
    (error: PlanPayloadError) => error.code === "too_many_meals",
  );
});

test("normalizePlanPayload keeps each discipline to its own shape", () => {
  const workout = normalizePlanPayload("coach", {
    coachName: "Ana",
    exercises: [{ nombre: "Press" }],
    meals: [{ label: "CENA", n: "Pollo" }],
  }) as Record<string, unknown>;
  assert.equal(workout.coachName, "Ana");
  assert.ok(Array.isArray(workout.exercises));
  // A coach draft must not smuggle a nutrition payload through to the athlete.
  assert.equal(workout.meals, undefined);

  const meals = normalizePlanPayload("nutritionist", {
    nutritionistName: "Luis",
    meals: [{ label: "CENA", n: "Pollo" }],
  }) as Record<string, unknown>;
  assert.equal(meals.nutritionistName, "Luis");
  assert.equal(meals.exercises, undefined);
});
