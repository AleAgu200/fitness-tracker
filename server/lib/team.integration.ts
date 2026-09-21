import assert from "node:assert/strict";
import test from "node:test";

import { requireCategoryAccess } from "@/lib/permissions";
import { addProfessionalToOrg, seedCoachedAthlete } from "@/lib/test-fixtures";
import {
  assignProfessional,
  listCoverageGaps,
  listOrganizationMembers,
  revokeCareAssignment,
  revokeOrganizationMember,
  setMemberDisciplines,
} from "@/lib/team-management";

test("revoking a member releases their athletes and reports who lost a primary", async () => {
  const { coachId, athleteId, organizationId, membershipId } = await seedCoachedAthlete();

  const result = await revokeOrganizationMember({ actorUserId: coachId, organizationId, membershipId: "missing" });
  assert.equal(result.ok, false);

  const owner = await addProfessionalToOrg({ organizationId, disciplines: ["coach"], orgRole: "owner" });
  const revoked = await revokeOrganizationMember({ actorUserId: owner.userId, organizationId, membershipId });
  assert.equal(revoked.ok, true);
  if (!revoked.ok) return;

  assert.equal(revoked.releasedAssignments, 1);
  assert.deepEqual(revoked.uncovered, [{ athleteId, discipline: "coach" }]);
  // A deactivated professional must immediately lose access to the record.
  assert.equal(await requireCategoryAccess(coachId, athleteId, "training"), null);
});

test("the last owner cannot be deactivated", async () => {
  const { coachId, organizationId, membershipId } = await seedCoachedAthlete();

  const result = await revokeOrganizationMember({ actorUserId: coachId, organizationId, membershipId });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "last_owner");
});

test("a discipline with active assignments cannot be removed", async () => {
  const { coachId, organizationId, membershipId } = await seedCoachedAthlete();

  const blocked = await setMemberDisciplines({
    actorUserId: coachId,
    organizationId,
    membershipId,
    disciplines: ["nutritionist"],
  });
  assert.equal(blocked.ok, false);
  if (blocked.ok) return;
  assert.equal(blocked.error, "discipline_has_active_assignments");

  // Adding a discipline alongside the active one is fine.
  const widened = await setMemberDisciplines({
    actorUserId: coachId,
    organizationId,
    membershipId,
    disciplines: ["coach", "nutritionist"],
  });
  assert.equal(widened.ok, true);
});

test("removing one collaborator leaves the rest of the athlete's team intact", async () => {
  const { coachId, athleteId, organizationId } = await seedCoachedAthlete();
  const collaborator = await addProfessionalToOrg({ organizationId, disciplines: ["coach"] });

  const assigned = await assignProfessional({
    actorUserId: coachId,
    organizationId,
    athleteId,
    professionalMembershipId: collaborator.membershipId,
    discipline: "coach",
    primary: false,
  });
  assert.equal(assigned.ok, true);
  if (!assigned.ok) return;

  const removed = await revokeCareAssignment({
    actorUserId: coachId,
    organizationId,
    assignmentId: assigned.assignment.id,
  });
  assert.equal(removed.ok, true);
  if (!removed.ok) return;
  // The collaborator was not primary, so nobody was left uncovered.
  assert.deepEqual(removed.uncovered, []);
  // The original primary still has access.
  assert.ok(await requireCategoryAccess(coachId, athleteId, "training"));
});

test("member listing reports athlete load and coverage gaps surface a missing primary", async () => {
  const { coachId, athleteId, organizationId, membershipId } = await seedCoachedAthlete();

  const members = await listOrganizationMembers(coachId, organizationId);
  assert.ok(members);
  const seeded = members.find(member => member.id === membershipId);
  assert.deepEqual(seeded?.load, [{ discipline: "coach", athletes: 1 }]);
  assert.equal((await listCoverageGaps(organizationId)).length, 0);

  // Hand the athlete to a collaborator as non-primary, then drop the primary:
  // assignments remain but nobody owns the athlete's signals.
  const collaborator = await addProfessionalToOrg({ organizationId, disciplines: ["coach"] });
  await assignProfessional({
    actorUserId: coachId,
    organizationId,
    athleteId,
    professionalMembershipId: collaborator.membershipId,
    discipline: "coach",
    primary: false,
  });
  const owner = await addProfessionalToOrg({ organizationId, disciplines: ["coach"], orgRole: "owner" });
  await revokeOrganizationMember({ actorUserId: owner.userId, organizationId, membershipId });

  const gaps = await listCoverageGaps(organizationId);
  assert.ok(
    gaps.some(gap => gap.athleteId === athleteId && gap.discipline === "coach" && gap.reason === "no_primary"),
    "an athlete with collaborators but no primary must be reported",
  );
});
