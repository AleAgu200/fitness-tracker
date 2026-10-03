import assert from "node:assert/strict";
import test from "node:test";

import { adminActionError, effectiveRole, initialProfessionalStatus, isSuperAdmin } from "@/lib/admin-policy";

test("the env list only grants super admin to a verified address", () => {
  const env = { SUPERADMIN_EMAILS: " Ana@pulsofitness.tech , otra@x.com" };
  assert.equal(isSuperAdmin({ email: "ana@pulsofitness.tech", emailVerified: true }, env), true);
  assert.equal(isSuperAdmin({ email: "ana@pulsofitness.tech", emailVerified: false }, env), false);
  assert.equal(isSuperAdmin({ email: "nadie@x.com", emailVerified: true }, env), false);
  assert.equal(isSuperAdmin({ email: "flag@x.com", emailVerified: false, isSuperAdmin: true }, {}), true);
});

test("professionals under review or rejected act as athletes", () => {
  assert.equal(effectiveRole("coach", "pending"), "athlete");
  assert.equal(effectiveRole("nutritionist", "rejected"), "athlete");
  assert.equal(effectiveRole("coach", "approved"), "coach");
  assert.equal(effectiveRole("coach", null), "coach", "accounts from before reviews keep working");
  assert.equal(effectiveRole("athlete", "pending"), "athlete");
});

test("approvals can be switched off", () => {
  assert.equal(initialProfessionalStatus({}), "pending");
  assert.equal(initialProfessionalStatus({ PROFESSIONAL_APPROVAL: "off" }), "approved");
});

test("an admin cannot lock themselves or another super admin out", () => {
  const actor = { id: "a" };
  const athlete = { id: "b", superAdmin: false, role: "athlete", suspended: false };
  assert.equal(adminActionError({ action: "suspend" }, actor, { ...athlete, id: "a" }), "cannot_modify_self");
  assert.equal(adminActionError({ action: "suspend" }, actor, { ...athlete, superAdmin: true }), "cannot_modify_super_admin");
  assert.equal(adminActionError({ action: "reactivate" }, actor, athlete), "not_suspended");
  assert.equal(adminActionError({ action: "set_role", role: "athlete" }, actor, athlete), "role_unchanged");
  assert.equal(adminActionError({ action: "set_role", role: "coach" }, actor, athlete), null);
});

test("an admin can grant PULSO Plus to anyone, themselves included", () => {
  const actor = { id: "a" };
  const base = { id: "u", superAdmin: false, role: "athlete", suspended: false, plusActive: false };
  const now = Date.now();
  assert.equal(adminActionError({ action: "grant_plus", until: null }, actor, base, now), null);
  assert.equal(adminActionError({ action: "grant_plus", until: null }, actor, { ...base, id: "a" }, now), null, "self");
  assert.equal(adminActionError({ action: "grant_plus", until: null }, actor, { ...base, superAdmin: true }, now), null, "super admin");
  assert.equal(adminActionError({ action: "grant_plus", until: now + 86_400_000 }, actor, base, now), null);
  assert.equal(adminActionError({ action: "grant_plus", until: now - 1 }, actor, base, now), "plus_until_in_past");
});

test("Plus can only be removed from an account that has it", () => {
  const actor = { id: "a" };
  const base = { id: "u", superAdmin: false, role: "athlete", suspended: false };
  assert.equal(adminActionError({ action: "revoke_plus" }, actor, { ...base, plusActive: true }), null);
  assert.equal(adminActionError({ action: "revoke_plus" }, actor, { ...base, plusActive: false }), "plus_not_active");
});
