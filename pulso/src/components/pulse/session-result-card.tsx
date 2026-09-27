import { Text, View, ViewStyle } from 'react-native';

import { Label } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import type { SessionCard } from '@/db/pulse';
import { DETAILED_MUSCLE_LABELS } from '@/lib/muscles';
import { WeightUnit } from '@/lib/settings';
import { displayWeight } from '@/lib/units';
import { CARD_FAMILIES, cardDate } from './labels';

interface CardText {
  eyebrow: string;
  headline: string;
  detail: string;
}

export function cardText(card: SessionCard, weightUnit: WeightUnit): CardText {
  const m = card.metric;
  const lift = m.weightKg != null && m.weightKg > 0
    ? `${displayWeight(m.weightKg, weightUnit)} × ${m.reps}`
    : `${m.reps ?? 0} REPS`;
  switch (card.type) {
    case 'new_pulse':
      return {
        eyebrow: m.exerciseName?.toUpperCase() ?? 'RÉCORD',
        headline: lift,
        detail: m.weightKg != null && m.weightKg > 0
          ? `+${m.deltaPct}% de fuerza estimada vs. tu pulso anterior`
          : `+${m.deltaPct}% de repeticiones vs. tu pulso anterior`,
      };
    case 'control':
      return {
        eyebrow: m.exerciseName?.toUpperCase() ?? 'CONTROL',
        headline: lift,
        detail: `Mismo trabajo con ${m.rpeDrop} puntos menos de RPE`,
      };
    case 'return':
      return {
        eyebrow: 'DE VUELTA',
        headline: `${m.daysAway} DÍAS`,
        detail: 'Volviste después de una pausa. Completar era el objetivo.',
      };
    default:
      return {
        eyebrow: 'SESIÓN PREVISTA',
        headline: `${m.completedSets}/${m.targetSets ?? m.completedSets} SERIES`,
        detail: 'Hiciste lo que tenías planificado para hoy.',
      };
  }
}

/**
 * The persistent object a session leaves behind: 3:4, one protagonist metric,
 * family color for identity. The three bars are the Núcleo's abstract mark.
 */
export function SessionResultCard({ card, weightUnit, accent, style }: {
  card: SessionCard;
  weightUnit: WeightUnit;
  accent: string;
  style?: ViewStyle;
}) {
  const C = useColors();
  const family = CARD_FAMILIES[card.type];
  const color = family.color(accent, C);
  const text = cardText(card, weightUnit);
  const muscles = card.metric.muscles.slice(0, 2).map(key => DETAILED_MUSCLE_LABELS[key]).join(' · ');

  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`Tarjeta ${family.label.toLowerCase()}. ${text.eyebrow.toLowerCase()}: ${text.headline}. ${text.detail}`}
      style={[{
        aspectRatio: 3 / 4, padding: 14, borderWidth: 1, borderColor: color,
        backgroundColor: C.card,
      }, style]}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <View style={{ borderWidth: 1, borderColor: color, backgroundColor: withAlpha(color, 0.1), paddingHorizontal: 7, paddingVertical: 3 }}>
          <Text style={{ fontFamily: F.monoBold, fontSize: 9, letterSpacing: 1, color }}>{family.label}</Text>
        </View>
        <Label>{cardDate(card.earnedAt)}</Label>
      </View>

      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {[0.6, 1, 0.6].map((height, index) => (
          <View
            key={index}
            style={{
              width: 16, height: `${height * 62}%`, borderWidth: 1, borderColor: color,
              backgroundColor: index === 1 ? color : 'transparent',
              transform: [{ skewX: '-12deg' }],
            }}
          />
        ))}
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 11 }}>
        <Label>{text.eyebrow}</Label>
        <Text adjustsFontSizeToFit numberOfLines={1} style={{ fontFamily: F.monoXBold, fontSize: 28, color, marginTop: 5 }}>
          {text.headline}
        </Text>
        <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 17, color: C.textSecondary, marginTop: 4 }}>
          {text.detail}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 11, paddingTop: 9, borderTopWidth: 1, borderTopColor: C.border }}>
        <Label style={{ flex: 1 }}>{muscles || 'SESIÓN'}</Label>
        <Text style={{ fontFamily: F.monoBold, fontSize: 9, letterSpacing: 1, color: C.textSecondary }}>
          PULSO / {String(card.serial).padStart(3, '0')}
        </Text>
      </View>
    </View>
  );
}
