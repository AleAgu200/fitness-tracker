import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BodyMapPanel, loadDescription } from '@/components/body-map/body-map-panel';
import { CARD_FAMILIES, weekRangeLabel } from '@/components/pulse/labels';
import { cardText } from '@/components/pulse/session-result-card';
import { Label, PressableScale, Segmented } from '@/components/ui/kit';
import { BRAND, ColorTokens, F, useColors, withAlpha } from '@/constants/colors';
import { MetricKey, useApp } from '@/context/app-state';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import { listRecentWeeks, listSessionCards, SessionCard, WeekEntry } from '@/db/pulse';
import { usePulse } from '@/hooks/use-pulse';
import { dateStr, mondayOf } from '@/lib/dates';
import { DETAILED_MUSCLE_LABELS, DetailedMuscleKey } from '@/lib/muscles';
import { computeStrengthTrend, sessionTime, TrendRange } from '@/lib/pulse-engine';
import { displayWeight, formatWeight } from '@/lib/units';

type Tab = 'fuerza' | 'cuerpo' | 'semanas';

const TABS: { key: Tab; label: string }[] = [
  { key: 'fuerza', label: 'FUERZA' },
  { key: 'cuerpo', label: 'CUERPO' },
  { key: 'semanas', label: 'SEMANAS' },
];

const METRICS: { key: MetricKey; label: string; unit: string; color: string }[] = [
  { key: 'peso',    label: 'PESO',    unit: 'kg', color: BRAND.yellow },
  { key: 'grasa',   label: 'GRASA',   unit: '%',  color: BRAND.red },
  { key: 'musculo', label: 'MÚSCULO', unit: '%',  color: BRAND.cyan },
];

const ALL_BADGES = [
  { key: 'first_pr',  icon: '⚡', label: 'PRIMER PR' },
  { key: 'streak_10', icon: '🔥', label: 'RACHA 10D' },
  { key: 'minus_3kg', icon: '▲',  label: '−3 KG' },
  { key: 'full_week', icon: '◆',  label: '100% SEM' },
  { key: 'squat_140', icon: '★',  label: '140 SQUAT' },
  { key: 'recomp',    icon: '◇',  label: 'RECOMP' },
];

/** Vertical chart bar that animates to its height */
function VBar({ pct, color }: { pct: number; color: string }) {
  const h = useSharedValue(0);
  useEffect(() => {
    h.set(withTiming(pct, { duration: 450 }));
  }, [pct, h]);
  const style = useAnimatedStyle(() => ({ height: `${h.get()}%` }));
  return <Animated.View style={[{ width: '100%', backgroundColor: color }, style]} />;
}

function heatColor(v: number, accent: string, C: ColorTokens) {
  if (v === 0) return C.bgEl;
  if (v === 1) return withAlpha(accent, 0.3);
  if (v === 2) return withAlpha(accent, 0.6);
  return accent;
}

function SectionTitle({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 8 }}>
      <Label>{children}</Label>
      {right}
    </View>
  );
}

export default function ProgresoScreen() {
  // The route param is the source of truth, so deep links (Hoy signals, the
  // result screen, the weekly story) and the segments stay in sync.
  const params = useLocalSearchParams<{ tab?: string }>();
  const tab: Tab = params.tab === 'cuerpo' || params.tab === 'semanas' ? params.tab : 'fuerza';
  const { userId } = useSession();
  const { state } = useApp();
  const { accent } = usePreferences();
  const C = useColors();
  const insets = useSafeAreaInsets();
  const [cards, setCards] = useState<SessionCard[]>([]);
  const [weeks, setWeeks] = useState<WeekEntry[] | null>(null);

  useFocusEffect(useCallback(() => {
    if (!userId) return;
    let active = true;
    listSessionCards(userId, 20)
      .then(items => { if (active) setCards(items); })
      .catch(e => console.error('[progress-cards]', e));
    listRecentWeeks(userId, state.plannedDaysPerWeek)
      .then(items => { if (active) setWeeks(items); })
      .catch(e => console.error('[progress-weeks]', e));
    return () => { active = false; };
  }, [userId, state.plannedDaysPerWeek]));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <PressableScale
            onPress={() => router.back()}
            accessibilityLabel="Volver"
            style={{ width: 44, height: 44, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: F.mono, fontSize: 15, color: C.textPrimary }}>←</Text>
          </PressableScale>
          <View style={{ flex: 1 }}>
            <Label>TU HISTORIA</Label>
            <Text accessibilityRole="header" style={{ fontFamily: F.grotesk, fontSize: 23, color: C.textPrimary, marginTop: 3 }}>Progreso</Text>
          </View>
        </View>

        <Segmented options={TABS} value={tab} onChange={key => router.setParams({ tab: key })} accent={accent} style={{ marginBottom: 16 }} />

        {tab === 'fuerza' && <StrengthView cards={cards} />}
        {tab === 'cuerpo' && <BodyView />}
        {tab === 'semanas' && <WeeksView cards={cards} weeks={weeks} />}
      </View>
    </ScrollView>
  );
}

