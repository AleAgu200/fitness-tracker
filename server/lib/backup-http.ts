import { BackupError } from "@/lib/personal-backup";
import { WriterDeviceConflictError } from "@/lib/sync";

const STATUS: Record<BackupError["code"], number> = {
  payload_too_large: 413,
  checksum_mismatch: 400,
  invalid_payload: 400,
  unsupported_format: 422,
  foreign_account: 403,
  backup_disabled: 403,
  subscription_required: 402,
  account_deletion_pending: 423,
  shrink_requires_confirmation: 412,
  backup_not_found: 404,
  backup_corrupt: 410,
};

/** Maps a backup failure to a stable `{ error }` response; rethrows anything else. */
export function backupErrorResponse(error: unknown): Response {
  if (error instanceof BackupError) return Response.json({ error: error.code }, { status: STATUS[error.code] });
  if (error instanceof WriterDeviceConflictError) return Response.json({ error: error.message }, { status: 409 });
  throw error;
}

export const NO_STORE = { "Cache-Control": "no-store" } as const;
