/**
 * Pure rules for super-admin access, account suspension and professional
 * review. No I/O, so they are unit-tested (admin-policy.test.ts).
 */

export type ProfessionalStatus = "pending" | "approved" | "rejected";
export const PROFESSIONAL_ROLES = ["coach", "nutritionist"] as const;
export const ASSIGNABLE_ROLES = ["athlete", "coach", "nutritionist"] as const;
export type AssignableRole = typeof ASSIGNABLE_ROLES[number];

export function isProfessionalRole(role: string): role is "coach" | "nutritionist" {
  return role === "coach" || role === "nutritionist";
}

/**
 * Super admin: the database flag (scripts/grant-superadmin.mjs) or an address
 * listed in SUPERADMIN_EMAILS. The list only counts for a *verified* address —
 * otherwise anyone could register that email first and inherit the panel.
 */
export function isSuperAdmin(
  account: { isSuperAdmin?: boolean | null; email: string; emailVerified?: boolean | null },
  env: { SUPERADMIN_EMAILS?: string | undefined; [key: string]: string | undefined } = process.env,
): boolean {
  if (account.isSuperAdmin) return true;
  if (!account.emailVerified) return false;
  const listed = (env.SUPERADMIN_EMAILS ?? "")
    .split(",")
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean);
  return listed.includes(account.email.trim().toLowerCase());
}

/**
 * The role authorization should act on. A coach or nutritionist still under
 * review (or rejected) acts as an athlete everywhere: no portal data, no
 * athletes, no library edits. Null status predates reviews and counts as
 * approved, so scripts and older accounts keep working.
 */
export function effectiveRole(role: string, professionalStatus: string | null | undefined): string {
  if (isProfessionalRole(role) && (professionalStatus === "pending" || professionalStatus === "rejected")) return "athlete";
  return role;
}

/** New professional sign-ups wait for review unless approvals are switched off. */
export function initialProfessionalStatus(env: { PROFESSIONAL_APPROVAL?: string | undefined; [key: string]: string | undefined } = process.env): ProfessionalStatus {
  return env.PROFESSIONAL_APPROVAL === "off" ? "approved" : "pending";
}

export type AdminUserAction =
  | { action: "suspend"; reason?: string }
  | { action: "reactivate" }
  | { action: "set_role"; role: AssignableRole };

/**
 * Guards against an admin locking the panel out: nobody suspends or demotes
 * themselves, and super admins are managed only through the flag or the env.
 */
export function adminActionError(
  action: AdminUserAction,
  actor: { id: string },
  target: { id: string; superAdmin: boolean; role: string; suspended: boolean },
): string | null {
  if (target.id === actor.id) return "cannot_modify_self";
  if (target.superAdmin) return "cannot_modify_super_admin";
  if (action.action === "suspend" && target.suspended) return "already_suspended";
  if (action.action === "reactivate" && !target.suspended) return "not_suspended";
  if (action.action === "set_role" && action.role === target.role) return "role_unchanged";
  return null;
}
