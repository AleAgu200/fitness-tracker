export type ProfessionalRole = "coach" | "nutritionist";
export type PortalSection = "attention" | "athletes" | "team" | "foods" | "exercises";

const SECTION_PATHS: Record<PortalSection, string> = {
  attention: "/portal/atencion",
  athletes: "/portal/atletas",
  team: "/portal/equipo",
  foods: "/portal/alimentos",
  exercises: "/portal/ejercicios",
};

/** How long after Google creates an account the portal may still make it professional. */
export const PROFESSIONAL_SETUP_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * A Google sign-up in the portal creates a plain account first; the
 * professional workspace is set up right after. Only a just-created account
 * qualifies: an athlete who has used the app for a while keeps being one.
 */
export function canFinishProfessionalSignup(role: string, createdAt: Date, now = Date.now()): boolean {
  if (role === "coach" || role === "nutritionist") return false;
  return now - createdAt.getTime() < PROFESSIONAL_SETUP_WINDOW_MS;
}

export function availablePortalSections(role: ProfessionalRole): PortalSection[] {
  // Team is listed for every professional: whether they can actually administer
  // one is decided server-side by org role, and a hidden tab is not authorization.
  return role === "nutritionist"
    ? ["attention", "athletes", "team", "foods"]
    : ["attention", "athletes", "team", "foods", "exercises"];
}

export function canAccessPortalPath(role: ProfessionalRole, pathname: string): boolean {
  return role !== "nutritionist" || !pathname.startsWith(SECTION_PATHS.exercises);
}

export function resolveDefaultPortalPath(role: ProfessionalRole, requested?: string | null): string {
  const allowed = availablePortalSections(role);
  const section = allowed.includes(requested as PortalSection)
    ? requested as PortalSection
    : role === "nutritionist" ? "foods" : "attention";
  return SECTION_PATHS[section];
}
