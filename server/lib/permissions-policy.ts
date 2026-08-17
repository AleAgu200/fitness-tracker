export type OrganizationRole = "owner" | "admin" | "professional";
export type Discipline = "coach" | "nutritionist";
export type SharingCategory = "training" | "nutrition" | "metrics" | "checkins" | "photos";

export interface PermissionFacts {
  membershipStatus: string;
  clientStatus: string;
  assignmentStatus: string;
  orgRole: OrganizationRole;
  assignmentDiscipline: Discipline;
  capabilities: Discipline[];
  category?: SharingCategory;
  consentGranted?: boolean;
}

export interface PermissionDecision {
  record: boolean;
  category: boolean;
  manageTeam: boolean;
  reason: "allowed" | "inactive_membership" | "inactive_client" | "not_assigned" | "missing_capability" | "discipline_mismatch" | "consent_required";
}

export function disciplineAllowsCategory(discipline: Discipline, category: SharingCategory): boolean {
  if (category === "checkins" || category === "metrics" || category === "photos") return true;
  return (discipline === "coach" && category === "training")
    || (discipline === "nutritionist" && category === "nutrition");
}

/** Pure policy core used by route authorization and the matrix tests. */
export function evaluatePermission(facts: PermissionFacts): PermissionDecision {
  const manageTeam = facts.membershipStatus === "active" && (facts.orgRole === "owner" || facts.orgRole === "admin");
  if (facts.membershipStatus !== "active") return { record: false, category: false, manageTeam: false, reason: "inactive_membership" };
  if (facts.clientStatus !== "active") return { record: false, category: false, manageTeam, reason: "inactive_client" };
  if (facts.assignmentStatus !== "active") return { record: false, category: false, manageTeam, reason: "not_assigned" };
  if (!facts.capabilities.includes(facts.assignmentDiscipline)) {
    return { record: false, category: false, manageTeam, reason: "missing_capability" };
  }
  if (!facts.category) return { record: true, category: false, manageTeam, reason: "allowed" };
  if (!disciplineAllowsCategory(facts.assignmentDiscipline, facts.category)) {
    return { record: true, category: false, manageTeam, reason: "discipline_mismatch" };
  }
  if (!facts.consentGranted) return { record: true, category: false, manageTeam, reason: "consent_required" };
  return { record: true, category: true, manageTeam, reason: "allowed" };
}
