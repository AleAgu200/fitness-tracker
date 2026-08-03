import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, GlowPulse, Label, PressableScale } from '@/components/ui/kit';
import { C, F, withAlpha } from '@/constants/colors';
import { MetricKey, useApp } from '@/context/app-state';
import { usePreferences } from '@/context/preferences';
import { displayWeight, formatWeight } from '@/lib/units';

const METRICS: { key: MetricKey; label: string; unit: string; color: string }[] = [
  { key: 'peso',    label: 'PESO',    unit: 'kg', color: C.yellow },
  { key: 'grasa',   label: 'GRASA',   unit: '%',  color: C.red },
  { key: 'musculo', label: 'MÚSCULO', unit: '%',  color: C.cyan },
];

const ALL_BADGES = [
  { key: 'first_pr',  icon: '⚡', label: 'PRIMER PR' },
  { key: 'streak_10', icon: '🔥', label: 'RACHA 10D' },
  { key: 'minus_3kg', icon: '▲',  label: '−3 KG' },
  { key: 'full_week', icon: '◆',  label: '100% SEM' },
  { key: 'squat_140', icon: '★',  label: '140 SQUAT' },
  { key: 'recomp',    icon: '◇',  label: 'RECOMP' },
];

function EmptyChart({ label }: { label: string }) {
  return (
    <View style={{ height: 96, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border, borderStyle: 'dashed' }}>
      <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary }}>
        Sin datos de {label.toLowerCase()} aún — registrá tu primer valor abajo
      </Text>
    </View>
  );
}

/** Vertical chart bar that animates to its height */
function VBar({ pct, color }: { pct: number; color: string }) {
  const h = useSharedValue(0);
  useEffect(() => {
    h.value = withTiming(pct, { duration: 550 });
  }, [pct, h]);
  const style = useAnimatedStyle(() => ({ height: `${h.value}%` }));
  return <Animated.View style={[{ width: '100%', backgroundColor: color }, style]} />;
}

function heatColor(v: number, accent: string) {
  if (v === 0) return C.bgEl;
  if (v === 1) return withAlpha(accent, 0.3);
  if (v === 2) return withAlpha(accent, 0.6);
  return accent;
}

function heatBorder(v: number) {
  return v === 0 ? C.border : 'transparent';
}

