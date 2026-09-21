export type ProfessionalRole = "coach" | "nutritionist";
export type PortalSection = "attention" | "athletes" | "team" | "foods" | "exercises";

const SECTION_PATHS: Record<PortalSection, string> = {
  attention: "/portal/atencion",
  athletes: "/portal/atletas",
  team: "/portal/equipo",
  foods: "/portal/alimentos",
  exercises: "/portal/ejercicios",
};

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
