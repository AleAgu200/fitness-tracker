/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  comparePulse,
  computeMuscleLoad,
  computePulseCore,
  computeStrengthTrend,
  generateFreeSession,
  LibraryExercise,
  selectSessionCard,
} from '../src/lib/pulse-engine';
import { buildWeeklySummary, hasWeeklyData } from '../src/lib/weekly-summary';
import { mondayOf } from '../src/lib/dates';
import { bench, daysAgo, fixtures, NOW, row, session, sets, squat } from './fixtures';

const coreInput = {
  now: NOW,
  streakDays: 0,
  plannedDaysPerWeek: 4,
  nutritionPct: null,
  hydrationPct: 0,
};

describe('computePulseCore', () => {
  it('is LATENTE for a brand-new athlete, with no momentum', () => {
    const core = computePulseCore({ ...coreInput, sessions: fixtures.newUser });
    assert.equal(core.state, 'LATENTE');
    assert.equal(core.momentum, 0);
    assert.equal(core.halo, false);
  });

  it('is ACTIVO with recent, steady training and counts this week', () => {
    const core = computePulseCore({ ...coreInput, sessions: fixtures.active, streakDays: 2 });
    assert.equal(core.state, 'ACTIVO');
    assert.equal(core.weekSessions, 2);
    assert.equal(core.weekTarget, 4);
    assert.equal(core.halo, true);
  });

  it('is RECUPERANDO after three hard sessions in three days', () => {
    const core = computePulseCore({ ...coreInput, sessions: fixtures.recovering, streakDays: 3 });
    assert.equal(core.state, 'RECUPERANDO');
    assert.equal(core.tone, 'context');
    assert.equal(core.halo, false);
  });

  it('is REACTIVANDO after a pause, never punitive', () => {
    const core = computePulseCore({ ...coreInput, sessions: fixtures.reactivating });
    assert.equal(core.state, 'REACTIVANDO');
    assert.equal(core.tone, 'continuity');
  });

  it('is CARGADO once today’s session is completed', () => {
    const today = session(NOW - 60_000, [row(sets([60, 8]))]);
    assert.equal(computePulseCore({ ...coreInput, sessions: [...fixtures.active, today] }).state, 'CARGADO');
  });

  it('is ESTABLE when the planned week is already done', () => {
    const core = computePulseCore({ ...coreInput, plannedDaysPerWeek: 2, sessions: fixtures.active });
    assert.equal(core.state, 'ESTABLE');
  });

  it('leaves nutrition out of momentum when there is no meal plan', () => {
    const core = computePulseCore({ ...coreInput, sessions: fixtures.active });
    assert.ok(!core.components.some(component => component.key === 'nutrition'));
  });
});

describe('comparePulse', () => {
  const previous = { bestSet: { weightKg: 60, reps: 8, rpe: 8 }, at: daysAgo(3) };

  it('marks a first time as reference, not a comparison', () => {
    assert.equal(comparePulse(null, { weightKg: 60, reps: 8, rpe: 8 }, NOW).mode, 'first');
  });

  it('asks for one more rep at the same weight, never more load', () => {
    const tie = comparePulse(previous, { weightKg: 60, reps: 8, rpe: 8 }, NOW);
    assert.equal(tie.mode, 'match');
    assert.equal(tie.repsToBeat, 1);
    const oneShort = comparePulse(previous, { weightKg: 60, reps: 7, rpe: 8 }, NOW);
    assert.equal(oneShort.mode, 'close');
    assert.equal(oneShort.repsToBeat, 2);
  });

  it('detects beating, control and consolidation', () => {
    assert.equal(comparePulse(previous, { weightKg: 60, reps: 9, rpe: 8 }, NOW).mode, 'beat');
    assert.equal(comparePulse(previous, { weightKg: 60, reps: 8, rpe: 7 }, NOW).mode, 'control');
    assert.equal(comparePulse(previous, { weightKg: 40, reps: 8, rpe: 8 }, NOW).mode, 'consolidate');
  });

  it('frames an old reference as a comeback', () => {
    const old = { ...previous, at: daysAgo(20) };
    assert.equal(comparePulse(old, { weightKg: 60, reps: 9, rpe: 8 }, NOW).mode, 'return');
  });

  it('compares reps for bodyweight exercises', () => {
    const pullups = { bestSet: { weightKg: 0, reps: 10, rpe: 8 }, at: daysAgo(3) };
    assert.equal(comparePulse(pullups, { weightKg: 0, reps: 11, rpe: 8 }, NOW).mode, 'beat');
    assert.equal(comparePulse(pullups, { weightKg: 0, reps: 9, rpe: 8 }, NOW).repsToBeat, 2);
  });
});

