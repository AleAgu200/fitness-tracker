import assert from "node:assert/strict";
import test from "node:test";

import { availablePortalSections, canAccessPortalPath, resolveDefaultPortalPath } from "./portal-access";

test("nutritionists never receive the exercises section", () => {
  assert.deepEqual(availablePortalSections("nutritionist"), ["attention", "athletes", "foods"]);
  assert.equal(canAccessPortalPath("nutritionist", "/portal/ejercicios"), false);
  assert.equal(canAccessPortalPath("nutritionist", "/portal/ejercicios/propio"), false);
  assert.equal(resolveDefaultPortalPath("nutritionist", "exercises"), "/portal/alimentos");
});

test("coaches keep access to the training library", () => {
  assert.equal(canAccessPortalPath("coach", "/portal/ejercicios"), true);
  assert.equal(resolveDefaultPortalPath("coach", "exercises"), "/portal/ejercicios");
});

test("foods can be selected as a default portal section", () => {
  assert.equal(resolveDefaultPortalPath("nutritionist", "foods"), "/portal/alimentos");
  assert.equal(resolveDefaultPortalPath("coach", "foods"), "/portal/alimentos");
});
