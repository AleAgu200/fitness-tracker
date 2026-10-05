/**
 * Multi-device sync rules that need no database (unit tested without
 * PostgreSQL). Every synced record is one row per (athlete, table, record ID)
 * holding the latest version; the most recent change wins.
 */

/** Phone tables that sync between an athlete's devices. Anything else is refused. */
export const SYNC_TABLES = [
  "onboarding_state",
  "generation_profiles",
  "nutrition_settings",
  "exercises",
  "programs",
  "program_phases",
  "workout_templates",
  "template_exercise_slots",
  "workout_sessions",
  "logged_exercises",
  "logged_sets",
  "session_cards",
  "body_measurements",
  "sleep_entries",
  "daily_check_ins",
  "meal_plans",
  "meal_slots",
  "meal_slot_skips",
  "daily_nutrition_logs",
  "meal_log_entries",
  "saved_foods",
  "beverage_containers",
  "consumptions",
  "ai_recommendations",
  "ai_feedback",
] as const;

export type SyncTable = typeof SYNC_TABLES[number];

export const MAX_CHANGES_PER_PUSH = 500;
export const MAX_RECORD_BYTES = 64 * 1024;
export const MAX_PULL_LIMIT = 1000;

export interface IncomingChange {
  table: string;
  id: string;
  op: "upsert" | "delete";
  payload?: unknown;
  changedAt: number;
}

export type ChangeError = "unknown_table" | "invalid_id" | "invalid_payload" | "payload_too_large" | "foreign_account" | "invalid_time";

/** Columns that name the owning account; a record must name the pusher or nobody. */
const OWNER_COLUMNS = ["athleteId", "userId"] as const;

export function validateChange(change: IncomingChange, athleteId: string, now = Date.now()): ChangeError | null {
  if (!(SYNC_TABLES as readonly string[]).includes(change.table)) return "unknown_table";
  if (typeof change.id !== "string" || change.id.length < 1 || change.id.length > 128) return "invalid_id";
  // A clock far in the future would win every conflict forever.
  if (!Number.isFinite(change.changedAt) || change.changedAt < 0 || change.changedAt > now + 24 * 60 * 60 * 1000) return "invalid_time";
  if (change.op === "delete") return null;
  if (!change.payload || typeof change.payload !== "object" || Array.isArray(change.payload)) return "invalid_payload";
  if (Buffer.byteLength(JSON.stringify(change.payload), "utf8") > MAX_RECORD_BYTES) return "payload_too_large";
  const payload = change.payload as Record<string, unknown>;
  for (const column of OWNER_COLUMNS) {
    if (payload[column] != null && payload[column] !== athleteId) return "foreign_account";
  }
  return null;
}

/**
 * Whether an incoming version replaces the stored one: the later change wins;
 * on an exact tie the device ID decides, so every device converges the same way.
 */
export function incomingWins(
  stored: { changedAt: number; deviceId: string } | null,
  incoming: { changedAt: number; deviceId: string },
): boolean {
  if (!stored) return true;
  if (incoming.changedAt !== stored.changedAt) return incoming.changedAt > stored.changedAt;
  return incoming.deviceId > stored.deviceId;
}