// ── FUERZA ──────────────────────────────────────────────────────────────────

function StrengthView({ cards }: { cards: SessionCard[] }) {
  const { state } = useApp();
  const { accent, weightUnit } = usePreferences();
  const { now } = usePulse();
  const C = useColors();
  const [range, setRange] = useState<TrendRange>(28);
  const trend = useMemo(() => computeStrengthTrend(state.trainingSessions, now, range), [state.trainingSessions, now, range]);
  const latest = cards[0] ?? null;
  const values = trend.buckets.filter((value): value is number => value != null);
  const min = values.length ? Math.min(...values) : 1;
  const max = values.length ? Math.max(...values) : 1;
  const barPct = (value: number) => Math.round(25 + ((value - min) / (max - min || 1)) * 75);

  const sentence = trend.deltaPct == null
    ? 'Registrá al menos dos sesiones de un mismo ejercicio en este período para ver tu tendencia.'
    : trend.deltaPct > 1 ? 'Tu fuerza estimada sube en los movimientos que repetís.'
      : trend.deltaPct < -1 ? 'Tu fuerza estimada quedó por debajo del inicio del período.'
        : 'Tu fuerza estimada se mantiene estable.';

  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <View style={{ borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Label>{`FUERZA ESTIMADA · ${range} DÍAS`}</Label>
          <Segmented
            compact
            accent={accent}
            value={range}
            onChange={setRange}
            options={[
              { key: 7 as const, label: '7D', accessibilityLabel: 'Últimos 7 días' },
              { key: 28 as const, label: '28D', accessibilityLabel: 'Últimos 28 días' },
              { key: 90 as const, label: '90D', accessibilityLabel: 'Últimos 90 días' },
            ]}
          />
        </View>
        <Text style={{ fontFamily: F.monoXBold, fontSize: 46, lineHeight: 52, color: trend.deltaPct == null ? C.textTertiary : C.textPrimary, marginTop: 10 }}>
          {trend.deltaPct == null ? '—' : `${trend.deltaPct > 0 ? '+' : ''}${trend.deltaPct}%`}
        </Text>
        <Text style={{ fontFamily: F.inter, fontSize: 13, lineHeight: 19, color: C.textSecondary, marginTop: 2 }}>{sentence}</Text>
        {values.length > 0 && (
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={`Tendencia de fuerza en ${trend.buckets.length} tramos. ${sentence}`}
            style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 96, marginTop: 14 }}
          >
            {trend.buckets.map((value, index) => (
              <View key={index} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                {value == null
                  ? <View style={{ height: 2, backgroundColor: C.border }} />
                  : <VBar pct={barPct(value)} color={index === trend.buckets.length - 1 || value === max ? accent : withAlpha(accent, 0.35)} />}
              </View>
            ))}
          </View>
        )}
      </View>

      {trend.movements.length > 0 && (
        <>
          <SectionTitle>MOVIMIENTOS CLAVE</SectionTitle>
          {trend.movements.map((movement, index) => (
            <View
              key={movement.exerciseId}
              accessible
              accessibilityLabel={`${movement.name}: fuerza estimada ${displayWeight(movement.currentE1rm, weightUnit)} ${weightUnit}, ${movement.deltaPct > 0 ? 'sube' : 'cambia'} ${movement.deltaPct}%`}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: index ? 1 : 0, borderTopColor: C.border }}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.textPrimary }}>{movement.name}</Text>
                <Label>{`E1RM · ${formatWeight(movement.currentE1rm, weightUnit).toUpperCase()}`}</Label>
              </View>
              <Text style={{ fontFamily: F.monoBold, fontSize: 13, color: movement.deltaPct >= 0 ? C.textPrimary : C.textSecondary }}>
                {`${movement.deltaPct > 0 ? '+' : ''}${movement.deltaPct}%`}
              </Text>
            </View>
          ))}
        </>
      )}

      {latest && (
        <PressableScale
          onPress={() => router.push({ pathname: '/resultado-sesion', params: { sessionId: latest.sessionId, origin: 'history' } })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, padding: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.card }}
        >
          <View style={{ flex: 1, gap: 3 }}>
            <Label>ÚLTIMA TARJETA</Label>
            <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }}>
              {`${CARD_FAMILIES[latest.type].label} · ${cardText(latest, weightUnit).headline}`}
            </Text>
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: 15, color: C.textSecondary }}>→</Text>
        </PressableScale>
      )}

      <SectionTitle>RÉCORDS</SectionTitle>
      {state.prHistory.length === 0 ? (
        <Text style={{ fontFamily: F.inter, fontSize: 12, color: C.textTertiary }}>Todavía no tenés récords registrados.</Text>
      ) : state.prHistory.slice(0, 6).map((record, index) => (
        <View key={record.exerciseId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderTopColor: C.border }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }}>{record.nombre}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary, marginTop: 2 }}>
              ×{record.reps} · {record.achievedAt.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
            </Text>
          </View>
          <Text style={{ fontFamily: F.monoBold, fontSize: 14, color: C.textPrimary }}>{formatWeight(record.weightKg, weightUnit)}</Text>
        </View>
      ))}
    </Animated.View>
  );
}

