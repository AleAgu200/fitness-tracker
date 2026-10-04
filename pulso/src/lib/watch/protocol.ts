/**
 * Phone ⇄ watch protocol (Wear OS and Apple Watch share it). Pure, so every
 * rule runs under `node --test`.
 *
 * The phone owns the plan and the canonical history. A watch queues commands
 * while disconnected; each carries an ID, the account and session it was
 * issued for, a per-watch sequence, the snapshot revision it saw and an
 * expiry. The phone validates, persists once and acknowledges, so a command
 * delivered twice, late or out of order is applied exactly once — or refused
 * with a reason the watch shows. Commands never carry credentials.
 */

export const WATCH_PROTOCOL_VERSION = 1;

/** A queued command older than this is refused rather than logged into a later day. */
export const COMMAND_TTL_MS = 12 * 60 * 60 * 1000;

export type WatchCommandType = 'log_set' | 'undo_set' | 'start_rest' | 'skip_rest' | 'select_exercise';

export interface WatchCommand {
  v: number;
  commandId: string;
  type: WatchCommandType;
  /** Pseudonymous account key from the snapshot (never the user ID or a token). */
  accountKey: string;
  /** The day's session the command was issued for. */
  sessionKey: string;
  /** Per-watch counter; orders a watch's commands for display, not for validity. */
  seq: number;
  /** Snapshot revision the watch had when it issued the command. */
  baseRevision: number;
  issuedAt: number;
  expiresAt: number;
  slotId?: string;
  weightKg?: number;
  reps?: number;
  /** For undo_set: the log_set command whose set should be removed. */
  targetCommandId?: string;
  /** For select_exercise. */
  index?: number;
  /** For start_rest, seconds. */
  seconds?: number;
}

export type CommandStatus = 'saved' | 'rejected';

export type RejectReason =
  | 'invalid'
  | 'wrong_account'
  | 'stale_session'
  | 'session_ended'
  | 'expired'
  | 'unknown_exercise'
  | 'conflict'
  | 'already_synced'
  | 'not_found';

export interface CommandResult {
  commandId: string;
  status: CommandStatus;
  reason?: RejectReason;
  /** For log_set: the stored set's ID (what an undo refers to). */
  setId?: string | null;
}

const ID = /^[A-Za-z0-9_-]{8,64}$/;
const TYPES: WatchCommandType[] = ['log_set', 'undo_set', 'start_rest', 'skip_rest', 'select_exercise'];

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Strict parse of a command from the wire; anything malformed is null (and refused). */
export function parseCommand(raw: unknown): WatchCommand | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (value.v !== WATCH_PROTOCOL_VERSION) return null;
  if (typeof value.commandId !== 'string' || !ID.test(value.commandId)) return null;
  if (!TYPES.includes(value.type as WatchCommandType)) return null;
  if (typeof value.accountKey !== 'string' || typeof value.sessionKey !== 'string') return null;
  if (!finite(value.seq) || !finite(value.baseRevision) || !finite(value.issuedAt) || !finite(value.expiresAt)) return null;
  const command: WatchCommand = {
    v: WATCH_PROTOCOL_VERSION,
    commandId: value.commandId,
    type: value.type as WatchCommandType,
    accountKey: value.accountKey,
    sessionKey: value.sessionKey,
    seq: value.seq,
    baseRevision: value.baseRevision,
    issuedAt: value.issuedAt,
    expiresAt: Math.min(value.expiresAt, value.issuedAt + COMMAND_TTL_MS),
  };
  if (command.type === 'log_set') {
    if (typeof value.slotId !== 'string' || !finite(value.weightKg) || !finite(value.reps)) return null;
    if (value.weightKg < 0 || value.weightKg > 1000 || !Number.isInteger(value.reps) || value.reps < 1 || value.reps > 100) return null;
    Object.assign(command, { slotId: value.slotId, weightKg: Math.round(value.weightKg * 100) / 100, reps: value.reps });
  }
  if (command.type === 'undo_set') {
    if (typeof value.targetCommandId !== 'string' || !ID.test(value.targetCommandId)) return null;
    command.targetCommandId = value.targetCommandId;
  }
  if (command.type === 'select_exercise') {
    if (!finite(value.index) || !Number.isInteger(value.index) || value.index < 0) return null;
    command.index = value.index;
  }
  if (command.type === 'start_rest') {
    if (!finite(value.seconds) || value.seconds < 10 || value.seconds > 900) return null;
    command.seconds = Math.round(value.seconds);
  }
  return command;
}

