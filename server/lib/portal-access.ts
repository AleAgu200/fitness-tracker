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

export interface PortalIdentity {
  /** Effective role (a professional under review counts as athlete). */
  role: string;
  storedRole: string;
  professionalStatus: string | null;
  isSuperAdmin: boolean;
}

/**
 * Which shell the portal renders:
 * - professional: the clinical workspace (plus ADMIN when also super admin)
 * - admin: super admin without a professional role, only the admin panel
 * - pending / rejected: a professional sign-up waiting on (or refused by) review
 * - none: an athlete account, which the portal does not serve
 */
export type PortalMode = "professional" | "admin" | "pending" | "rejected" | "none";

export function portalMode(me: PortalIdentity): PortalMode {
  if (me.role === "coach" || me.role === "nutritionist") return "professional";
  if (me.isSuperAdmin) return "admin";
  if (me.storedRole === "coach" || me.storedRole === "nutritionist") {
    return me.professionalStatus === "rejected" ? "rejected" : "pending";
  }
  return "none";
}

/** Routes a mode may open; everything else redirects to its home. */
export function canOpenInMode(mode: PortalMode, role: string, pathname: string, isSuperAdmin: boolean): boolean {
  if (pathname.startsWith("/portal/admin")) return isSuperAdmin;
  if (mode === "professional") return canAccessPortalPath(role as ProfessionalRole, pathname);
  if (mode === "pending") return pathname === "/portal/perfil" || pathname === "/portal/revision";
  return false;
}

export function homeForMode(mode: PortalMode): string {
  return mode === "admin" ? "/portal/admin" : mode === "pending" ? "/portal/revision" : "/portal";
}