// ── CUERPO ──────────────────────────────────────────────────────────────────

function BodyView() {
  const { state, setMetric, incWeighIn, decWeighIn, registrarPeso, addProgressPhoto } = useApp();
  const { accent, weightUnit } = usePreferences();
  const { load, now } = usePulse();
  const C = useColors();
  const [muscle, setMuscle] = useState<DetailedMuscleKey | null>(null);

  const recentExercises = useMemo(() => {
    if (!muscle) return [];
    const names: string[] = [];
    for (const session of [...state.trainingSessions].reverse()) {
      if (now - sessionTime(session) > 28 * 86_400_000) break;
      for (const exercise of session.exercises) {
        if (exercise.muscles.includes(muscle) && !names.includes(exercise.name)) names.push(exercise.name);
      }
    }
    return names.slice(0, 3);
  }, [muscle, state.trainingSessions, now]);
  const entry = muscle ? load.byMuscle[muscle] : undefined;
  const recovering = (Object.entries(load.byMuscle) as [DetailedMuscleKey, { recovering: boolean }][])
    .filter(([, value]) => value.recovering).map(([key]) => DETAILED_MUSCLE_LABELS[key].toLowerCase());

  const colorFor = (m: (typeof METRICS)[number]) => m.key === 'peso' ? accent : m.color;
  const metricDef = METRICS.find(m => m.key === state.metric)!;
  const metricColor = colorFor(metricDef);
  const isPeso = state.metric === 'peso';
  const displayUnit = isPeso ? weightUnit : metricDef.unit;
  const convert = (v: number) => isPeso ? displayWeight(v, weightUnit) : v;
  const hist = state.histories[state.metric];
  const hasData = hist.length > 0;
  const cur = convert(hasData ? hist[hist.length - 1].value : state.metricVals[state.metric]);
  const values = hist.map(p => p.value);
  const maxH = hasData ? Math.max(...values) : 0;
  const minH = hasData ? Math.min(...values) : 0;
  const barPct = (v: number) => Math.round(30 + ((v - minH) / (maxH - minH || 1)) * 70);
  const logged = state.loggedToday[state.metric];
  const antes = state.photos[0] ?? null;
  const hoy = state.photos.length > 1 ? state.photos[state.photos.length - 1] : null;

  async function pickPhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [3, 4] });
      if (!result.canceled && result.assets[0]) addProgressPhoto(result.assets[0].uri);
    } catch (e) {
      console.error('[picker]', e);
    }
  }

  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <Label style={{ marginBottom: 4 }}>{`CARGA · 7 DÍAS · ${load.totalSets ? load.level : 'SIN REGISTROS'}`}</Label>
      <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textSecondary, marginBottom: 10 }}>
        {recovering.length
          ? `Recuperando: ${recovering.slice(0, 3).join(', ')}. Es una referencia de entrenamiento, no una evaluación médica.`
          : 'Tocá un músculo para ver su carga reciente.'}
      </Text>
      <BodyMapPanel
        load={load}
        selected={muscle ? [muscle] : []}
        selectable={false}
        gender={state.profileData?.sex === 'F' ? 'female' : 'male'}
        onMusclePress={key => setMuscle(current => current === key ? null : key)}
      />
      {muscle && (
        <Animated.View entering={FadeIn.duration(160)} style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12, marginTop: 8, gap: 6 }}>
          <Text style={{ fontFamily: F.grotesk, fontSize: 18, color: C.textPrimary }}>{DETAILED_MUSCLE_LABELS[muscle]}</Text>
          <Label style={entry?.recovering ? { color: C.cyan } : undefined}>{loadDescription(entry)}</Label>
          <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textSecondary }}>
            {entry?.lastAt
              ? `Última vez: ${new Date(entry.lastAt).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' })}.`
              : 'Sin registros en los últimos 7 días.'}
            {recentExercises.length ? ` Ejercicios recientes: ${recentExercises.join(', ')}.` : ''}
          </Text>
        </Animated.View>
      )}

      <SectionTitle>COMPOSICIÓN</SectionTitle>
      <Segmented
        accent={metricColor}
        value={state.metric}
        onChange={setMetric}
        options={METRICS.map(m => ({ key: m.key, label: m.label }))}
        style={{ marginBottom: 12 }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 12 }}>
        <Text style={{ fontFamily: F.monoXBold, fontSize: 34, color: C.textPrimary }}>{cur.toFixed(1)}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.textTertiary }}>{displayUnit}</Text>
      </View>
      {hasData ? (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Historial de ${metricDef.label.toLowerCase()}: ${hist.map(p => `${convert(p.value).toFixed(1)} el ${p.label}`).join(', ')}`}
          style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 7, height: 110 }}
        >
          {hist.map((p, i) => (
            <View key={`${p.label}-${i}`} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textSecondary, marginBottom: 6 }}>{convert(p.value).toFixed(1)}</Text>
              <View style={{ width: '100%', flex: 1, justifyContent: 'flex-end' }}>
                <VBar pct={barPct(p.value)} color={i === hist.length - 1 ? metricColor : withAlpha(metricColor, 0.33)} />
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.textTertiary, marginTop: 6 }}>{p.label}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ fontFamily: F.inter, fontSize: 12, color: C.textTertiary }}>
          Sin datos de {metricDef.label.toLowerCase()} todavía — registrá tu primer valor abajo.
        </Text>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 16, marginBottom: 10 }}>
        <PressableScale onPress={decWeighIn} accessibilityLabel={`Bajar ${metricDef.label.toLowerCase()}`} style={{ width: 44, height: 44, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: F.mono, fontSize: 20, color: C.textPrimary }}>−</Text>
        </PressableScale>
        <Text style={{ fontFamily: F.monoXBold, fontSize: 30, color: C.textPrimary, fontVariant: ['tabular-nums'] }}>
          {convert(state.metricVals[state.metric]).toFixed(1)}
        </Text>
        <PressableScale onPress={incWeighIn} accessibilityLabel={`Subir ${metricDef.label.toLowerCase()}`} style={{ width: 44, height: 44, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: F.mono, fontSize: 20, color: C.textPrimary }}>+</Text>
        </PressableScale>
      </View>
      <PressableScale
        onPress={registrarPeso}
        haptic="success"
        style={{ minHeight: 46, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.textSecondary, backgroundColor: logged ? C.bgEl : 'transparent' }}
      >
        <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, color: C.textPrimary }}>
          {logged ? '✓ REGISTRADO · TOCÁ PARA ACTUALIZAR' : `REGISTRAR ${metricDef.label}`}
        </Text>
      </PressableScale>

      <SectionTitle>FOTOS · ANTES / AHORA</SectionTitle>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[
          { label: 'foto · antes', photo: antes },
          { label: 'foto · hoy', photo: hoy },
        ].map((f, i) => (
          <View key={i} style={{ flex: 1 }}>
            <PressableScale
              onPress={pickPhoto}
              haptic="light"
              accessibilityLabel={f.photo ? `Cambiar ${f.label}` : `Subir ${f.label}`}
              style={{ height: 170, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
            >
              {f.photo ? (
                <Image source={{ uri: f.photo.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
              ) : (
                <>
                  <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary, letterSpacing: 0.6 }}>{f.label}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary, marginTop: 6 }}>+ tocar para subir</Text>
                </>
              )}
            </PressableScale>
            {f.photo && (
              <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary, marginTop: 5, textAlign: 'center' }}>
                {f.photo.takenAt.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
              </Text>
            )}
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

// ── SEMANAS ─────────────────────────────────────────────────────────────────

function WeeksView({ cards, weeks }: { cards: SessionCard[]; weeks: WeekEntry[] | null }) {
  const { state } = useApp();
  const { accent, weightUnit } = usePreferences();
  const C = useColors();
  const thisMonday = mondayOf(new Date());

  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <Label style={{ marginBottom: 8 }}>RESÚMENES SEMANALES</Label>
      <PressableScale
        onPress={() => router.push({ pathname: '/resumen-semanal', params: { week: dateStr(thisMonday) } })}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderBottomWidth: 1, borderBottomColor: C.border }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }}>{`Esta semana · ${weekRangeLabel(thisMonday)}`}</Text>
          <Label>EN CURSO · SE CIERRA EL DOMINGO</Label>
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: 14, color: C.textSecondary }}>→</Text>
      </PressableScale>
      {weeks?.map(entry => (
        <PressableScale
          key={entry.summary.weekStart}
          onPress={() => router.push({ pathname: '/resumen-semanal', params: { week: entry.summary.weekStart } })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderBottomWidth: 1, borderBottomColor: C.border }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }}>{weekRangeLabel(entry.weekStart)}</Text>
            <Label>{`${entry.summary.pages.length} PÁGINAS${entry.viewedAt ? '' : ' · NUEVO'}`}</Label>
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: 14, color: entry.viewedAt ? C.textSecondary : accent }}>→</Text>
        </PressableScale>
      ))}
      {weeks && weeks.length === 0 && (
        <Text style={{ fontFamily: F.inter, fontSize: 12, color: C.textTertiary, marginTop: 8 }}>
          Tu primer resumen aparece cuando cierre una semana con registros.
        </Text>
      )}

      <SectionTitle>TARJETAS</SectionTitle>
      {cards.length === 0 ? (
        <Text style={{ fontFamily: F.inter, fontSize: 12, color: C.textTertiary }}>
          Cuando una sesión deje un resultado — un récord, más control, un regreso o un plan cumplido — su tarjeta queda acá.
        </Text>
      ) : cards.map((card, index) => {
        const family = CARD_FAMILIES[card.type];
        return (
          <PressableScale
            key={card.id}
            onPress={() => router.push({ pathname: '/resultado-sesion', params: { sessionId: card.sessionId, origin: 'history' } })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderTopWidth: index ? 1 : 0, borderTopColor: C.border }}
          >
            <View style={{ width: 4, alignSelf: 'stretch', marginVertical: 10, backgroundColor: family.color(accent, C) }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }}>{`${family.label} · ${cardText(card, weightUnit).headline}`}</Text>
              <Label>{card.earnedAt.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}</Label>
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary }}>{`#${String(card.serial).padStart(3, '0')}`}</Text>
          </PressableScale>
        );
      })}

      <SectionTitle right={<Label>{`${state.racha} ${state.racha === 1 ? 'DÍA' : 'DÍAS'} DE RACHA`}</Label>}>CONTINUIDAD · 12 SEMANAS</SectionTitle>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Mapa de continuidad de doce semanas. Racha actual: ${state.racha} días.`}
        style={{ flexDirection: 'row', gap: 3 }}
      >
        {state.heatmap.map((col, wi) => (
          <View key={wi} style={{ flex: 1, gap: 3 }}>
            {col.map((cell, di) => (
              <View key={di} style={{ aspectRatio: 1, backgroundColor: heatColor(cell, accent, C), borderWidth: 1, borderColor: cell === 0 ? C.border : 'transparent' }} />
            ))}
          </View>
        ))}
      </View>

      <SectionTitle>LOGROS</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {ALL_BADGES.map(badge => {
          const earnedAt = state.earned[badge.key];
          const earned = earnedAt != null;
          return (
            <View
              key={badge.key}
              accessible
              accessibilityLabel={`${badge.label}: ${earned ? 'conseguido' : 'pendiente'}`}
              style={{ width: '31%', flexGrow: 1, opacity: earned ? 1 : 0.4, borderWidth: 1, borderColor: earned ? accent : C.border, padding: 12, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 18 }}>{badge.icon}</Text>
              <Label style={{ marginTop: 6, textAlign: 'center', ...(earned ? { color: C.textPrimary } : {}) }}>{badge.label}</Label>
              {earned && (
                <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.textTertiary, marginTop: 3 }}>
                  {new Date(earnedAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}