export default function ProgresoScreen() {
  const { state, setMetric, incWeighIn, decWeighIn, registrarPeso, addProgressPhoto } = useApp();
  const { accent, weightUnit } = usePreferences();
  const insets = useSafeAreaInsets();

  const colorFor = (m: (typeof METRICS)[number]) => m.key === 'peso' ? accent : m.color;
  const metricDef = METRICS.find(m => m.key === state.metric)!;
  const metricColor = colorFor(metricDef);
  const isPeso = state.metric === 'peso';
  const displayUnit = isPeso ? weightUnit : metricDef.unit;
  const convert = (v: number) => isPeso ? displayWeight(v, weightUnit) : v;
  const hist = state.histories[state.metric];
  const hasData = hist.length > 0;
  const stepVal = convert(state.metricVals[state.metric]);
  const logged = state.loggedToday[state.metric];

  const cur   = convert(hasData ? hist[hist.length - 1].value : state.metricVals[state.metric]);
  const prev  = hasData && hist.length > 1 ? convert(hist[0].value) : null;
  const delta = prev != null ? cur - prev : null;
  const deltaStr  = delta != null ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} ${displayUnit}` : null;
  const deltaColor = delta != null
    ? (state.metric === 'musculo' ? (delta >= 0 ? accent : C.red) : (delta <= 0 ? accent : C.red))
    : C.textTertiary;

  const values = hist.map(p => p.value);
  const maxH = hasData ? Math.max(...values) : 0;
  const minH = hasData ? Math.min(...values) : 0;
  const range = maxH - minH || 1;
  const barPct = (v: number) => Math.round(30 + ((v - minH) / range) * 70);

  const antes = state.photos[0] ?? null;
  const hoy = state.photos.length > 1 ? state.photos[state.photos.length - 1] : null;

  const prHistory = state.prHistory;

  async function pickPhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
        aspect: [3, 4],
      });
      if (!result.canceled && result.assets[0]) {
        addProgressPhoto(result.assets[0].uri);
      }
    } catch (e) {
      console.error('[picker]', e);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16 }}>

        {/* HEADER */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <PressableScale onPress={() => router.back()} style={{ width: 34, height: 34, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.mono, fontSize: 15, color: C.textPrimary }}>←</Text>
          </PressableScale>
          <View style={{ flex: 1 }}>
            <Label>COMPOSICIÓN · HISTORIAL</Label>
            <Text style={{ fontFamily: F.grotesk, fontSize: 23, color: C.textPrimary, marginTop: 3 }}>Progreso</Text>
          </View>
        </View>

        {/* METRIC TOGGLE */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
          {METRICS.map(m => {
            const sel = state.metric === m.key;
            return (
              <PressableScale
                key={m.key}
                onPress={() => setMetric(m.key)}
                style={{
                  flex: 1, padding: 9, borderWidth: 1,
                  borderColor: sel ? colorFor(m) : C.border,
                  backgroundColor: sel ? withAlpha(colorFor(m), 0.13) : C.card,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: sel ? colorFor(m) : C.textSecondary }}>
                  {m.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>

        {/* CHART */}
        <Card index={0} style={{ padding: 14, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
            <View>
              <Label style={{ marginBottom: 7 }}>{metricDef.label} ACTUAL</Label>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <Text style={{ fontFamily: F.monoXBold, fontSize: 34, lineHeight: 29, color: metricColor }}>
                  {cur.toFixed(1)}
                </Text>
                <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.textTertiary }}>{displayUnit}</Text>
              </View>
            </View>
            {deltaStr && (
              <Text style={{ fontFamily: F.mono, fontSize: 12, color: deltaColor }}>{deltaStr}</Text>
            )}
          </View>

          {hasData ? (
            <Animated.View key={state.metric} entering={FadeIn.duration(250)} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 7, height: 110 }}>
              {hist.map((p, i) => (
                <View key={`${p.label}-${i}`} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textSecondary, marginBottom: 6 }}>{convert(p.value).toFixed(1)}</Text>
                  <View style={{ width: '100%', flex: 1, justifyContent: 'flex-end' }}>
                    <VBar pct={barPct(p.value)} color={i === hist.length - 1 ? metricColor : withAlpha(metricColor, 0.33)} />
                  </View>
                  <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.textTertiary, marginTop: 6 }}>{p.label}</Text>
                </View>
              ))}
            </Animated.View>
          ) : (
            <EmptyChart label={metricDef.label} />
          )}
        </Card>

        {/* LOG VALUE */}
        <Card index={1} style={{ padding: 14, marginBottom: 14 }}>
          <Label style={{ marginBottom: 14 }}>REGISTRAR {metricDef.label} · HOY</Label>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 14 }}>
            <PressableScale onPress={decWeighIn} style={{ width: 38, height: 38, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: F.mono, fontSize: 20, color: C.textPrimary }}>−</Text>
            </PressableScale>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text style={{ fontFamily: F.monoXBold, fontSize: 40, color: C.textPrimary, fontVariant: ['tabular-nums'] as any }}>
                {stepVal.toFixed(1)}
              </Text>
              <Text style={{ fontFamily: F.mono, fontSize: 14, color: C.textTertiary }}>{displayUnit}</Text>
            </View>
            <PressableScale onPress={incWeighIn} style={{ width: 38, height: 38, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: F.mono, fontSize: 20, color: C.textPrimary }}>+</Text>
            </PressableScale>
          </View>
          <PressableScale
            onPress={registrarPeso}
            haptic="success"
            style={{
              padding: 14, borderWidth: 1, borderColor: metricColor, alignItems: 'center',
              backgroundColor: logged ? metricColor : 'transparent',
            }}
          >
            <Text style={{ fontFamily: F.monoBold, fontSize: 12, letterSpacing: 0.6, color: logged ? C.bg : metricColor, textTransform: 'uppercase' }}>
              {logged ? '✓ REGISTRADO · TOCÁ PARA ACTUALIZAR' : `REGISTRAR ${metricDef.label}`}
            </Text>
          </PressableScale>
        </Card>

        {/* FASE DEL PROGRAMA */}
        <Card index={2} style={{ padding: 16, marginBottom: 14, alignItems: 'center' }}>
          <Label style={{ marginBottom: 10 }}>FASE DEL PROGRAMA</Label>
          {state.exercises.length > 0 ? (
            <>
              <Text style={{ fontFamily: F.groteskMed, fontSize: 16, color: C.textPrimary }}>Plan personal · Full Body</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary, marginTop: 6 }}>
                {state.exercises.length} EJERCICIOS · {state.sessionsCount} SESIONES COMPLETADAS
              </Text>
            </>
          ) : (
            <Text style={{ fontFamily: F.inter, fontSize: 13, color: C.textTertiary, textAlign: 'center', lineHeight: 19 }}>
              Sin plan de entreno.{'\n'}Armá el tuyo en la pestaña ENTRENO.
            </Text>
          )}
        </Card>

        {/* LOGROS */}
        <Label style={{ marginBottom: 9 }}>LOGROS</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {ALL_BADGES.map((b, i) => {
            const earnedAt = state.earned[b.key];
            const earned = earnedAt != null;
            const inner = (
              <>
                <Text style={{ fontSize: 20, lineHeight: 24 }}>{b.icon}</Text>
                <Label style={{ marginTop: 8, textAlign: 'center', lineHeight: 14, ...(earned ? { color: accent } : {}) }}>{b.label}</Label>
                {earned && (
                  <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.textTertiary, marginTop: 4 }}>
                    {new Date(earnedAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                  </Text>
                )}
              </>
            );
            return (
              <Animated.View
                key={b.key}
                entering={FadeInDown.duration(280).delay(i * 40).easing(Easing.out(Easing.cubic))}
                style={{ width: '30.5%' }}
              >
                {/* opacity lives on a plain child so the entering animation owns the Animated.View's */}
                <View style={{ opacity: earned ? 1 : 0.4 }}>
                  {earned ? (
                    // Unlocked badges glow with a slow golden pulse
                    <GlowPulse color={accent} intensity={0.12} period={1400} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: accent, padding: 13, alignItems: 'center' }}>
                      {inner}
                    </GlowPulse>
                  ) : (
                    <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.borderLight, padding: 13, alignItems: 'center' }}>
                      {inner}
                    </View>
                  )}
                </View>
              </Animated.View>
            );
          })}
        </View>

        {/* PR HISTORY */}
        <Card index={4} style={{ marginBottom: 14 }}>
          <View style={{ padding: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <Label>HISTORIAL DE PRs</Label>
          </View>
          {prHistory.length === 0 ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textTertiary }}>
                Aún no tenés PRs registrados
              </Text>
            </View>
          ) : (
            prHistory.map((p, i) => (
              <Animated.View
                key={p.exerciseId}
                entering={FadeInDown.duration(250).delay(i * 40)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, paddingHorizontal: 14, borderBottomWidth: i < prHistory.length - 1 ? 1 : 0, borderBottomColor: C.borderLight }}
              >
                <Text style={{ fontFamily: F.mono, fontSize: 11, color: accent, width: 14 }}>◆</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }}>{p.nombre}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary, marginTop: 2 }}>
                    ×{p.reps} · {p.achievedAt.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                  </Text>
                </View>
                <Text style={{ fontFamily: F.monoXBold, fontSize: 15, color: C.textPrimary }}>{formatWeight(p.weightKg, weightUnit)}</Text>
              </Animated.View>
            ))
          )}
        </Card>

        {/* HEATMAP */}
        <Card index={5} style={{ padding: 14, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Label>ENTRENOS · 12 SEM</Label>
            <Label>L M M J V S D</Label>
          </View>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {state.heatmap.map((col, wi) => (
              <View key={wi} style={{ flex: 1, gap: 3 }}>
                {col.map((cell, di) => (
                  <View
                    key={di}
                    style={{
                      aspectRatio: 1,
                      backgroundColor: heatColor(cell, accent),
                      borderWidth: 1, borderColor: heatBorder(cell),
                    }}
                  />
                ))}
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
            <Label>menos</Label>
            {[0, 1, 2, 3].map(v => (
              <View key={v} style={{ width: 11, height: 11, backgroundColor: heatColor(v, accent), borderWidth: 1, borderColor: heatBorder(v) }} />
            ))}
            <Label>más</Label>
          </View>
        </Card>

        {/* FOTOS */}
        <Label style={{ marginBottom: 9 }}>FOTOS · ANTES / AHORA</Label>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[
            { label: 'foto · antes', photo: antes, color: C.border, textColor: C.textTertiary },
            { label: 'foto · hoy', photo: hoy, color: accent, textColor: accent },
          ].map((f, i) => (
            <View key={i} style={{ flex: 1 }}>
              <PressableScale onPress={pickPhoto} haptic="light" style={{ height: 180, borderWidth: 1, borderColor: f.color, backgroundColor: C.bgEl, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {f.photo ? (
                  <Image
                    source={{ uri: f.photo.uri }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    transition={250}
                  />
                ) : (
                  <>
                    <Text style={{ fontFamily: F.mono, fontSize: 10, color: f.textColor, letterSpacing: 0.6 }}>{f.label}</Text>
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
      </View>
    </ScrollView>
  );
}
