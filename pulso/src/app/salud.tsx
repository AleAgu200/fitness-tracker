import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Label, PressableScale } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';
import { useApp } from '@/context/app-state';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import { ConnectionState, getConnections, providersWithData, setPreferredSource } from '@/db/health';
import type { HealthMetric } from '@/db/schema';
import { defaultProvider, ProviderId } from '@/lib/health/model';
import { healthProvider } from '@/lib/health/provider';
import { formatSleep, getHealthSummary, HealthSummary, PROVIDER_LABELS } from '@/lib/health/summary';
import { checkAvailability, connectHealth, disconnectHealth, HISTORY_DAYS, refreshHealth } from '@/lib/health/sync';
import type { Availability } from '@/lib/health/types';
import { formatWeight } from '@/lib/units';

const METRICS: { key: HealthMetric; label: string; detail: string }[] = [
  { key: 'steps', label: 'Pasos', detail: 'Total del día, como lo calcula tu app de salud' },
  { key: 'weight', label: 'Peso', detail: 'Se suma a tu historial de peso en PULSO' },
  { key: 'sleep', label: 'Sueño', detail: 'Horas dormidas, por la mañana en que despertaste' },
  { key: 'heart_rate', label: 'Frecuencia cardíaca', detail: 'Solo para mostrarla; PULSO no la interpreta' },
];

/**
 * Health Connect / Apple Health: optional, per-type permissions. Everything
 * imported stays on this phone: it is not shared with professionals, not
 * used for ads, never sent in crash reports.
 */
