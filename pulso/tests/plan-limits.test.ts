/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canCreateOwnPlan,
  copyPlanName,
  lockedPlanIds,
  nextPlanName,
  normalizePlanName,
} from '../src/lib/plan-limits';

const plan = (id: string, origin: string, createdAt: number, lastActivatedAt: number | null = null) =>
  ({ id, origin, createdAt, lastActivatedAt });

describe('plan limits', () => {
  it('lets a free account create its first own plan only', () => {
    assert.equal(canCreateOwnPlan([plan('c', 'coach', 1), plan('a', 'ai', 2)], false), true);
    assert.equal(canCreateOwnPlan([plan('o', 'own', 1)], false), false);
    assert.equal(canCreateOwnPlan([plan('o', 'own', 1), plan('p', 'own', 2)], true), true);
  });

  it('locks nothing with Plus', () => {
    assert.equal(lockedPlanIds([plan('o', 'own', 1), plan('p', 'own', 2)], true).size, 0);
  });

  it('keeps the most recently activated own plan usable without Plus', () => {
    const locked = lockedPlanIds([
      plan('old', 'own', 1, 10),
      plan('recent', 'own', 2, 50),
      plan('never', 'own', 3),
      plan('coach', 'coach', 4),
    ], false);
    assert.deepEqual([...locked].sort(), ['never', 'old']);
  });

  it('falls back to the oldest own plan when none was activated', () => {
    const locked = lockedPlanIds([plan('b', 'own', 5), plan('a', 'own', 1)], false);
    assert.deepEqual([...locked], ['b']);
  });

  it('never locks assigned or AI plans', () => {
    assert.equal(lockedPlanIds([plan('n', 'nutritionist', 1), plan('a', 'ai', 2)], false).size, 0);
  });
});

describe('plan names', () => {
  it('normalizes whitespace and rejects empty names', () => {
    assert.equal(normalizePlanName('  Fuerza   A '), 'Fuerza A');
    assert.equal(normalizePlanName('   '), null);
  });

  it('numbers new names past the ones in use', () => {
    assert.equal(nextPlanName('Plan personal', []), 'Plan personal');
    assert.equal(nextPlanName('Plan personal', ['plan personal', 'Plan personal 2']), 'Plan personal 3');
  });

  it('keeps copies of maximum-length names within the limit and terminating', () => {
    const long = 'x'.repeat(40);
    const first = copyPlanName(long, []);
    assert.equal(first.length, 40);
    assert.ok(first.endsWith(' (copia)'));
    const second = copyPlanName(long, [long, first]);
    assert.equal(second.length, 40);
    assert.ok(second.endsWith(' (copia 2)'));
    assert.equal(nextPlanName(long, [long]).length, 40);
  });

  it('numbers copies without stacking suffixes', () => {
    assert.equal(copyPlanName('Fuerza', []), 'Fuerza (copia)');
    assert.equal(copyPlanName('Fuerza (copia)', ['Fuerza (copia)']), 'Fuerza (copia 2)');
  });
});