describe('selectSessionCard', () => {
  const history = [session(daysAgo(3), [row(sets([60, 8, 8], [60, 8, 8])), bench(sets([60, 8, 8]))])];

  it('reveals NUEVO PULSO for a real record', () => {
    const current = session(NOW, [row(sets([62.5, 8, 8]))]);
    const card = selectSessionCard({ session: current, history, plannedTargetSets: 1 });
    assert.equal(card?.type, 'new_pulse');
    assert.equal(card?.metric.exerciseName, 'Remo con barra');
    assert.equal(card?.metric.deltaPct, 4.2);
  });

  it('does not treat a first-ever exercise as a record', () => {
    const current = session(NOW, [squat(sets([100, 5]))]);
    assert.equal(selectSessionCard({ session: current, history, plannedTargetSets: null }), null);
  });

  it('does not celebrate a sliver of progress at RPE 10', () => {
    const current = session(NOW, [row(sets([61, 8, 10]))]); // +1.7 % e1RM at RPE 10
    assert.notEqual(selectSessionCard({ session: current, history, plannedTargetSets: null })?.type, 'new_pulse');
  });

  it('reveals CONTROL for the same work at lower effort', () => {
    const current = session(NOW, [row(sets([60, 8, 7], [60, 8, 6]))]);
    const card = selectSessionCard({ session: current, history, plannedTargetSets: 10 });
    assert.equal(card?.type, 'control');
    assert.equal(card?.metric.rpeDrop, 1.5);
  });

  it('reveals REGRESO after 7+ days away', () => {
    const current = session(NOW, [squat(sets([60, 5]))]);
    const card = selectSessionCard({ session: current, history: fixtures.reactivating, plannedTargetSets: null });
    assert.equal(card?.type, 'return');
    assert.equal(card?.metric.daysAway, 12);
  });

  it('reveals CONSISTENCIA only for a completed planned session', () => {
    const current = session(NOW, [squat(sets([60, 5], [60, 5]))]);
    assert.equal(selectSessionCard({ session: current, history, plannedTargetSets: 2 })?.type, 'consistency');
    assert.equal(selectSessionCard({ session: current, history, plannedTargetSets: 3 }), null);
    const free = { ...current, kind: 'free' as const };
    assert.equal(selectSessionCard({ session: free, history, plannedTargetSets: 2 }), null);
  });
});

describe('computeMuscleLoad', () => {
  it('weights primary movers over secondary and flags recent heavy work', () => {
    const load = computeMuscleLoad(fixtures.recovering, NOW);
    assert.equal(load.byMuscle.quadriceps?.sets, 7);
    assert.equal(load.byMuscle.gluteals?.sets, 3.5);
    assert.equal(load.byMuscle.quadriceps?.relative, 1);
    assert.equal(load.byMuscle.quadriceps?.recovering, true);
    assert.equal(load.level, 'MEDIA');
  });
});

describe('computeStrengthTrend', () => {
  it('reports per-movement change and ignores single points', () => {
    const trend = computeStrengthTrend([
      session(daysAgo(20), [row(sets([60, 8])), squat(sets([100, 5]))]),
      session(daysAgo(2), [row(sets([62.5, 8]))]),
    ], NOW, 28);
    assert.equal(trend.movements.length, 1);
    assert.equal(trend.movements[0].name, 'Remo con barra');
    assert.equal(trend.deltaPct, 4.2);
    assert.equal(trend.buckets.length, 4);
  });

  it('has no trend without repeated movements', () => {
    assert.equal(computeStrengthTrend(fixtures.newUser, NOW, 7).deltaPct, null);
  });

  it('estimates only from eligible working sets', () => {
    const warmupThenWork = [{ weightKg: 120, reps: 3, rpe: null, warmup: true }, ...sets([60, 8])];
    const trend = computeStrengthTrend([
      session(daysAgo(20), [row(warmupThenWork), { ...row(sets([10, 12])), exerciseId: 'dips', name: 'Fondos', equipment: 'bodyweight' }]),
      session(daysAgo(2), [row([...sets([40, 15]), ...sets([62.5, 8])]), { ...row(sets([10, 14])), exerciseId: 'dips', name: 'Fondos', equipment: 'bodyweight' }]),
    ], NOW, 28);
    assert.deepEqual(trend.movements.map(movement => movement.name), ['Remo con barra']);
    // 62.5 × (1 + 8/30) = 79.2: the 15-rep set and the 120 kg warm-up are ignored.
    assert.equal(trend.movements[0].currentE1rm, 79.2);
    assert.equal(trend.movements[0].deltaPct, 4.2);
  });
});

