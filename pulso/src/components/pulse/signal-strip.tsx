import { Text, View } from 'react-native';

import { Label, PressableScale } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';

export interface Signal {
  key: string;
  label: string;
  value: string;
  /** Spoken instead of "label value" when the short value isn't self-explanatory. */
  accessibilityLabel?: string;
  onPress: () => void;
}

/** Three short, tappable signals separated by dividers — not three cards. */
export function SignalStrip({ signals }: { signals: Signal[] }) {
  const C = useColors();
  return (
    <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: C.border }}>
      {signals.map((signal, index) => (
        <PressableScale
          key={signal.key}
          onPress={signal.onPress}
          accessibilityLabel={signal.accessibilityLabel ?? `${signal.label}: ${signal.value}`}
          accessibilityHint="Abre el detalle"
          containerStyle={{ flex: 1 }}
          style={{
            minHeight: 58, paddingVertical: 10, paddingHorizontal: 10, gap: 5,
            borderLeftWidth: index === 0 ? 0 : 1, borderLeftColor: C.border,
          }}
        >
          <Label>{signal.label}</Label>
          <Text numberOfLines={1} style={{ fontFamily: F.monoBold, fontSize: 14, color: C.textPrimary }}>
            {signal.value}
          </Text>
        </PressableScale>
      ))}
    </View>
  );
}
