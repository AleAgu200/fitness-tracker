/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { UnitMismatchError } from '../src/lib/nutrition-math';
import { compareFoods, resolveDayMeals, simulateAddition } from '../src/lib/nutrition-planning';

const MONDAY = '2026-10-05';
const MON = 2;

function slot(id: string, over: Partial<{ weekday: number; planDate: string | null; slotOrder: number; scheduledTime: string | null }> = {}) {
  return { id, weekday: MON, planDate: null, slotOrder: 0, scheduledTime: null, ...over };
}

describe('resolveDayMeals', () => {
  it('uses the usual week for the weekday and ignores other weekdays', () => {
    const { meals } = resolveDayMeals([slot('a'), slot('b', { weekday: 3 })], new Set(), MONDAY, MON);
    assert.deepEqual(meals.map(m => m.id), ['a']);
  });

  it('adds meals planned for that date only, not for the same weekday of other weeks', () => {
    const slots = [slot('a'), slot('once', { planDate: MONDAY }), slot('other', { planDate: '2026-10-12' })];
    assert.deepEqual(resolveDayMeals(slots, new Set(), MONDAY, MON).meals.map(m => m.id), ['a', 'once']);
    assert.deepEqual(resolveDayMeals(slots, new Set(), '2026-10-12', MON).meals.map(m => m.id), ['a', 'other']);
  });

  it('a skip removes the weekly meal on that date and reports it', () => {
    const { meals, skipped } = resolveDayMeals([slot('a'), slot('b', { slotOrder: 1 })], new Set(['a']), MONDAY, MON);
    assert.deepEqual(meals.map(m => m.id), ['b']);
    assert.deepEqual(skipped.map(m => m.id), ['a']);
  });

  it('orders timed meals by time and keeps the usual week first otherwise', () => {
    const slots = [
      slot('lunch', { scheduledTime: '12:30', slotOrder: 1 }),
      slot('breakfast', { scheduledTime: '07:00', slotOrder: 0 }),
      slot('snack', { planDate: MONDAY, scheduledTime: '10:00' }),
      slot('untimed-once', { planDate: MONDAY }),
      slot('untimed-weekly', { slotOrder: 2 }),
    ];
    assert.deepEqual(
      resolveDayMeals(slots, new Set(), MONDAY, MON).meals.map(m => m.id),
      ['breakfast', 'snack', 'lunch', 'untimed-weekly', 'untimed-once'],
    );
  });
});

describe('compareFoods', () => {
  const yogurt = { name: 'Yogur', basis: { amount: 100, unit: 'g' as const }, nutrients: { kcal: 60, proteinG: 10, carbsG: 4, fatG: 0.5, sugarsG: 4 } };
  const other = { name: 'Otro', basis: { amount: 150, unit: 'g' as const }, nutrients: { kcal: 180, proteinG: 6, carbsG: 24, fatG: null } };

  it('scales both to the same reference', () => {
    const cmp = compareFoods(yogurt, other, 100);
    const kcal = cmp.rows.find(r => r.key === 'kcal')!;
    assert.equal(kcal.a, 60);
    assert.equal(kcal.b, 120);
    assert.equal(kcal.difference, 60);
  });

  it('keeps unknown values unknown and never makes up a difference', () => {
    const fat = compareFoods(yogurt, other, 100).rows.find(r => r.key === 'fatG')!;
    assert.equal(fat.b, null);
    assert.equal(fat.difference, null);
  });

  it('lists an optional nutrient only when one side reports it', () => {
    const keys = compareFoods(yogurt, other, 100).rows.map(r => r.key);
    assert.ok(keys.includes('sugarsG'));
    assert.ok(!keys.includes('sodiumMg'));
  });

  it('compares each product by its own portion', () => {
    const cmp = compareFoods(yogurt, other, 200, 150);
    assert.equal(cmp.rows.find(r => r.key === 'kcal')!.a, 120);
    assert.equal(cmp.rows.find(r => r.key === 'kcal')!.b, 180);
  });

  it('refuses grams against millilitres', () => {
    const drink = { name: 'Leche', basis: { amount: 100, unit: 'ml' as const }, nutrients: { kcal: 60 } };
    assert.throws(() => compareFoods(yogurt, drink, 100), UnitMismatchError);
  });
});

describe('simulateAddition', () => {
  it('adds to what was consumed and measures against the day plan', () => {
    const sim = simulateAddition({
      basis: 'consumed',
      baseline: [{ kcal: 500, proteinG: 30, carbsG: 50, fatG: 15 }],
      addition: { kcal: 120, proteinG: 20, carbsG: 8, fatG: 1 },
      planned: [{ kcal: 1000, proteinG: 60, carbsG: 100, fatG: 30 }, { kcal: 800, proteinG: 40, carbsG: 90, fatG: 25 }],
    });
    assert.equal(sim.before.totals.kcal, 500);
    assert.equal(sim.after.totals.kcal, 620);
    assert.equal(sim.reference?.kcal, 1800);
  });

  it('planning changes the plan itself, with no second reference', () => {
    const sim = simulateAddition({
      basis: 'planned',
      baseline: [{ kcal: 1800, proteinG: 100, carbsG: 190, fatG: 55 }],
      addition: { kcal: 200, proteinG: 10, carbsG: 20, fatG: 5 },
    });
    assert.equal(sim.after.totals.kcal, 2000);
    assert.equal(sim.reference, null);
  });

  it('an addition with unknown values marks the result as a floor', () => {
    const sim = simulateAddition({ basis: 'consumed', baseline: [{ kcal: 500, proteinG: 30, carbsG: 50, fatG: 15 }], addition: { kcal: 90, proteinG: null } });
    assert.ok(sim.after.incomplete.has('proteinG'));
    assert.ok(!sim.before.incomplete.has('proteinG'));
  });
});
