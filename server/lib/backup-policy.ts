import { createHash } from "node:crypto";

/**
 * Personal backup rules that need no database, so they are unit tested
 * without PostgreSQL (the same split as entitlement-policy.ts).
 */

/** Snapshot formats this server can store and serve. */
export const SUPPORTED_BACKUP_FORMATS = [1] as const;

/** Complete copies kept while the athlete has Plus. */
export const MAX_VERSIONS_WITH_PLUS = 7;

/** A whole phone's history is a few MB; this bounds abuse, not real use. */
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

/**
 * A new copy with less than this share of the previous copy's history rows
 * needs explicit confirmation: it usually means a freshly installed or
 * partially restored phone, which must never silently replace a full copy.
 */
export const SHRINK_CONFIRM_RATIO = 0.5;

export interface BackupManifest {
  formatVersion: number;
  /** Rows per table in this copy. */
  counts: Record<string, number>;
  totalRows: number;
  /** What the copy deliberately leaves out, with a reason code. */
  excluded: { area: string; reason: string }[];
  createdAt: number;
}

export interface ParsedBackup {
  formatVersion: number;
  owner: string;
  createdAt: number;
  bootstrap: Record<string, unknown>;
  tables: Record<string, unknown[]>;
  excluded: { area: string; reason: string }[];
}

export type UploadError =
  | "payload_too_large"
  | "checksum_mismatch"
  | "invalid_payload"
  | "unsupported_format"
  | "foreign_account";

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Verifies an uploaded copy byte-for-byte (the checksum covers the exact JSON
 * the phone produced) and that it belongs to the uploading account.
 */
export function validateBackupUpload(input: {
  ownerId: string;
  checksum: string;
  payloadJson: string;
}): { ok: true; parsed: ParsedBackup; manifest: BackupManifest; sizeBytes: number } | { ok: false; error: UploadError } {
  const sizeBytes = Buffer.byteLength(input.payloadJson, "utf8");
  if (sizeBytes > MAX_BACKUP_BYTES) return { ok: false, error: "payload_too_large" };
  if (sha256Hex(input.payloadJson) !== input.checksum.toLowerCase()) return { ok: false, error: "checksum_mismatch" };

  let raw: unknown;
  try {
    raw = JSON.parse(input.payloadJson);
  } catch {
    return { ok: false, error: "invalid_payload" };
  }
  if (!raw || typeof raw !== "object") return { ok: false, error: "invalid_payload" };
  const value = raw as Record<string, unknown>;
  if (value.format !== "pulso-backup") return { ok: false, error: "invalid_payload" };
  if (!(SUPPORTED_BACKUP_FORMATS as readonly number[]).includes(Number(value.formatVersion))) {
    return { ok: false, error: "unsupported_format" };
  }
  if (value.owner !== input.ownerId) return { ok: false, error: "foreign_account" };
  if (!value.tables || typeof value.tables !== "object" || Array.isArray(value.tables)) return { ok: false, error: "invalid_payload" };
  if (!value.bootstrap || typeof value.bootstrap !== "object") return { ok: false, error: "invalid_payload" };

  const tables: Record<string, unknown[]> = {};
  for (const [name, rows] of Object.entries(value.tables as Record<string, unknown>)) {
    if (!Array.isArray(rows)) return { ok: false, error: "invalid_payload" };
    tables[name] = rows;
  }
  const excluded = Array.isArray(value.excluded)
    ? (value.excluded as unknown[]).flatMap(item => {
        const entry = item as { area?: unknown; reason?: unknown };
        return typeof entry?.area === "string" && typeof entry.reason === "string" ? [{ area: entry.area, reason: entry.reason }] : [];
      })
    : [];
  const createdAt = Number(value.createdAt);
  const parsed: ParsedBackup = {
    formatVersion: Number(value.formatVersion),
    owner: input.ownerId,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    bootstrap: value.bootstrap as Record<string, unknown>,
    tables,
    excluded,
  };
  return { ok: true, parsed, manifest: buildManifest(parsed), sizeBytes };
}

/** Counts come from the payload itself, never from a client-reported summary. */
export function buildManifest(parsed: ParsedBackup): BackupManifest {
  const counts: Record<string, number> = {};
  let totalRows = 0;
  for (const [name, rows] of Object.entries(parsed.tables)) {
    counts[name] = rows.length;
    totalRows += rows.length;
  }
  return { formatVersion: parsed.formatVersion, counts, totalRows, excluded: parsed.excluded, createdAt: parsed.createdAt };
}

/** Whether a new copy is much smaller than the latest one and needs confirmation. */
export function shrinkNeedsConfirmation(previous: BackupManifest | null, next: BackupManifest): boolean {
  if (!previous || previous.totalRows === 0) return false;
  return next.totalRows < previous.totalRows * SHRINK_CONFIRM_RATIO;
}

/**
 * Which stored copies to delete, given rows newest first. With Plus the last
 * seven stay. Without it only the newest verified copy stays — frozen,
 * restorable and exportable for free — and older ones go only once that copy
 * has been verified, so pruning can never leave the athlete with nothing.
 */
export function versionsToPrune(
  newestFirst: { id: string }[],
  entitled: boolean,
  newestVerified: boolean,
): string[] {
  if (entitled) return newestFirst.slice(MAX_VERSIONS_WITH_PLUS).map(row => row.id);
  if (!newestVerified) return [];
  return newestFirst.slice(1).map(row => row.id);
}