export default function SaludScreen() {
  const { userId } = useSession();
  const { reloadAll } = useApp();
  const { accent, weightUnit } = usePreferences();
  const C = useColors();
  const insets = useSafeAreaInsets();
  const providerId = healthProvider?.id ?? defaultProvider(Platform.OS);
  const providerName = providerId ? PROVIDER_LABELS[providerId] : 'Salud';

  const [availability, setAvailability] = useState<Availability | null>(null);
  const [connection, setConnection] = useState<ConnectionState | null>(null);
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [withData, setWithData] = useState<ProviderId[]>([]);
  const [selected, setSelected] = useState<HealthMetric[]>(METRICS.map(metric => metric.key));
  const [writeWorkouts, setWriteWorkouts] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!userId) return;
    void (async () => {
      const [state, connections, data, providers] = await Promise.all([
        checkAvailability(),
        getConnections(userId),
        getHealthSummary(userId),
        providersWithData(userId),
      ]);
      setAvailability(state);
      setConnection(connections.find(item => item.provider === providerId) ?? null);
      setSummary(data);
      setWithData(providers);
    })().catch(e => console.error('[salud]', e));
  }, [userId, providerId]);
  useFocusEffect(load);

  const connected = connection?.status === 'connected';

  async function connect() {
    if (!userId || busy) return;
    setBusy(true);
    try {
      const granted = await connectHealth(userId, selected, writeWorkouts);
      if (granted?.readKnown && granted.read.length < selected.length) {
        Alert.alert('Permisos parciales', 'Importamos solo lo que permitiste. El resto lo podés seguir registrando a mano, o habilitarlo después en los ajustes de salud.');
      }
      await reloadAll();
    } catch (error) {
      console.error('[salud-connect]', error);
      Alert.alert('No se pudo conectar', `Revisá que ${providerName} esté disponible en este teléfono.`);
    } finally {
      setBusy(false);
      load();
    }
  }

  async function refresh() {
    if (!userId) return;
    setBusy(true);
    await refreshHealth(userId);
    await reloadAll().catch(() => {});
    setBusy(false);
    load();
  }

  function disconnect() {
    if (!userId) return;
    Alert.alert(`Desconectar ${providerName}`, 'Dejamos de importar. ¿Qué hacemos con lo que ya se importó a PULSO? (No se borra nada de tu app de salud.)', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Conservarlo', onPress: () => void disconnectHealth(userId, false).then(load) },
      {
        text: 'Borrarlo de PULSO',
        style: 'destructive',
        onPress: () => void disconnectHealth(userId, true).then(() => reloadAll()).then(load),
      },
    ]);
  }

  function toggleMetric(metric: HealthMetric) {
    setSelected(current => current.includes(metric) ? current.filter(item => item !== metric) : [...current, metric]);
  }

  const text = (size: number, color: string, family: string = F.inter) => ({ fontFamily: family, fontSize: size, lineHeight: size * 1.45, color });
  const card = { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 14, gap: 12 } as const;
  const button = (primary: boolean) => ({ minHeight: 46, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: primary ? accent : C.border, backgroundColor: primary ? accent : 'transparent' }) as const;

  const rows: { label: string; value: string | null; source: string | null }[] = summary ? [
    { label: 'PASOS HOY', value: summary.steps ? summary.steps.value.toLocaleString('es-AR') : null, source: summary.steps?.source ?? null },
    { label: 'SUEÑO ANOCHE', value: summary.sleep ? formatSleep(summary.sleep.value) : null, source: summary.sleep?.source ?? null },
    { label: 'FRECUENCIA', value: summary.heartRate ? `${summary.heartRate.bpm} lpm` : null, source: summary.heartRate?.source ?? null },
    { label: 'PESO', value: summary.weight ? formatWeight(summary.weight.weightKg, weightUnit) : null, source: summary.weight?.source ?? null },
  ] : [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <PressableScale onPress={() => router.back()} accessibilityLabel="Volver" style={{ width: 34, height: 34, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.mono, fontSize: 15, color: C.textPrimary }}>←</Text>
          </PressableScale>
          <View style={{ flex: 1 }}>
            <Label>DATOS DE SALUD</Label>
            <Text accessibilityRole="header" style={{ fontFamily: F.grotesk, fontSize: 23, color: C.textPrimary, marginTop: 3 }}>{providerName}</Text>
          </View>
        </View>

        {availability == null ? (
          <ActivityIndicator color={accent} />
        ) : !providerId || availability === 'unavailable' ? (
          <View style={card}>
            <Text style={text(13, C.textSecondary)}>
              {Platform.OS === 'android'
                ? 'Health Connect no está disponible en este teléfono. En Android 13 o anterior se instala desde Google Play; desde Android 14 viene incluido.'
                : 'Los datos de salud no están disponibles en este dispositivo.'}
            </Text>
            {Platform.OS === 'android' && (
              <PressableScale onPress={() => healthProvider?.openSettings()} style={button(false)}>
                <Text style={text(10, C.textPrimary, F.monoBold)}>ABRIR HEALTH CONNECT</Text>
              </PressableScale>
            )}
            <Text style={text(12, C.textTertiary)}>Podés seguir registrando peso y sueño a mano en PULSO.</Text>
          </View>
        ) : availability === 'update_required' ? (
          <View style={card}>
            <Text style={text(13, C.textSecondary)}>Health Connect necesita actualizarse antes de conectar.</Text>
            <PressableScale onPress={() => healthProvider?.openSettings()} style={button(false)}>
              <Text style={text(10, C.textPrimary, F.monoBold)}>ACTUALIZAR HEALTH CONNECT</Text>
            </PressableScale>
          </View>
        ) : !connected ? (
          <View style={card}>
            <Text style={text(13, C.textSecondary)}>Elegí qué querés traer. Cada permiso es opcional y lo podés cambiar cuando quieras.</Text>
            {METRICS.map(metric => (
              <View key={metric.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.textPrimary }}>{metric.label}</Text>
                  <Text style={text(12, C.textTertiary)}>{metric.detail}</Text>
                </View>
                <Switch value={selected.includes(metric.key)} onValueChange={() => toggleMetric(metric.key)} trackColor={{ true: accent, false: C.border }} accessibilityLabel={`Leer ${metric.label}`} />
              </View>
            ))}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.textPrimary }}>Guardar mis entrenos</Text>
                <Text style={text(12, C.textTertiary)}>Cada entreno completado, con su hora de inicio y fin. Sin calorías ni distancia inventadas.</Text>
              </View>
              <Switch value={writeWorkouts} onValueChange={setWriteWorkouts} trackColor={{ true: accent, false: C.border }} accessibilityLabel="Guardar entrenos" />
            </View>
            <PressableScale onPress={() => void connect()} disabled={busy || (!selected.length && !writeWorkouts)} haptic="medium" style={button(true)}>
              <Text style={text(11, C.onAccent, F.monoXBold)}>{busy ? 'CONECTANDO…' : `CONECTAR ${providerName.toUpperCase()}`}</Text>
            </PressableScale>
          </View>
        ) : (
          <View style={card}>
            <Text style={text(12, C.textSecondary)}>
              {connection?.lastImportAt
                ? `Última importación: ${connection.lastImportAt.toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                : 'Todavía no se importó nada.'}
              {connection?.lastError ? ' · La última vez no se pudo completar.' : ''}
            </Text>
            {rows.map(row => (
              <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Label>{row.label}</Label>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontFamily: F.monoBold, fontSize: 14, color: row.value ? C.textPrimary : C.textTertiary }}>{row.value ?? 'Sin datos'}</Text>
                  {row.source && <Text style={text(9, C.textTertiary, F.mono)}>{PROVIDER_LABELS[row.source as ProviderId | 'manual']?.toUpperCase() ?? row.source}</Text>}
                </View>
              </View>
            ))}
            <Text style={text(11, C.textTertiary)}>
              {Platform.OS === 'ios'
                ? 'Si un dato aparece sin datos, puede que no lo hayas permitido en Salud: Apple no le dice a PULSO qué permisos diste.'
                : `Importamos hasta ${HISTORY_DAYS} días hacia atrás, lo que Health Connect permite sin permisos extra.`}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PressableScale containerStyle={{ flex: 1 }} onPress={() => void refresh()} disabled={busy} style={button(false)}>
                <Text style={text(10, C.textPrimary, F.monoBold)}>{busy ? 'ACTUALIZANDO…' : 'ACTUALIZAR'}</Text>
              </PressableScale>
              <PressableScale containerStyle={{ flex: 1 }} onPress={() => healthProvider?.openSettings()} style={button(false)}>
                <Text style={text(10, C.textPrimary, F.monoBold)}>PERMISOS</Text>
              </PressableScale>
            </View>
            <PressableScale onPress={disconnect} style={{ minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' }}>
              <Text style={text(10, C.red, F.mono)}>DESCONECTAR</Text>
            </PressableScale>
          </View>
        )}

        {withData.length > 1 && userId && (
          <View style={card}>
            <Label>FUENTE PARA PASOS Y SUEÑO</Label>
            <Text style={text(12, C.textSecondary)}>Tenés datos de más de una fuente. Mostramos una por día y nunca las sumamos.</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {withData.map(provider => (
                <PressableScale
                  key={provider}
                  containerStyle={{ flex: 1 }}
                  onPress={() => void Promise.all([setPreferredSource(userId, 'steps', provider), setPreferredSource(userId, 'sleep', provider)]).then(load)}
                  style={button(false)}
                >
                  <Text style={text(10, C.textPrimary, F.monoBold)}>{PROVIDER_LABELS[provider].toUpperCase()}</Text>
                </PressableScale>
              ))}
            </View>
          </View>
        )}

        <Text style={text(11, C.textTertiary)}>
          Lo que importamos queda en este teléfono. No se comparte con tu coach ni nutricionista (eso se controla en Equipo), no se usa para publicidad y no viaja en los reportes de errores. Tu respaldo personal no lo incluye por ahora.
        </Text>
      </View>
    </ScrollView>
  );
}
