import assert from "node:assert/strict";
import test from "node:test";

import {
  availablePortalSections,
  canAccessPortalPath,
  canFinishProfessionalSignup,
  PROFESSIONAL_SETUP_WINDOW_MS,
  resolveDefaultPortalPath,
} from "./portal-access";

test("only a just-created account can finish a professional sign-up", () => {
  const now = Date.now();
  const fresh = new Date(now - 60_000);
  const old = new Date(now - PROFESSIONAL_SETUP_WINDOW_MS - 1);
  assert.equal(canFinishProfessionalSignup("athlete", fresh, now), true);
  assert.equal(canFinishProfessionalSignup("athlete", old, now), false);
  assert.equal(canFinishProfessionalSignup("coach", fresh, now), false);
  assert.equal(canFinishProfessionalSignup("nutritionist", fresh, now), false);
});

test("nutritionists never receive the exercises section", () => {
  assert.equal(availablePortalSections("nutritionist").includes("exercises"), false);
  assert.deepEqual(availablePortalSections("nutritionist"), ["attention", "athletes", "team", "foods"]);
  assert.equal(canAccessPortalPath("nutritionist", "/portal/ejercicios"), false);
  assert.equal(canAccessPortalPath("nutritionist", "/portal/ejercicios/propio"), false);
  assert.equal(resolveDefaultPortalPath("nutritionist", "exercises"), "/portal/alimentos");
});

test("both disciplines can reach the team section", () => {
  // Whether they actually administer one is decided server-side by org role;
  // the nav entry itself is not authorization.
  assert.equal(availablePortalSections("coach").includes("team"), true);
  assert.equal(availablePortalSections("nutritionist").includes("team"), true);
  assert.equal(canAccessPortalPath("nutritionist", "/portal/equipo"), true);
});

test("coaches keep access to the training library", () => {
  assert.equal(canAccessPortalPath("coach", "/portal/ejercicios"), true);
  assert.equal(resolveDefaultPortalPath("coach", "exercises"), "/portal/ejercicios");
});

test("foods can be selected as a default portal section", () => {
  assert.equal(resolveDefaultPortalPath("nutritionist", "foods"), "/portal/alimentos");
  assert.equal(resolveDefaultPortalPath("coach", "foods"), "/portal/alimentos");
});

test("the portal shell follows review status and super admin access", async () => {
  const { canOpenInMode, portalMode } = await import("./portal-access");
  const base = { role: "athlete", storedRole: "athlete", professionalStatus: null, isSuperAdmin: false };
  assert.equal(portalMode({ ...base, role: "coach", storedRole: "coach" }), "professional");
  assert.equal(portalMode({ ...base, storedRole: "coach", professionalStatus: "pending" }), "pending");
  assert.equal(portalMode({ ...base, storedRole: "nutritionist", professionalStatus: "rejected" }), "rejected");
  assert.equal(portalMode({ ...base, isSuperAdmin: true }), "admin");
  assert.equal(portalMode(base), "none");

  assert.equal(canOpenInMode("pending", "athlete", "/portal/perfil", false), true);
  assert.equal(canOpenInMode("pending", "athlete", "/portal/atletas", false), false);
  assert.equal(canOpenInMode("professional", "coach", "/portal/admin", false), false);
  assert.equal(canOpenInMode("professional", "coach", "/portal/admin/usuarios", true), true);
  assert.equal(canOpenInMode("admin", "athlete", "/portal/atletas", true), false);
});
