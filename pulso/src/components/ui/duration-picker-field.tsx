import { Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';

/** "45 min" below an hour, "1:15" / "1:30" once it crosses into hours. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

/**
 * Stepper for a duration in fixed increments.
 *
 * Deliberately not the native picker: on Android that renders a white system
 * dropdown inside a dark themed app, and its selection did not commit back to
 * state. A stepper also matches the "days per week" control sitting next to it,
 * so the two fields read as one unit.
 */
export function DurationPickerField({ value, onChange, min, max, step = 15 }: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  const C = useColors();
  const { accent } = usePreferences();

  // Clamp to the grid so an out-of-range stored value cannot strand the control.
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel="Minutos por sesión"
      accessibilityValue={{ min, max, now: value, text: formatDuration(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={event => {
        if (event.nativeEvent.actionName === 'increment') onChange(clamp(value + step));
        if (event.nativeEvent.actionName === 'decrement') onChange(clamp(value - step));
      }}
      style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border, backgroundColor: C.card }}
    >
      <PressableScale
        onPress={() => onChange(clamp(value - step))}
        disabled={atMin}
        accessibilityLabel={`Restar ${step} minutos`}
        style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: C.border, opacity: atMin ? 0.35 : 1 }}
      >
        <Text style={{ fontFamily: F.monoBold, fontSize: 18, color: C.textSecondary }}>−</Text>
      </PressableScale>

      <View style={{ flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' }}>
        <Text
          numberOfLines={1}
          style={{ fontFamily: F.monoBold, fontSize: 16, color: accent, fontVariant: ['tabular-nums'] as never }}
        >
          {formatDuration(value)}
        </Text>
      </View>

      <PressableScale
        onPress={() => onChange(clamp(value + step))}
        disabled={atMax}
        accessibilityLabel={`Sumar ${step} minutos`}
        style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: C.border, opacity: atMax ? 0.35 : 1 }}
      >
        <Text style={{ fontFamily: F.monoBold, fontSize: 18, color: C.textSecondary }}>+</Text>
      </PressableScale>
    </View>
  );
}
