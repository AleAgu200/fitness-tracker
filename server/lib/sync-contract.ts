import { z } from "zod";

export const CURRENT_SYNC_SCHEMA_VERSION = 2;
export const MINIMUM_SYNC_SCHEMA_VERSION = CURRENT_SYNC_SCHEMA_VERSION - 1;
export const MAX_SYNC_MUTATIONS = 100;

export const syncMutationSchema = z.object({
  schemaVersion: z.number().int(),
  mutationId: z.string().min(1).max(128),
  entityType: z.enum(["training_session", "training_set", "nutrition_entry", "body_measurement", "checkin_response"]),
  entityId: z.string().min(1).max(128),
  operation: z.enum(["create", "update", "delete"]),
  baseVersion: z.number().int().nonnegative().nullable().optional(),
  occurredAt: z.number().int().positive(),
  payload: z.unknown(),
});

export const syncPushSchema = z.object({
  deviceId: z.string().min(8).max(128),
  mutations: z.array(syncMutationSchema).min(1).max(MAX_SYNC_MUTATIONS),
});

export type SyncMutation = z.infer<typeof syncMutationSchema>;
export type SyncPush = z.infer<typeof syncPushSchema>;

export function supportsSchemaVersion(version: number): boolean {
  return version >= MINIMUM_SYNC_SCHEMA_VERSION && version <= CURRENT_SYNC_SCHEMA_VERSION;
}

export function encodeSyncCursor(serverSequence: number): string {
  return Buffer.from(JSON.stringify({ v: 1, s: serverSequence }), "utf8").toString("base64url");
}

export function decodeSyncCursor(cursor: string | null): number | null {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { v?: unknown; s?: unknown };
    if (parsed.v !== 1 || typeof parsed.s !== "number" || !Number.isSafeInteger(parsed.s) || parsed.s < 0) return null;
    return parsed.s;
  } catch {
    return null;
  }
}