export interface PhoneContext {
  accountKey: string | null;
  sessionKey: string | null;
  sessionDone: boolean;
  slotIds: ReadonlySet<string>;
  exerciseCount: number;
  now: number;
  /** Results already stored for command IDs (exactly-once). */
  previous: (commandId: string) => CommandResult | null;
  /** For undo: the current last set of a slot and whether it is still only on this phone. */
  lastSet: (slotId: string) => { setId: string; unsynced: boolean } | null;
  /** The slot a stored set belongs to. */
  slotOfSet: (setId: string) => string | null;
}

export type Decision =
  | { kind: 'apply'; undo?: { slotId: string; setId: string } }
  | { kind: 'duplicate'; result: CommandResult }
  | { kind: 'reject'; reason: RejectReason };

/** Decides what the phone does with a command, before anything is written. */
export function decideCommand(command: WatchCommand, context: PhoneContext): Decision {
  const previous = context.previous(command.commandId);
  if (previous) return { kind: 'duplicate', result: previous };
  if (!context.accountKey || command.accountKey !== context.accountKey) return { kind: 'reject', reason: 'wrong_account' };
  if (context.now > command.expiresAt) return { kind: 'reject', reason: 'expired' };
  if (!context.sessionKey || command.sessionKey !== context.sessionKey) return { kind: 'reject', reason: 'stale_session' };

  switch (command.type) {
    case 'log_set':
      if (context.sessionDone) return { kind: 'reject', reason: 'session_ended' };
      if (!command.slotId || !context.slotIds.has(command.slotId)) return { kind: 'reject', reason: 'unknown_exercise' };
      return { kind: 'apply' };
    case 'undo_set': {
      const target = command.targetCommandId ? context.previous(command.targetCommandId) : null;
      if (!target || target.status !== 'saved' || !target.setId) return { kind: 'reject', reason: 'not_found' };
      const slotId = context.slotOfSet(target.setId);
      if (!slotId) return { kind: 'reject', reason: 'not_found' };
      const last = context.lastSet(slotId);
      // Something was logged after it (on the phone or another command): never remove the wrong set.
      if (!last || last.setId !== target.setId) return { kind: 'reject', reason: 'conflict' };
      if (!last.unsynced) return { kind: 'reject', reason: 'already_synced' };
      return { kind: 'apply', undo: { slotId, setId: target.setId } };
    }
    case 'select_exercise':
      if (command.index == null || command.index >= context.exerciseCount) return { kind: 'reject', reason: 'unknown_exercise' };
      return { kind: 'apply' };
    case 'start_rest':
    case 'skip_rest':
      if (context.sessionDone) return { kind: 'reject', reason: 'session_ended' };
      return { kind: 'apply' };
  }
}

// ── snapshot the phone publishes ────────────────────────────────────────────

export interface WatchExercise {
  slotId: string;
  name: string;
  targetSets: number;
  reps: number;
  weightKg: number;
  stepKg: number;
  sets: { weightKg: number; reps: number }[];
}

export interface WatchSnapshot {
  v: number;
  /** Null when signed out: the watch clears everything account-scoped. */
  accountKey: string | null;
  sessionKey: string | null;
  revision: number;
  publishedAt: number;
  sessionDone: boolean;
  weightUnit: 'kg' | 'lb';
  currentIndex: number;
  exercises: WatchExercise[];
  rest: { endAt: number | null; total: number };
  /** Recent results, so a lost acknowledgement is still learned from the next snapshot. */
  results: CommandResult[];
}

export function signedOutSnapshot(revision: number, now: number): WatchSnapshot {
  return {
    v: WATCH_PROTOCOL_VERSION, accountKey: null, sessionKey: null, revision, publishedAt: now,
    sessionDone: false, weightUnit: 'kg', currentIndex: 0, exercises: [], rest: { endAt: null, total: 0 }, results: [],
  };
}

/** The day's session identity: same before and after the first set, different on another day or plan. */
export function sessionKeyFor(localDate: string, templateId: string | null): string {
  return `${localDate}:${templateId ?? 'none'}`;
}
