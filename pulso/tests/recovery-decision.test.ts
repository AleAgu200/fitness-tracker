/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decideRecovery } from '../src/lib/recovery-decision';

const found = { status: 'found' as const, revision: 4, createdAt: 1000, totalRows: 320 };

describe('decideRecovery', () => {
  it('offers the copy on a fresh phone', () => {
    assert.deepEqual(decideRecovery({ settled: false, localHistory: false, lookup: found }), { kind: 'offer_restore', revision: 4, createdAt: 1000, totalRows: 320 });
  });

  it('never treats a failed lookup as a new athlete', () => {
    assert.deepEqual(decideRecovery({ settled: false, localHistory: false, lookup: { status: 'unavailable' } }), { kind: 'retry' });
    assert.deepEqual(decideRecovery({ settled: false, localHistory: false, lookup: null }), { kind: 'retry' });
  });

  it('starts setup only after a verified absence', () => {
    assert.deepEqual(decideRecovery({ settled: false, localHistory: false, lookup: { status: 'absent' } }), { kind: 'continue', settle: true });
  });

  it('keeps a phone with history working offline, without replacing it', () => {
    assert.deepEqual(decideRecovery({ settled: false, localHistory: true, lookup: null }), { kind: 'continue', settle: true });
    assert.deepEqual(decideRecovery({ settled: false, localHistory: true, lookup: found }), { kind: 'continue', settle: true });
  });

  it('asks only once per phone', () => {
    assert.deepEqual(decideRecovery({ settled: true, localHistory: false, lookup: found }), { kind: 'continue', settle: false });
  });
});
