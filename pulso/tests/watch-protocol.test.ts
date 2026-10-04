/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CommandResult, COMMAND_TTL_MS, decideCommand, parseCommand, PhoneContext, sessionKeyFor, WatchCommand } from '../src/lib/watch/protocol';

const NOW = 1_800_000_000_000;
const SESSION = sessionKeyFor('2026-10-04', 'tpl1');

function command(overrides: Partial<WatchCommand> = {}): WatchCommand {
  return {
    v: 1, commandId: 'cmd_00000001', type: 'log_set', accountKey: 'acct_a', sessionKey: SESSION,
    seq: 1, baseRevision: 3, issuedAt: NOW - 1000, expiresAt: NOW + COMMAND_TTL_MS,
    slotId: 'slot1', weightKg: 60, reps: 8, ...overrides,
  };
}

function context(overrides: Partial<PhoneContext> = {}, stored: Record<string, CommandResult> = {}): PhoneContext {
  return {
    accountKey: 'acct_a', sessionKey: SESSION, sessionDone: false,
    slotIds: new Set(['slot1', 'slot2']), exerciseCount: 2, now: NOW,
    previous: id => stored[id] ?? null,
    lastSet: () => null,
    slotOfSet: () => null,
    ...overrides,
  };
}

describe('parseCommand', () => {
  it('accepts a well-formed set and caps the expiry', () => {
    const parsed = parseCommand({ ...command(), expiresAt: NOW + 10 * COMMAND_TTL_MS });
    assert.ok(parsed);
    assert.equal(parsed?.expiresAt, NOW - 1000 + COMMAND_TTL_MS);
  });

  it('rejects malformed or out-of-range commands', () => {
    assert.equal(parseCommand({ ...command(), reps: 0 }), null);
    assert.equal(parseCommand({ ...command(), reps: 2.5 }), null);
    assert.equal(parseCommand({ ...command(), weightKg: -5 }), null);
    assert.equal(parseCommand({ ...command(), commandId: 'x' }), null);
    assert.equal(parseCommand({ ...command(), type: 'delete_everything' }), null);
    assert.equal(parseCommand({ ...command(), v: 2 }), null);
    assert.equal(parseCommand({ ...command(), type: 'undo_set' }), null);
    assert.equal(parseCommand('{"v":1}'), null);
  });
});

describe('decideCommand', () => {
  it('applies a valid set once and returns the stored result on redelivery', () => {
    assert.deepEqual(decideCommand(command(), context()), { kind: 'apply' });
    const stored = { cmd_00000001: { commandId: 'cmd_00000001', status: 'saved' as const, setId: 'set1' } };
    assert.deepEqual(decideCommand(command(), context({}, stored)), { kind: 'duplicate', result: stored.cmd_00000001 });
  });

  it('refuses another account, including after sign-out', () => {
    assert.deepEqual(decideCommand(command({ accountKey: 'acct_b' }), context()), { kind: 'reject', reason: 'wrong_account' });
    assert.deepEqual(decideCommand(command(), context({ accountKey: null })), { kind: 'reject', reason: 'wrong_account' });
  });

  it('refuses expired, stale-session and ended-session commands', () => {
    assert.deepEqual(decideCommand(command({ expiresAt: NOW - 1 }), context()), { kind: 'reject', reason: 'expired' });
    assert.deepEqual(decideCommand(command({ sessionKey: sessionKeyFor('2026-10-03', 'tpl1') }), context()), { kind: 'reject', reason: 'stale_session' });
    assert.deepEqual(decideCommand(command(), context({ sessionDone: true })), { kind: 'reject', reason: 'session_ended' });
    assert.deepEqual(decideCommand(command({ slotId: 'gone' }), context()), { kind: 'reject', reason: 'unknown_exercise' });
  });

  it('accepts commands out of order: each is judged on its own', () => {
    assert.deepEqual(decideCommand(command({ commandId: 'cmd_00000009', seq: 9 }), context()), { kind: 'apply' });
    assert.deepEqual(decideCommand(command({ commandId: 'cmd_00000002', seq: 2, baseRevision: 1 }), context()), { kind: 'apply' });
  });

  describe('undo', () => {
    const logged = { cmd_00000001: { commandId: 'cmd_00000001', status: 'saved' as const, setId: 'set1' } };
    const undo = command({ commandId: 'cmd_00000002', type: 'undo_set', targetCommandId: 'cmd_00000001' });

    it('removes the set it logged while it is still the last one and only on the phone', () => {
      const ctx = context({ slotOfSet: () => 'slot1', lastSet: () => ({ setId: 'set1', unsynced: true }) }, logged);
      assert.deepEqual(decideCommand(undo, ctx), { kind: 'apply', undo: { slotId: 'slot1', setId: 'set1' } });
    });

    it('surfaces a conflict when another set was logged after it', () => {
      const ctx = context({ slotOfSet: () => 'slot1', lastSet: () => ({ setId: 'set2', unsynced: true }) }, logged);
      assert.deepEqual(decideCommand(undo, ctx), { kind: 'reject', reason: 'conflict' });
    });

    it('does not undo a set the server already has', () => {
      const ctx = context({ slotOfSet: () => 'slot1', lastSet: () => ({ setId: 'set1', unsynced: false }) }, logged);
      assert.deepEqual(decideCommand(undo, ctx), { kind: 'reject', reason: 'already_synced' });
    });

    it('cannot undo a set that was never saved', () => {
      assert.deepEqual(decideCommand(undo, context()), { kind: 'reject', reason: 'not_found' });
      const rejected = { cmd_00000001: { commandId: 'cmd_00000001', status: 'rejected' as const, reason: 'expired' as const } };
      assert.deepEqual(decideCommand(undo, context({}, rejected)), { kind: 'reject', reason: 'not_found' });
    });
  });
});
