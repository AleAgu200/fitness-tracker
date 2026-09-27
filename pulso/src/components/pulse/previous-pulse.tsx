import { Text, View } from 'react-native';

import { Label } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';
import { PreviousExerciseSession, previousPulseRef } from '@/db/workout';
import { WeightUnit } from '@/lib/settings';
import { comparePulse, TrainingSetEntry } from '@/lib/pulse-engine';
import { displayWeight } from '@/lib/units';
import { comparisonCopy } from './labels';

/**
 * The athlete's last result on this exercise, shown right above the set being
 * logged. Cyan is context; the accent appears only once the current input
 * actually beats it. The nudge is always reps, never more load.
 */
export function PreviousPulse({ previous, current, now, weightUnit, accent }: {
  previous: PreviousExerciseSession | null;
  current: TrainingSetEntry;
  now: number;
  weightUnit: WeightUnit;
  accent: string;
}) {
  const C = useColors();
  const comparison = comparePulse(previous ? previousPulseRef(previous) : null, current, now);
  const instruction = comparisonCopy(comparison);

  if (!previous) {
    return (
      <View style={{ padding: 11, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.bgEl }}>
        <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary }}>◉ {instruction}</Text>
      </View>
    );
  }

  const best = previous.bestSet;
  const bestWeight = displayWeight(best.peso, weightUnit);
  const spoken = `Pulso anterior: ${best.peso > 0 ? `${bestWeight} ${weightUnit} por ${best.reps}` : `${best.reps} repeticiones`}, RPE ${best.rpe}. ${instruction.toLowerCase()}.`;

  return (
    <View
      accessible
      accessibilityLabel={spoken}
      style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.bgEl }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Label style={{ color: C.cyan }}>◉ PULSO ANTERIOR</Label>
        <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary }}>
          {previous.completedAt.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }).toUpperCase()}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={{ fontFamily: F.monoXBold, fontSize: 22, color: C.textPrimary }}>
          {best.peso > 0 ? `${bestWeight} ${weightUnit.toUpperCase()} × ${best.reps}` : `${best.reps} REPS`}
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary }}>RPE {best.rpe}</Text>
      </View>
      {previous.sets.length > 1 && (
        <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textSecondary, marginTop: 6 }}>
          {previous.sets.map(set => `${displayWeight(set.peso, weightUnit)}×${set.reps}`).join('  ·  ')}
        </Text>
      )}
      <Text style={{
        fontFamily: F.monoBold, fontSize: 10, letterSpacing: 0.6, marginTop: 9,
        color: comparison.beating ? accent : C.cyan,
      }}>
        {instruction}
      </Text>
    </View>
  );
}