describe('generateFreeSession', () => {
  const library: LibraryExercise[] = [
    { exerciseId: 'a', name: 'Press banca', muscles: ['chest', 'triceps'], equipment: 'barbell', timesPerformed: 5, last: { sets: 4, reps: 8, weightKg: 62.5 }, defaults: { sets: 3, reps: 10, weightKg: 0, stepKg: 2.5 } },
    { exerciseId: null, name: 'Aperturas con mancuernas', muscles: ['chest', 'deltoids'], equipment: 'dumbbell', timesPerformed: 0, last: null, defaults: { sets: 3, reps: 12, weightKg: 8, stepKg: 2 } },
    { exerciseId: null, name: 'Fondos', muscles: ['chest', 'triceps'], equipment: 'bodyweight', timesPerformed: 0, last: null, defaults: { sets: 3, reps: 8, weightKg: 0, stepKg: 1 } },
    { exerciseId: 'b', name: 'Sentadilla', muscles: ['quadriceps', 'gluteals'], equipment: 'barbell', timesPerformed: 2, last: { sets: 4, reps: 6, weightKg: 80 }, defaults: { sets: 4, reps: 6, weightKg: 60, stepKg: 5 } },
    { exerciseId: null, name: 'Misterio', muscles: ['chest'], equipment: null, timesPerformed: 9, last: null, defaults: { sets: 3, reps: 10, weightKg: 0, stepKg: 1 } },
  ];

  it('is deterministic and prefers familiar exercises at their last weight', () => {
    const first = generateFreeSession({ selected: ['chest', 'quadriceps'], library, equipment: null });
    const second = generateFreeSession({ selected: ['chest', 'quadriceps'], library, equipment: null });
    assert.deepEqual(first, second);
    assert.deepEqual(first.map(item => item.name), ['Misterio', 'Sentadilla', 'Press banca']);
    assert.equal(first.find(item => item.name === 'Sentadilla')?.weightKg, 80);
  });

  it('filters by equipment and drops unknown equipment when filtering', () => {
    const result = generateFreeSession({ selected: ['chest'], library, equipment: ['bodyweight', 'dumbbell'] });
    assert.deepEqual(result.map(item => item.name), ['Aperturas con mancuernas', 'Fondos']);
  });

  it('returns nothing without a selection', () => {
    assert.deepEqual(generateFreeSession({ selected: [], library, equipment: null }), []);
  });
});

describe('buildWeeklySummary', () => {
  const weekStart = mondayOf(new Date(NOW - 7 * 24 * 60 * 60 * 1000)); // Monday 14 Sep

  it('tells a short story when data is incomplete, never an empty page', () => {
    const summary = buildWeeklySummary({
      weekStart,
      sessions: [],
      checkIns: [{ date: '2026-09-15', workoutCompleted: false, nutritionCompleted: true, hydrationCompleted: false }],
      cards: [],
      plannedDaysPerWeek: 3,
    });
    assert.deepEqual(summary.pages.map(page => page.kind), ['intro', 'consistency', 'next']);
    assert.equal(summary.weekStart, '2026-09-14');
  });

  it('builds the full arc with movement, muscles, moment and next goal', () => {
    const inWeek = session(daysAgo(8), [squat(sets([100, 5], [100, 5], [100, 5], [100, 5], [100, 5], [100, 5], [100, 5], [100, 5], [100, 5], [100, 5], [100, 5], [100, 5]))]);
    const summary = buildWeeklySummary({
      weekStart,
      sessions: [session(daysAgo(15), [bench(sets([60, 8]))]), inWeek],
      checkIns: [{ date: '2026-09-15', workoutCompleted: true, nutritionCompleted: false, hydrationCompleted: false }],
      cards: [{ sessionId: inWeek.id, draft: { type: 'consistency', metric: {} as never } }],
      plannedDaysPerWeek: 3,
    });
    assert.deepEqual(summary.pages.map(page => page.kind), ['intro', 'movement', 'muscles', 'moment', 'consistency', 'recovery', 'next']);
    const next = summary.pages.at(-1);
    assert.deepEqual(next, { kind: 'next', goal: 'add_one', target: 2 });
  });

  it('knows when a week has nothing to summarize', () => {
    assert.equal(hasWeeklyData({ weekStart, sessions: [], checkIns: [] }), false);
  });
});
