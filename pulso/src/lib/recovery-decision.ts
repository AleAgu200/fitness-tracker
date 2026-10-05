/**
 * What a signed-in phone does before onboarding, from verified facts only.
 * Pure, so every branch is unit tested. A network failure never means "new
 * athlete": onboarding starts only after the server confirms there is no
 * copy, or after the athlete explicitly chooses to start without one.
 */

export type BackupLookup =
  | { status: 'found'; revision: number; createdAt: number; totalRows: number }
  | { status: 'absent' }
  | { status: 'unavailable' };

export type RecoveryRoute =
  | { kind: 'continue'; settle: boolean }
  /** The account syncs its devices: this phone fills itself from the others. */
  | { kind: 'offer_sync'; records: number }
  | { kind: 'offer_restore'; revision: number; createdAt: number; totalRows: number }
  | { kind: 'retry' };

export function decideRecovery(input: {
  /** Recovery already finished, or was explicitly declined, on this phone. */
  settled: boolean;
  /** This phone already holds history for the account. */
  localHistory: boolean;
  lookup: BackupLookup | null;
  /** Multi-device sync of the account, when the server answered. */
  sync?: { active: boolean; records: number } | null;
}): RecoveryRoute {
  if (input.settled) return { kind: 'continue', settle: false };
  // Existing data stays usable offline and is never replaced automatically;
  // restoring onto it is an explicit choice in Configuración.
  if (input.localHistory) return { kind: 'continue', settle: true };
  // Synced devices hold the latest data: better than a daily copy.
  if (input.sync?.active && input.sync.records > 0) return { kind: 'offer_sync', records: input.sync.records };
  const lookup = input.lookup ?? { status: 'unavailable' };
  if (lookup.status === 'found') {
    return { kind: 'offer_restore', revision: lookup.revision, createdAt: lookup.createdAt, totalRows: lookup.totalRows };
  }
  if (lookup.status === 'absent') return { kind: 'continue', settle: true };
  return { kind: 'retry' };
}
