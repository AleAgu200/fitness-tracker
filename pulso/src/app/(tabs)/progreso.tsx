import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, F } from '@/constants/colors';
import { MetricKey, useApp } from '@/context/app-state';

const METRICS: { key: MetricKey; label: string; unit: string; color: string }[] = [
  { key: 'peso',    label: 'PESO',    unit: 'kg', color: C.yellow },
  { key: 'grasa',   label: 'GRASA',   unit: '%',  color: C.red },
  { key: 'musculo', label: 'MÚSCULO', unit: '%',  color: C.cyan },
];

function Label({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1.4, color: C.textTertiary, textTransform: 'uppercase', ...style }}>
      {children}
    </Text>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <View style={{ height: 96, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border, borderStyle: 'dashed' }}>
      <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary }}>
        Sin datos de {label.toLowerCase()} aún
      </Text>
    </View>
  );
}

export default function ProgresoScreen() {
  const { state, setMetric, incWeighIn, decWeighIn, registrarPeso } = useApp();
  const insets = useSafeAreaInsets();

  const metricDef = METRICS.find(m => m.key === state.metric)!;

  // Only peso has a history in state; grasa/musculo are future features
  const hist = state.metric === 'peso' ? state.pesoHist : [];
  const hasData = hist.length > 0;

  const cur   = hasData ? hist[hist.length - 1] : state.weighIn;
  const prev  = hasData ? hist[0] : null;
  const delta = prev != null ? cur - prev : null;
  const deltaStr  = delta != null ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} ${metricDef.unit}` : null;
  const deltaColor = delta != null
    ? (state.metric === 'musculo' ? (delta >= 0 ? C.yellow : C.red) : (delta <= 0 ? C.yellow : C.red))
    : C.textTertiary;

  const maxH = hasData ? Math.max(...hist) : 0;
  const minH = hasData ? Math.min(...hist) : 0;
  const range = maxH - minH || 1;

  function barHeight(v: number): `${number}%` {
    const ratio = (v - minH) / range;
    return `${Math.round(30 + ratio * 70)}%`;
  }

  const weekLabels = hist.map((_, i) => `S${i + 1}`);

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
              <TouchableOpacity
                key={m.key}
                onPress={() => setMetric(m.key)}
                style={{
                  flex: 1, padding: 9, borderWidth: 1,
                  borderColor: sel ? m.color : C.border,
                  backgroundColor: sel ? `${m.color}22` : C.card,
                  alignItems: 'center',
                }}
                activeOpacity={0.8}
              >
                <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: sel ? m.color : C.textSecondary }}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* CHART */}
        <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 14 }}>
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
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 7, height: 96 }}>
              {hist.map((v, i) => (
                <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textSecondary, marginBottom: 6 }}>{v}</Text>
                  <View style={{ width: '100%', backgroundColor: i === hist.length - 1 ? metricDef.color : `${metricDef.color}55`, height: barHeight(v) }} />
                  <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.textTertiary, marginTop: 6 }}>{weekLabels[i]}</Text>
                </View>
              ))}
            </View>
          ) : (
            <EmptyChart label={metricDef.label} />
          )}
        </View>

        {/* WEIGH-IN */}
        <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 14 }}>
          <Label style={{ marginBottom: 14 }}>REGISTRAR PESAJE · HOY</Label>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 14 }}>
            <TouchableOpacity onPress={decWeighIn} style={{ width: 38, height: 38, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, alignItems: 'center', justifyContent: 'center' }} activeOpacity={0.7}>
              <Text style={{ fontFamily: F.mono, fontSize: 20, color: C.textPrimary }}>−</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text style={{ fontFamily: F.monoXBold, fontSize: 40, color: C.textPrimary, fontVariant: ['tabular-nums'] as any }}>
                {state.weighIn.toFixed(1)}
              </Text>
              <Text style={{ fontFamily: F.mono, fontSize: 14, color: C.textTertiary }}>kg</Text>
            </View>
            <TouchableOpacity onPress={incWeighIn} style={{ width: 38, height: 38, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, alignItems: 'center', justifyContent: 'center' }} activeOpacity={0.7}>
              <Text style={{ fontFamily: F.mono, fontSize: 20, color: C.textPrimary }}>+</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={registrarPeso}
            style={{
              padding: 14, borderWidth: 1, borderColor: C.yellow, alignItems: 'center',
              backgroundColor: state.weighed ? C.yellow : 'transparent',
            }}
            activeOpacity={0.8}
          >
            <Text style={{ fontFamily: F.monoBold, fontSize: 12, letterSpacing: 0.6, color: state.weighed ? C.bg : C.yellow, textTransform: 'uppercase' }}>
              {state.weighed ? '✓ REGISTRADO' : 'REGISTRAR PESO'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* FOTOS */}
        <Label style={{ marginBottom: 9 }}>FOTOS · ANTES / AHORA</Label>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[{ label: 'foto · antes', color: C.border, textColor: C.textTertiary }, { label: 'foto · hoy', color: C.yellow, textColor: C.yellow }].map((f, i) => (
            <View key={i} style={{ flex: 1 }}>
              <View style={{ height: 180, borderWidth: 1, borderColor: f.color, backgroundColor: C.bgEl, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: F.mono, fontSize: 10, color: f.textColor, letterSpacing: 0.6 }}>{f.label}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
