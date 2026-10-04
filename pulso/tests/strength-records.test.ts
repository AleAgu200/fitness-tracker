/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeExerciseRecords, estimateOneRepMax, newSetImproves } from '../src/lib/strength-records';

const round = (value: number | null) => (value == null ? null : Math.round(value * 10) / 10);

describe('estimateOneRepMax', () => {
  it('matches the expected cases', () => {
    assert.equal(estimateOneRepMax(100, 1), 100);
    assert.equal(round(estimateOneRepMax(100, 3)), 110);
    assert.equal(round(estimateOneRepMax(100, 6)), 120);
    assert.equal(round(estimateOneRepMax(95, 10)), 126.7);
  });

  it('has no estimate for zero, non-finite load or reps outside 1–10', () => {
    assert.equal(estimateOneRepMax(0, 5), null);
    assert.equal(estimateOneRepMax(-10, 5), null);
    assert.equal(estimateOneRepMax(Number.NaN, 5), null);
    assert.equal(estimateOneRepMax(Number.POSITIVE_INFINITY, 5), null);
    assert.equal(estimateOneRepMax(100, 11), null);
    assert.equal(estimateOneRepMax(100, 0), null);
    assert.equal(estimateOneRepMax(100, 2.5), null);
  });
});

describe('computeExerciseRecords', () => {
  it('keeps heaviest load and best estimate as separate records', () => {
    const records = computeExerciseRecords([
      { weightKg: 100, reps: 1, completedAt: 1 },
      { weightKg: 95, reps: 10, completedAt: 2 },
    ], 'barbell');
    assert.equal(records.heaviest?.weightKg, 100);
    assert.equal(records.bestEstimate?.weightKg, 95);
    assert.equal(round(records.bestEstimate?.e1rm ?? null), 126.7);
  });

  it('ignores warm-ups and sets past 10 reps for the estimate', () => {
    const records = computeExerciseRecords([
      { weightKg: 140, reps: 3, completedAt: 1, kind: 'warmup' },
      { weightKg: 60, reps: 20, completedAt: 2 },
      { weightKg: 80, reps: 5, completedAt: 3 },
    ], 'barbell');
    assert.equal(records.heaviest?.weightKg, 80);
    assert.equal(records.bestEstimate?.weightKg, 80);
    assert.equal(records.repRecords[20], undefined);
    assert.equal(records.mostReps?.reps, 20);
  });

  it('gives bodyweight and assisted exercises no estimate but keeps rep records', () => {
    for (const equipment of ['bodyweight', 'assisted']) {
      const records = computeExerciseRecords([{ weightKg: 10, reps: 8, completedAt: 1 }, { weightKg: 0, reps: 15, completedAt: 2 }], equipment);
      assert.equal(records.bestEstimate, null);
      assert.equal(records.mostReps?.reps, 15);
    }
  });

  it('tracks the heaviest load for each exact rep count', () => {
    const records = computeExerciseRecords([
      { weightKg: 80, reps: 5, completedAt: 1 },
      { weightKg: 85, reps: 5, completedAt: 2 },
      { weightKg: 90, reps: 3, completedAt: 3 },
    ], 'barbell');
    assert.equal(records.repRecords[5]?.weightKg, 85);
    assert.equal(records.repRecords[3]?.weightKg, 90);
  });

  it('recomputes from surviving sets after the best one is deleted', () => {
    const sets = [
      { weightKg: 100, reps: 5, completedAt: 1 },
      { weightKg: 90, reps: 5, completedAt: 2 },
    ];
    assert.equal(computeExerciseRecords(sets, 'barbell').heaviest?.weightKg, 100);
    assert.equal(computeExerciseRecords(sets.slice(1), 'barbell').heaviest?.weightKg, 90);
    assert.deepEqual(computeExerciseRecords([], 'barbell'), { heaviest: null, bestEstimate: null, repRecords: {}, mostReps: null });
  });

  it('keeps the earliest of equal sets, so recomputing is stable', () => {
    const records = computeExerciseRecords([
      { weightKg: 100, reps: 5, completedAt: 5 },
      { weightKg: 100, reps: 5, completedAt: 1 },
    ], 'barbell');
    assert.equal(records.heaviest?.at, 1);
    assert.equal(records.bestEstimate?.at, 1);
  });
});

describe('newSetImproves', () => {
  const base = computeExerciseRecords([{ weightKg: 100, reps: 1, completedAt: 1 }], 'barbell');

  it('a lighter, higher-rep set can improve the estimate without a heavier load', () => {
    assert.deepEqual(newSetImproves(base, { weightKg: 95, reps: 10, completedAt: 2 }, 'barbell'), { heavier: false, strongerEstimate: true });
  });

  it('a warm-up never counts as a record', () => {
    assert.deepEqual(newSetImproves(base, { weightKg: 120, reps: 1, completedAt: 2, kind: 'warmup' }, 'barbell'), { heavier: false, strongerEstimate: false });
  });

  it('the first set ever is a baseline, not a record', () => {
    const empty = computeExerciseRecords([], 'barbell');
    assert.deepEqual(newSetImproves(empty, { weightKg: 50, reps: 5, completedAt: 1 }, 'barbell'), { heavier: false, strongerEstimate: false });
  });
});
