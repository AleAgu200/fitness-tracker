import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Label, PressableScale } from '@/components/ui/kit';
import { C, F } from '@/constants/colors';
import { useApp } from '@/context/app-state';
import { usePreferences } from '@/context/preferences';

const ALL_BADGES_COUNT = 6;

const NAV_ROWS: { key: string; label: string; detail: string; href: string }[] = [
  { key: 'progreso',      label: 'Progreso',      detail: 'Composición, logros, PRs y racha de entrenos', href: '/progreso' },
  { key: 'equipo',        label: 'Equipo',        detail: 'Entrenador, nutricionista y mensajes',          href: '/equipo' },
  { key: 'configuracion', label: 'Configuración', detail: 'Datos personales, notificaciones y cuenta',     href: '/configuracion' },
];

export default function PerfilScreen() {
  const { state } = useApp();
  const { accent } = usePreferences();
  const insets = useSafeAreaInsets();

  const name     = state.profile?.name     || 'Atleta';
  const initials = state.profile?.initials || '?';

  const totalPRs = state.prHistory.length;
  const earnedCount = Object.keys(state.earned).length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16 }}>

        {/* USER HEADER */}
        <Animated.View entering={FadeInDown.duration(320)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <View style={{ width: 58, height: 58, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: 18, color: accent }}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.grotesk, fontSize: 23, color: C.textPrimary }}>{name}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textSecondary, marginTop: 6 }}>
              Atleta · {earnedCount}/{ALL_BADGES_COUNT} logros
            </Text>
          </View>
        </Animated.View>

        {/* STATS ROW */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
          {[
            { val: state.racha,         label: 'RACHA d',  color: C.orange },
            { val: totalPRs,            label: 'PRs',      color: C.red },
            { val: state.sessionsCount, label: 'SESIONES', color: accent },
          ].map((s, i) => (
            <Card key={s.label} index={i} style={{ flex: 1, padding: 13, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.monoXBold, fontSize: 24, color: s.color, fontVariant: ['tabular-nums'] as any }}>{s.val}</Text>
              <Label style={{ marginTop: 6 }}>{s.label}</Label>
            </Card>
          ))}
        </View>

        {/* NAVIGATION */}
        {NAV_ROWS.map((row, i) => (
          <Animated.View key={row.key} entering={FadeInDown.duration(280).delay(i * 50)}>
            <PressableScale
              onPress={() => router.push(row.href as any)}
              haptic="light"
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 15, paddingHorizontal: 16, marginBottom: 9 }}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ fontFamily: F.interSemi, fontSize: 15, color: C.textPrimary }}>{row.label}</Text>
                <Text style={{ fontFamily: F.inter, fontSize: 11, color: C.textTertiary, marginTop: 3 }}>{row.detail}</Text>
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.textSecondary }}>→</Text>
            </PressableScale>
          </Animated.View>
        ))}
      </View>
    </ScrollView>
  );
}
