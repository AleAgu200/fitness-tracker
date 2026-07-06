import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Label, PressableScale } from '@/components/ui/kit';
import { C, F } from '@/constants/colors';
import { MetricKey, useApp } from '@/context/app-state';

const METRICS: { key: MetricKey; label: string; unit: string; color: string }[] = [
  { key: 'peso',    label: 'PESO',    unit: 'kg', color: C.yellow },
  { key: 'grasa',   label: 'GRASA',   unit: '%',  color: C.red },
  { key: 'musculo', label: 'MÚSCULO', unit: '%',  color: C.cyan },
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

export default function ProgresoScreen() {
  const { state, setMetric, incWeighIn, decWeighIn, registrarPeso, addProgressPhoto } = useApp();
  const insets = useSafeAreaInsets();

  const metricDef = METRICS.find(m => m.key === state.metric)!;
  const hist = state.histories[state.metric];
  const hasData = hist.length > 0;
  const stepVal = state.metricVals[state.metric];
  const logged = state.loggedToday[state.metric];

  const cur   = hasData ? hist[hist.length - 1].value : stepVal;
  const prev  = hasData && hist.length > 1 ? hist[0].value : null;
  const delta = prev != null ? cur - prev : null;
  const deltaStr  = delta != null ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} ${metricDef.unit}` : null;
  const deltaColor = delta != null
    ? (state.metric === 'musculo' ? (delta >= 0 ? C.yellow : C.red) : (delta <= 0 ? C.yellow : C.red))
    : C.textTertiary;

  const values = hist.map(p => p.value);
  const maxH = hasData ? Math.max(...values) : 0;
  const minH = hasData ? Math.min(...values) : 0;
  const range = maxH - minH || 1;
  const barPct = (v: number) => Math.round(30 + ((v - minH) / range) * 70);

  const antes = state.photos[0] ?? null;
  const hoy = state.photos.length > 1 ? state.photos[state.photos.length - 1] : null;

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
      contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16 }}>
        <Label style={{ marginBottom: 6 }}>COMPOSICIÓN · HISTORIAL</Label>
        <Text style={{ fontFamily: F.grotesk, fontSize: 27, color: C.textPrimary, marginBottom: 16 }}>Progreso</Text>

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
                  borderColor: sel ? m.color : C.border,
                  backgroundColor: sel ? `${m.color}22` : C.card,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: sel ? m.color : C.textSecondary }}>
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
                <Text style={{ fontFamily: F.monoXBold, fontSize: 34, lineHeight: 29, color: metricDef.color }}>
                  {cur.toFixed(1)}
                </Text>
                <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.textTertiary }}>{metricDef.unit}</Text>
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
                  <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textSecondary, marginBottom: 6 }}>{p.value.toFixed(1)}</Text>
                  <View style={{ width: '100%', flex: 1, justifyContent: 'flex-end' }}>
                    <VBar pct={barPct(p.value)} color={i === hist.length - 1 ? metricDef.color : `${metricDef.color}55`} />
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
              <Text style={{ fontFamily: F.mono, fontSize: 14, color: C.textTertiary }}>{metricDef.unit}</Text>
            </View>
            <PressableScale onPress={incWeighIn} style={{ width: 38, height: 38, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: F.mono, fontSize: 20, color: C.textPrimary }}>+</Text>
            </PressableScale>
          </View>
          <PressableScale
            onPress={registrarPeso}
            haptic="success"
            style={{
              padding: 14, borderWidth: 1, borderColor: metricDef.color, alignItems: 'center',
              backgroundColor: logged ? metricDef.color : 'transparent',
            }}
          >
            <Text style={{ fontFamily: F.monoBold, fontSize: 12, letterSpacing: 0.6, color: logged ? C.bg : metricDef.color, textTransform: 'uppercase' }}>
              {logged ? '✓ REGISTRADO · TOCÁ PARA ACTUALIZAR' : `REGISTRAR ${metricDef.label}`}
            </Text>
          </PressableScale>
        </Card>

        {/* FOTOS */}
        <Label style={{ marginBottom: 9 }}>FOTOS · ANTES / AHORA</Label>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[
            { label: 'foto · antes', photo: antes, color: C.border, textColor: C.textTertiary },
            { label: 'foto · hoy', photo: hoy, color: C.yellow, textColor: C.yellow },
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
