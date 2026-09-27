// Display helpers shared by the athlete record tabs.

export function percent(value: number | null): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

export function dateTime(value: number | null): string {
  return value == null ? "—" : new Date(value).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function shortDate(value: number): string {
  return new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

export function freshness(value: number | null): string {
  if (!value) return "sin datos";
  const minutes = Math.max(0, Math.floor((Date.now() - value) / 60_000));
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `hace ${hours} h` : `hace ${Math.floor(hours / 24)} d`;
}

export function kg(value: number, digits = 1): string {
  return `${value.toLocaleString("es-AR", { maximumFractionDigits: digits, minimumFractionDigits: 0 })} kg`;
}

const ACTION_LABELS: Record<string, string> = {
  "athlete_record.viewed": "Expediente consultado",
  "athlete_account.deletion_requested": "El atleta pidió borrar su cuenta",
  "athlete_account.deletion_cancelled": "El atleta canceló el borrado de su cuenta",
  "athlete_account.deleted": "Cuenta de atleta eliminada",
  "sharing_consent.granted": "El atleta compartió una categoría",
  "sharing_consent.revoked": "El atleta dejó de compartir una categoría",
  "care_assignment.created": "Profesional asignado",
  "care_assignment.created_from_legacy_link": "Profesional asignado",
  "care_assignment.updated": "Asignación actualizada",
  "care_assignment.revoked": "Asignación finalizada",
  "checkin.requested": "Check-in solicitado",
  "checkin.reviewed": "Check-in revisado",
  "follow_up_task.created": "Tarea creada",
  "plan_published": "Plan publicado",
  "plan_draft_discarded": "Borrador de plan descartado",
  "plan_reverted_to_draft": "Plan devuelto a borrador",
};

/** Audit action codes as sentences; unknown codes stay readable instead of raw. */
export function describeAction(action: string): string {
  const known = ACTION_LABELS[action];
  if (known) return known;
  const text = action.replaceAll(".", " · ").replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const METADATA_LABELS: Record<string, string> = {
  fromVersion: "desde versión",
  version: "versión",
  discipline: "disciplina",
  categories: "categorías",
  category: "categoría",
  periodDays: "período",
  purgeAfter: "se borra",
  requestedAt: "pedido",
};

const VALUE_LABELS: Record<string, string> = {
  training: "entrenamiento",
  nutrition: "nutrición",
  metrics: "métricas",
  checkins: "check-ins",
  photos: "fotos",
  coach: "entrenamiento",
  nutritionist: "nutrición",
};

/** Audit metadata as readable "clave: valor" pairs instead of raw JSON. */
export function describeMetadata(metadata: Record<string, unknown> | null): string[] {
  if (!metadata) return [];
  return Object.entries(metadata).flatMap(([key, value]) => {
    if (value == null || value === "") return [];
    const label = METADATA_LABELS[key] ?? key;
    if (Array.isArray(value)) return [`${label}: ${value.map(item => VALUE_LABELS[String(item)] ?? String(item)).join(", ") || "ninguna"}`];
    if (key === "periodDays") return [`${label}: ${value} días`];
    if (typeof value === "number" && value > 1_000_000_000_000) return [`${label}: ${dateTime(value)}`];
    if (key.endsWith("Id")) return []; // internal references mean nothing to a reader
    if (typeof value === "object") return [];
    return [`${label}: ${VALUE_LABELS[String(value)] ?? String(value)}`];
  });
}
