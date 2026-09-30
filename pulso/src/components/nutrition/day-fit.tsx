import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Label } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';
import { useSession } from '@/context/session';
import { listConsumptions } from '@/db/consumption';
import { getMealPlanForDate, MealSlotUI } from '@/db/nutrition';
import { CORE_NUTRIENTS, formatNutrient, NUTRIENT_LABEL, Nutrients } from '@/lib/nutrition-math';
import { simulateAddition, Simulation, SimulationBasis } from '@/lib/nutrition-planning';

import { shortDateLabel } from './plan-date-picker';

function mealNutrients(meal: MealSlotUI): Nutrients {
  return { kcal: meal.kcal, proteinG: meal.p, carbsG: meal.c, fatG: meal.g };
}

/**
 * "How it fits": the date's totals before and after adding this food, without
 * writing anything. Logging compares against what was really eaten that day;
 * planning against what is planned — never both added together.
 */
export function DayFitPreview({ date, basis, addition, repeatWeekly = false }: {
  date: string;
  basis: SimulationBasis;
  addition: Nutrients | null;
  /** Planning every week: the date shown is the first of them. */
  repeatWeekly?: boolean;
}) {
  const C = useColors();
  const { userId } = useSession();
  const key = `${date}|${basis}`;
  const [loaded, setLoaded] = useState<{ key: string; baseline: Nutrients[]; planned: Nutrients[] } | null>(null);
  // Figures of another date or basis are never shown while the new ones load.
  const data = loaded?.key === key ? loaded : null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.all([
      getMealPlanForDate(userId, date),
      basis === 'consumed' ? listConsumptions(userId, date) : Promise.resolve([]),
    ]).then(([plan, items]) => {
      if (cancelled) return;
      const planned = plan.meals.map(mealNutrients);
      const eaten = items.filter(item => !(item.kind === 'beverage' && item.plainWater)).map(item => item.nutrients);
      setLoaded({ key: `${date}|${basis}`, baseline: basis === 'consumed' ? eaten : planned, planned });
    }).catch(e => console.error('[day-fit]', e));
    return () => { cancelled = true; };
  }, [userId, date, basis]);

  if (!addition || !data) return null;
  const sim: Simulation = simulateAddition({ basis, baseline: data.baseline, addition, planned: data.planned });
  const day = shortDateLabel(date).toLowerCase();
  const title = basis === 'consumed'
    ? `SI LO REGISTRÁS · ${day.toUpperCase()}`
    : `SI LO PLANIFICÁS · ${repeatWeekly ? `DESDE ${day.toUpperCase()}` : day.toUpperCase()}`;
  const floor = (key: typeof CORE_NUTRIENTS[number], which: 'before' | 'after') => (sim[which].incomplete.has(key) ? '≥ ' : '');

  return (
    <View style={{ borderWidth: 1, borderColor: C.border, padding: 12, gap: 8 }} accessibilityLabel="Simulación, no se guarda">
      <Label>{title}</Label>
      <View style={{ flexDirection: 'row' }}>
        <Text style={{ flex: 1.2, fontFamily: F.mono, fontSize: 9, color: C.textTertiary }} />
        <Text style={{ flex: 1, fontFamily: F.mono, fontSize: 9, color: C.textTertiary, textAlign: 'right' }}>{basis === 'consumed' ? 'CONSUMIDO' : 'PLAN'}</Text>
        <Text style={{ flex: 1, fontFamily: F.mono, fontSize: 9, color: C.textTertiary, textAlign: 'right' }}>CON ESTE</Text>
        {sim.reference && <Text style={{ flex: 1, fontFamily: F.mono, fontSize: 9, color: C.textTertiary, textAlign: 'right' }}>PLAN DEL DÍA</Text>}
      </View>
      {CORE_NUTRIENTS.map(key => (
        <View key={key} style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={{ flex: 1.2, fontFamily: F.inter, fontSize: 12, color: C.textSecondary }}>{NUTRIENT_LABEL[key]}</Text>
          <Text style={{ flex: 1, fontFamily: F.mono, fontSize: 11, color: C.textSecondary, textAlign: 'right' }}>{`${floor(key, 'before')}${formatNutrient(key, sim.before.totals[key])}`}</Text>
          <Text style={{ flex: 1, fontFamily: F.monoBold, fontSize: 11, color: C.textPrimary, textAlign: 'right' }}>{`${floor(key, 'after')}${formatNutrient(key, sim.after.totals[key])}`}</Text>
          {sim.reference && <Text style={{ flex: 1, fontFamily: F.mono, fontSize: 11, color: C.textTertiary, textAlign: 'right' }}>{formatNutrient(key, sim.reference[key])}</Text>}
        </View>
      ))}
      <Text style={{ fontFamily: F.inter, fontSize: 11, lineHeight: 16, color: C.textTertiary }}>
        {basis === 'consumed'
          ? 'Parte de lo que ya registraste ese día. Es una simulación: no se guarda hasta que confirmes.'
          : `Parte de lo planificado para ${day}; lo que registres no se suma acá. Es una simulación: no se guarda hasta que confirmes.`}
        {(sim.after.incomplete.size > 0) ? ' “≥” = falta algún dato; el total real puede ser mayor.' : ''}
      </Text>
    </View>
  );
}
