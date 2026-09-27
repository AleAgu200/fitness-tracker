import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { weekRangeLabel } from '@/components/pulse/labels';
import { WeeklyStoryPage } from '@/components/pulse/weekly-story';
import { Label, PressableScale } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';
import { useApp } from '@/context/app-state';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import { getWeeklySummary, markWeeklySummaryViewed } from '@/db/pulse';
import { mondayOf } from '@/lib/dates';
import type { WeeklySummary } from '@/lib/weekly-summary';

/** Weekly story: 3–7 pages depending on what the week actually has. */
export default function ResumenSemanalScreen() {
  const { week } = useLocalSearchParams<{ week?: string }>();
  const { state } = useApp();
  const { userId } = useSession();
  const { accent, weightUnit } = usePreferences();
  const C = useColors();
  const insets = useSafeAreaInsets();
  const [summary, setSummary] = useState<WeeklySummary | null | undefined>(undefined);
  const [index, setIndex] = useState(0);

  const weekStart = mondayOf(week ? new Date(`${week}T00:00:00`) : new Date());
  const weekKey = weekStart.getTime();

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const start = new Date(weekKey);
    getWeeklySummary(userId, start, state.plannedDaysPerWeek)
      .then(entry => {
        if (!active) return;
        setSummary(entry?.summary ?? null);
        if (entry) markWeeklySummaryViewed(userId, start).catch(() => {});
      })
      .catch(e => {
        console.error('[weekly-summary]', e);
        if (active) setSummary(null);
      });
    return () => { active = false; };
  }, [userId, weekKey, state.plannedDaysPerWeek]);

  const close = () => router.back();

  if (summary === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.textTertiary} accessibilityLabel="Cargando resumen" />
      </View>
    );
  }

  if (summary === null) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
        <Text style={{ fontFamily: F.inter, fontSize: 14, color: C.textSecondary, textAlign: 'center' }}>
          Esta semana no tiene registros para contar todavía.
        </Text>
        <PressableScale onPress={close} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 20, borderWidth: 1, borderColor: C.border }}>
          <Text style={{ fontFamily: F.monoBold, fontSize: 11, color: C.textPrimary }}>VOLVER</Text>
        </PressableScale>
      </View>
    );
  }

  const pages = summary.pages;
  const page = pages[Math.min(index, pages.length - 1)];
  const last = index >= pages.length - 1;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 14, paddingHorizontal: 16 }}>
      <View style={{ flexDirection: 'row', gap: 5, marginBottom: 12 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {pages.map((item, i) => (
          <View key={`${item.kind}-${i}`} style={{ flex: 1, height: 3, backgroundColor: i <= index ? accent : C.border }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <PressableScale
          onPress={close}
          accessibilityLabel="Cerrar resumen"
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontFamily: F.mono, fontSize: 18, color: C.textPrimary }}>✕</Text>
        </PressableScale>
        <Label>{`${weekRangeLabel(weekStart)} · ${index + 1}/${pages.length}`}</Label>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 12 }}>
        <Animated.View key={index} entering={FadeIn.duration(200)} accessibilityLiveRegion="polite">
          <WeeklyStoryPage page={page} accent={accent} weightUnit={weightUnit} />
        </Animated.View>
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <PressableScale
          onPress={() => (index === 0 ? close() : setIndex(i => i - 1))}
          containerStyle={{ flex: 1 }}
          style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border }}
        >
          <Text style={{ fontFamily: F.monoBold, fontSize: 11, color: C.textPrimary }}>{index === 0 ? 'CERRAR' : 'ANTERIOR'}</Text>
        </PressableScale>
        <PressableScale
          onPress={() => (last
            ? router.dismissTo({ pathname: '/progreso', params: { tab: 'semanas' } })
            : setIndex(i => i + 1))}
          containerStyle={{ flex: 1 }}
          style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: accent }}
        >
          <Text style={{ fontFamily: F.monoBold, fontSize: 11, color: C.onAccent }}>{last ? 'VER PROGRESO' : 'SIGUIENTE'}</Text>
        </PressableScale>
      </View>
    </View>
  );
}
