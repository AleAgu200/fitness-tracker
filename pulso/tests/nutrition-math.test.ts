/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  combineNutrients,
  energyLooksInconsistent,
  goalProgress,
  hydrationTotals,
  kjToKcal,
  parseAmount,
  scaleNutrients,
  sumNutrients,
  UnitMismatchError,
} from '../src/lib/nutrition-math';

describe('scaleNutrients', () => {
  const yogurt = { kcal: 95, proteinG: 9, carbsG: 11, fatG: 1.5, sodiumMg: null };

  it('scales half and several servings without rounding', () => {
    assert.deepEqual(scaleNutrients(yogurt, { amount: 100, unit: 'g' }, 50, 'g'), { kcal: 47.5, proteinG: 4.5, carbsG: 5.5, fatG: 0.75, sodiumMg: null });
    assert.equal(scaleNutrients(yogurt, { amount: 100, unit: 'g' }, 250, 'g').kcal, 237.5);
  });

  it('keeps unknown values unknown', () => {
    assert.equal(scaleNutrients(yogurt, { amount: 100, unit: 'g' }, 200, 'g').sodiumMg, null);
    assert.equal('fiberG' in scaleNutrients(yogurt, { amount: 100, unit: 'g' }, 200, 'g'), false);
  });

  it('refuses to convert between grams and millilitres', () => {
    assert.throws(() => scaleNutrients(yogurt, { amount: 100, unit: 'g' }, 100, 'ml'), UnitMismatchError);
  });

  it('scales a per-serving basis', () => {
    assert.equal(scaleNutrients({ kcal: 120 }, { amount: 250, unit: 'ml' }, 125, 'ml').kcal, 60);
  });
});

describe('sumNutrients', () => {
  it('sums known values and marks unknown ones as incomplete', () => {
    const { totals, incomplete } = sumNutrients([
      { kcal: 100, proteinG: 5, carbsG: 10, fatG: 2 },
      { kcal: 50, proteinG: null, carbsG: 3, fatG: 1, fiberG: null },
    ]);
    assert.equal(totals.kcal, 150);
    assert.equal(totals.proteinG, 5);
    assert.ok(incomplete.has('proteinG'));
    assert.ok(incomplete.has('fiberG'));
    assert.ok(!incomplete.has('kcal'));
    assert.ok(!incomplete.has('sodiumMg'), 'an optional nutrient nobody reported is not incomplete');
  });
});

describe('labels', () => {
  it('converts kJ to kcal', () => {
    assert.equal(Math.round(kjToKcal(418.4)), 100);
  });

  it('flags energy that disagrees with macros', () => {
    assert.equal(energyLooksInconsistent({ kcal: 100, proteinG: 5, carbsG: 15, fatG: 2 }), false);
    assert.equal(energyLooksInconsistent({ kcal: 418, proteinG: 5, carbsG: 15, fatG: 2 }), true, 'kJ typed as kcal');
    assert.equal(energyLooksInconsistent({ kcal: 100, proteinG: null, carbsG: 15, fatG: 2 }), false);
  });

  it('parses comma decimals and treats blanks as unknown', () => {
    assert.equal(parseAmount('12,5'), 12.5);
    assert.equal(parseAmount(''), null);
    assert.equal(parseAmount('abc'), null);
  });
});

describe('hydration', () => {
  it('counts every drink once and plain water separately', () => {
    assert.deepEqual(hydrationTotals([
      { volumeMl: 500, plainWater: true },
      { volumeMl: 250, plainWater: false },
      { volumeMl: null, plainWater: true },
    ]), { totalMl: 750, plainWaterMl: 500 });
  });

  it('has no progress without a goal and keeps counting past it', () => {
    assert.equal(goalProgress(1000, null), null);
    assert.equal(goalProgress(3000, 2000), 1.5);
  });
});

describe('combineNutrients', () => {
  it('totals components and leaves unknown values unknown', () => {
    const out = combineNutrients([
      { nutrientsPerBasis: { kcal: 100, proteinG: 10, carbsG: 0, fatG: 5, sodiumMg: 80 }, basis: { amount: 100, unit: 'g' }, amount: 150, unit: 'g' },
      { nutrientsPerBasis: { kcal: 60, proteinG: 3, carbsG: 5, fatG: 3 }, basis: { amount: 250, unit: 'ml' }, amount: 250, unit: 'ml' },
    ]);
    assert.equal(out.kcal, 210);
    assert.equal(out.proteinG, 18);
    assert.equal(out.sodiumMg, 120, 'only one component reported sodium; the other omitted it entirely');
  });

  it('turns a nutrient one component does not know into null', () => {
    const out = combineNutrients([
      { nutrientsPerBasis: { kcal: 100, proteinG: null, carbsG: 1, fatG: 1 }, basis: { amount: 100, unit: 'g' }, amount: 100, unit: 'g' },
      { nutrientsPerBasis: { kcal: 50, proteinG: 2, carbsG: 1, fatG: 1 }, basis: { amount: 100, unit: 'g' }, amount: 100, unit: 'g' },
    ]);
    assert.equal(out.proteinG, null);
    assert.equal(out.kcal, 150);
  });
});
