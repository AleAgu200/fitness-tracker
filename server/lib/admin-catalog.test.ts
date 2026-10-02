import assert from "node:assert/strict";
import test from "node:test";

import { parseExerciseFields, parseFoodFields } from "./admin-catalog-input";
import { getCatalogExercise, mergeCatalog, searchCatalog, setCatalogOverrides } from "./exercise-catalog";
import { resolveMediaPath, sniffMedia } from "./media-storage";

const base = [
  { id: "a", name: "Sentadilla", muscleGroup: "piernas", equipment: "barra", target: "quads", secondaryMuscles: [], instructions: "x", imagePath: "/exercises/images/a.jpg", gifPath: "/exercises/gifs/a.gif" },
  { id: "b", name: "Remo", muscleGroup: "espalda", equipment: "barra", target: "lats", secondaryMuscles: [], instructions: "y", imagePath: "/exercises/images/b.jpg", gifPath: "/exercises/gifs/b.gif" },
];
const override = (id: string, extra: Partial<Parameters<typeof mergeCatalog>[1][number]> = {}) => ({
  id, name: "Nuevo", muscleGroup: "core", equipment: "otro", target: "abs", secondaryMuscles: [], instructions: "z", mediaPath: null, hidden: false, ...extra,
});

test("admin overrides edit, hide and extend the static catalog", () => {
  const merged = mergeCatalog(base, [
    override("a", { name: "Sentadilla trasera" }),
    override("b", { hidden: true }),
    override("px_1", { mediaPath: "/media/exercises/0123456789abcdef01234567.gif" }),
  ]);
  assert.deepEqual(merged.map(e => e.id), ["a", "px_1"]);
  assert.equal(merged[0].name, "Sentadilla trasera");
  assert.equal(merged[0].gifPath, "/exercises/gifs/a.gif", "no new media keeps the original animation");
  assert.equal(merged[1].gifPath, "/media/exercises/0123456789abcdef01234567.gif");
});

test("the live catalog picks up overrides and can return to the static one", () => {
  setCatalogOverrides([override("gv_0001", { hidden: true })]);
  assert.equal(getCatalogExercise("gv_0001"), undefined);
  setCatalogOverrides([override("px_test", { name: "Zancada búlgara admin" })]);
  assert.equal(searchCatalog("zancada bulgara admin", 1)[0]?.id, "px_test");
  setCatalogOverrides([]);
  assert.ok(getCatalogExercise("gv_0001"));
});

test("exercise and food forms are validated", () => {
  assert.deepEqual(parseExerciseFields({ name: "" , muscleGroup: "core", equipment: "otro" }), { error: "missing_fields" });
  assert.deepEqual(parseExerciseFields({ name: "X", muscleGroup: "core", equipment: "otro", mediaPath: "https://evil.example/x.gif" }), { error: "invalid_media" });
  const ok = parseExerciseFields({ name: "X", muscleGroup: "Core", equipment: "otro", secondaryMuscles: ["Glutes", 4] });
  assert.ok(!("error" in ok));
  assert.equal(ok.target, "core");
  assert.deepEqual(ok.secondaryMuscles, ["glutes"]);

  assert.deepEqual(parseFoodFields({ name: "Pan", kcal: 250, proteinG: 60, carbsG: 50, fatG: 1 }), { error: "macros_over_100g" });
  assert.deepEqual(parseFoodFields({ name: "Pan", kcal: -1, proteinG: 1, carbsG: 1, fatG: 1 }), { error: "invalid_values" });
  const food = parseFoodFields({ name: " Pan ", category: "nope", kcal: 250, proteinG: 9, carbsG: 49, fatG: 3 });
  assert.ok(!("error" in food));
  assert.equal(food.category, "otro");
  assert.equal(food.name, "Pan");
});

test("uploads are identified by content and stored only under generated names", () => {
  const pad = (head: number[]) => new Uint8Array([...head, ...new Array(16).fill(0)]);
  assert.equal(sniffMedia(pad([...Buffer.from("GIF89a")])), "gif");
  assert.equal(sniffMedia(pad([0x89, ...Buffer.from("PNG")])), "png");
  assert.equal(sniffMedia(new Uint8Array([0, 0, 0, 0x18, ...Buffer.from("ftypmp42"), 0, 0, 0, 0])), "mp4");
  assert.equal(sniffMedia(pad([...Buffer.from("<svg")])), null, "SVG can carry script and is refused");

  assert.ok(resolveMediaPath("exercises/0123456789abcdef01234567.gif"));
  assert.equal(resolveMediaPath("exercises/../../etc/passwd"), null);
  assert.equal(resolveMediaPath("exercises/0123456789abcdef01234567.svg"), null);
});
