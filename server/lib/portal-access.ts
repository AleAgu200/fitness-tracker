export type ProfessionalRole = "coach" | "nutritionist";
export type PortalSection = "attention" | "athletes" | "foods" | "exercises";

const SECTION_PATHS: Record<PortalSection, string> = {
  attention: "/portal/atencion",
  athletes: "/portal/atletas",
  foods: "/portal/alimentos",
  exercises: "/portal/ejercicios",
};

export function availablePortalSections(role: ProfessionalRole): PortalSection[] {
  return role === "nutritionist"
    ? ["attention", "athletes", "foods"]
    : ["attention", "athletes", "foods", "exercises"];
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
