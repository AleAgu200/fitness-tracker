import { Text, View } from 'react-native';

import { Card, Label, PressableScale } from '@/components/ui/kit';
import { C, F } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { ACCENT_PRESETS } from '@/lib/settings';

const UNIT_OPTIONS = [
  { value: 'kg' as const, label: 'KG' },
  { value: 'lb' as const, label: 'LB' },
];

export function PreferencesSettings() {
  const { accent, weightUnit, setAccent, setWeightUnit } = usePreferences();

  return (
    <Card index={6} style={{ padding: 14, marginBottom: 14 }}>
      <View style={{ paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <Label>PREFERENCIAS</Label>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }}>Unidad de peso</Text>
          <Text style={{ fontFamily: F.inter, fontSize: 11, lineHeight: 16, color: C.textTertiary }}>
            Se usa en ENTRENO, PROGRESO y HOY.
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {UNIT_OPTIONS.map(option => {
            const selected = weightUnit === option.value;
            return (
              <PressableScale
                key={option.value}
                onPress={() => setWeightUnit(option.value)}
                style={{
                  width: 44,
                  height: 38,
                  borderWidth: 1,
                  borderColor: selected ? accent : C.border,
                  backgroundColor: selected ? `${accent}22` : C.bgEl,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.4, color: selected ? accent : C.textTertiary }}>
                  {option.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </View>

      <View style={{ paddingVertical: 12, gap: 10 }}>
        <View style={{ gap: 3 }}>
          <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }}>Color de acento</Text>
          <Text style={{ fontFamily: F.inter, fontSize: 11, lineHeight: 16, color: C.textTertiary }}>
            El color principal de la app.
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {ACCENT_PRESETS.map(preset => {
            const selected = accent === preset.hex;
            return (
              <PressableScale
                key={preset.key}
                onPress={() => setAccent(preset.hex)}
                haptic="light"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? C.textPrimary : C.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: preset.hex }} />
              </PressableScale>
            );
          })}
        </View>
      </View>
    </Card>
  );
}
