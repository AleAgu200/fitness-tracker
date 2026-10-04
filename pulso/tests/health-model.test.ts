/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  dailySteps,
  healthConnectStage,
  healthKitStage,
  heartRateBpm,
  isOwnRecord,
  localDateOf,
  pickProviderSummary,
  sleepByWakeDate,
  sleepForDate,
  unionMinutes,
  weightKg,
  workoutExportFor,
} from '../src/lib/health/model';

const H = 60 * 60 * 1000;
const at = (iso: string) => Date.parse(iso);
const utcMinus6 = () => -360; // Honduras, no DST

describe('sleep', () => {
  it('counts overlapping intervals once', () => {
    assert.equal(unionMinutes([{ start: 0, end: 2 * H }, { start: H, end: 3 * H }, { start: 5 * H, end: 6 * H }]), 240);
  });

  it('assigns an overnight sleep to the wake-up date', () => {
    const minutes = sleepByWakeDate([
      { start: at('2026-10-03T04:30:00Z'), end: at('2026-10-03T08:00:00Z'), stage: 'light', tzOffsetMin: -360 },
      { start: at('2026-10-03T08:00:00Z'), end: at('2026-10-03T12:30:00Z'), stage: 'deep', tzOffsetMin: -360 },
    ], utcMinus6);
    // 22:30 → 06:30 local, woke on Oct 3.
    assert.deepEqual([...minutes], [['2026-10-03', 480]]);
  });

  it('does not count awake or in-bed time', () => {
    const minutes = sleepByWakeDate([
      { start: at('2026-10-03T04:00:00Z'), end: at('2026-10-03T12:00:00Z'), stage: 'in_bed', tzOffsetMin: null },
      { start: at('2026-10-03T05:00:00Z'), end: at('2026-10-03T09:00:00Z'), stage: 'asleep', tzOffsetMin: null },
      { start: at('2026-10-03T09:00:00Z'), end: at('2026-10-03T09:30:00Z'), stage: 'awake', tzOffsetMin: null },
      { start: at('2026-10-03T09:30:00Z'), end: at('2026-10-03T12:00:00Z'), stage: 'rem', tzOffsetMin: null },
    ], utcMinus6);
    assert.equal(minutes.get('2026-10-03'), 390);
  });

  it('two apps writing the same night do not double it', () => {
    const night = { start: at('2026-10-03T05:00:00Z'), end: at('2026-10-03T12:00:00Z'), tzOffsetMin: -360 };
    const minutes = sleepByWakeDate([{ ...night, stage: 'asleep' }, { ...night, stage: 'light' }], utcMinus6);
    assert.equal(minutes.get('2026-10-03'), 420);
  });

  it('uses the recorded offset, so the date survives travel and DST', () => {
    // Woke at 23:30 UTC; recorded at UTC+2 that is 01:30 the next day.
    const date = localDateOf(at('2026-03-29T23:30:00Z'), 120, utcMinus6);
    assert.equal(date, '2026-03-30');
    assert.equal(localDateOf(at('2026-03-29T23:30:00Z'), null, utcMinus6), '2026-03-29');
  });

  it('maps provider stages', () => {
    assert.equal(healthConnectStage(5), 'deep');
    assert.equal(healthConnectStage(1), 'awake');
    assert.equal(healthKitStage(0), 'in_bed');
    assert.equal(healthKitStage(3), 'light');
    assert.equal(healthKitStage(99), 'unknown');
  });
});

describe('one provider per date', () => {
  it('prefers the chosen provider and never sums', () => {
    assert.deepEqual(pickProviderSummary({ health_connect: 8000, apple_health: 7900 }, 'apple_health'), { value: 7900, source: 'apple_health' });
    assert.deepEqual(pickProviderSummary({ health_connect: 8000 }, 'apple_health'), { value: 8000, source: 'health_connect' });
    assert.equal(pickProviderSummary({}, 'health_connect'), null);
  });

  it('a manual sleep overrides the provider and removing it restores it', () => {
    assert.deepEqual(sleepForDate(450, { health_connect: 400 }, 'health_connect'), { value: 450, source: 'manual' });
    assert.deepEqual(sleepForDate(null, { health_connect: 400 }, 'health_connect'), { value: 400, source: 'health_connect' });
  });

  it('keeps missing data apart from zero', () => {
    assert.equal(sleepForDate(null, {}, null), null);
    assert.deepEqual(sleepForDate(null, { health_connect: 0 }, null), { value: 0, source: 'health_connect' });
  });
});

describe('units and plausibility', () => {
  it('normalizes weight to kg', () => {
    assert.equal(weightKg(80, 'kilograms'), 80);
    assert.equal(weightKg(176.37, 'pounds'), 80);
    assert.equal(weightKg(80000, 'grams'), 80);
    assert.equal(weightKg(80, 'stones'), null);
    assert.equal(weightKg(5, 'kilograms'), null);
  });

  it('rejects impossible heart rates and step totals', () => {
    assert.equal(heartRateBpm(62.4), 62);
    assert.equal(heartRateBpm(0), null);
    assert.equal(heartRateBpm(400), null);
    assert.equal(dailySteps(-1), null);
    assert.equal(dailySteps(12345.6), 12346);
  });
});

describe('workout export', () => {
  it('maps only completed sessions with a real duration', () => {
    const base = { id: 's1', status: 'completed', startedAt: 1000, finishedAt: 1000 + H, title: ' Pierna ' };
    assert.deepEqual(workoutExportFor(base), { clientRecordId: 'pulso-session-s1', start: 1000, end: 1000 + H, title: 'Pierna' });
    assert.equal(workoutExportFor({ ...base, status: 'in_progress' }), null);
    assert.equal(workoutExportFor({ ...base, finishedAt: 1000 }), null);
    assert.equal(workoutExportFor({ ...base, finishedAt: 1000 + 20 * H }), null);
    assert.equal(workoutExportFor({ ...base, title: null })?.title, 'Entreno PULSO');
  });

  it('recognises records PULSO wrote, so they are not imported back', () => {
    assert.equal(isOwnRecord({ clientRecordId: 'pulso-session-s1' }, []), true);
    assert.equal(isOwnRecord({ sourceApp: 'com.pulsofitness.pulsofitness' }, ['com.pulsofitness.pulsofitness']), true);
    assert.equal(isOwnRecord({ sourceApp: 'com.google.android.apps.fitness' }, ['com.pulsofitness.pulsofitness']), false);
  });
});
