import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePermission, type PermissionFacts } from "./permissions-policy";

const base: PermissionFacts = {
  membershipStatus: "active",
  clientStatus: "active",
  assignmentStatus: "active",
  orgRole: "professional",
  assignmentDiscipline: "coach",
  capabilities: ["coach"],
};

test("assigned coach can view consented training", () => {
  assert.deepEqual(evaluatePermission({ ...base, category: "training", consentGranted: true }), {
    record: true,
    category: true,
    manageTeam: false,
    reason: "allowed",
  });
});

test("coach cannot read nutrition even when consent exists", () => {
  const decision = evaluatePermission({ ...base, category: "nutrition", consentGranted: true });
  assert.equal(decision.record, true);
  assert.equal(decision.category, false);
  assert.equal(decision.reason, "discipline_mismatch");
});

test("revoked consent blocks a category without representing zero data", () => {
  const decision = evaluatePermission({ ...base, category: "training", consentGranted: false });
  assert.equal(decision.record, true);
  assert.equal(decision.category, false);
  assert.equal(decision.reason, "consent_required");
});

test("admin can manage team but cannot open an unassigned record", () => {
  const decision = evaluatePermission({ ...base, orgRole: "admin", assignmentStatus: "revoked" });
  assert.equal(decision.manageTeam, true);
  assert.equal(decision.record, false);
});

test("revoked membership loses both record and administrative access", () => {
  const decision = evaluatePermission({ ...base, orgRole: "owner", membershipStatus: "revoked" });
  assert.equal(decision.manageTeam, false);
  assert.equal(decision.record, false);
});
