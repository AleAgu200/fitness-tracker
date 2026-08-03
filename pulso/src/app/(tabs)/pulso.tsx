import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedBar, Card, GlowPulse, Label, PressableScale } from '@/components/ui/kit';
import { C, F, withAlpha } from '@/constants/colors';
import { useApp } from '@/context/app-state';
import { usePreferences } from '@/context/preferences';
import { displayWeight } from '@/lib/units';

type PulseTab = 'core' | 'cards' | 'week' | 'team';

const TABS: { key: PulseTab; label: string }[] = [
  { key: 'core', label: 'NÚCLEO' },
  { key: 'cards', label: 'CARTAS' },
  { key: 'week', label: 'SEMANA' },
  { key: 'team', label: 'EQUIPO' },
];

const TEAM_SHARE_KEY = 'pulso_team_progress_sharing';

export default function PulsoScreen() {
  const { state } = useApp();
  const { accent, weightUnit } = usePreferences();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<PulseTab>('core');
  const [shareWithTeam, setShareWithTeam] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(TEAM_SHARE_KEY)
      .then(value => setShareWithTeam(value === 'true'))
      .catch(() => {});
  }, []);

  const totalTargets = state.exercises.reduce((total, exercise) => total + exercise.target, 0);
  const completedSets = Object.values(state.log).reduce((total, sets) => total + sets.length, 0);
  const workoutPct = state.sessionDone ? 100 : totalTargets
    ? Math.min(100, Math.round(completedSets / totalTargets * 100))
    : 0;
  const mealsDone = state.meals.filter(meal =>
    ['cumplido', 'sustituido'].includes(state.mealStatus[meal.id] ?? '')).length;
  const nutritionPct = state.meals.length ? Math.round(mealsDone / state.meals.length * 100) : 0;
  const hydrationPct = Math.min(100, state.water * 10);
  const momentum = Math.round(
    workoutPct * 0.45 +
    nutritionPct * 0.2 +
    hydrationPct * 0.15 +
    Math.min(100, state.racha * 10) * 0.2,
  );
  const coreState = momentum >= 80 ? 'CARGADO'
    : momentum >= 55 ? 'ACTIVO'
      : momentum >= 25 ? 'REACTIVANDO'
        : 'LATENTE';

  const earnedCards = Object.entries(state.earned)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const recentPrs = state.prHistory.slice(0, 6);
  const activeDays = state.weekDays.filter(day => day.done).length;

  async function toggleTeamSharing(enabled: boolean) {
    setShareWithTeam(enabled);
    await SecureStore.setItemAsync(TEAM_SHARE_KEY, String(enabled));
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16 }}>
        <Label style={{ marginBottom: 6 }}>SISTEMA · EVOLUCIÓN</Label>
        <Text style={{ fontFamily: F.grotesk, fontSize: 27, color: C.textPrimary, marginBottom: 14 }}>
          Pulso
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {TABS.map(item => {
              const selected = tab === item.key;
              return (
                <PressableScale
                  key={item.key}
                  onPress={() => setTab(item.key)}
                  style={{
                    paddingHorizontal: 13,
                    paddingVertical: 9,
                    borderWidth: 1,
                    borderColor: selected ? accent : C.border,
                    backgroundColor: selected ? withAlpha(accent, 0.08) : C.card,
                  }}
                >
                  <Text style={{
                    fontFamily: F.monoBold,
                    fontSize: 9,
                    letterSpacing: 0.7,
                    color: selected ? accent : C.textTertiary,
                  }}>
                    {item.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </ScrollView>

        {tab === 'core' && (
          <>
            <GlowPulse
              color={accent}
              active={momentum > 0}
              intensity={0.08}
              period={1400}
              style={{ borderWidth: 1, borderColor: accent, backgroundColor: C.card, padding: 22, marginBottom: 14 }}
            >
              <View style={{ alignItems: 'center' }}>
                <Label style={{ color: accent, marginBottom: 15 }}>NÚCLEO PULSO · {coreState}</Label>
                <View style={{
                  width: 136,
                  height: 136,
                  borderWidth: 2,
                  borderColor: accent,
                  transform: [{ rotate: '45deg' }],
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: withAlpha(accent, 0.04),
                }}>
                  <View style={{ transform: [{ rotate: '-45deg' }], alignItems: 'center' }}>
                    <Text style={{ fontFamily: F.monoXBold, fontSize: 42, color: accent }}>{momentum}</Text>
                    <Label style={{ color: accent }}>MOMENTUM</Label>
                  </View>
                </View>
                <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textSecondary, textAlign: 'center', marginTop: 20 }}>
                  {coreState === 'CARGADO'
                    ? 'Tu sistema está respondiendo con fuerza y consistencia.'
                    : coreState === 'ACTIVO'
                      ? 'Tu pulso está estable. Una acción más fortalece el día.'
                      : 'No necesitás recuperar todo hoy. Reactivá el sistema con algo pequeño.'}
                </Text>
              </View>
            </GlowPulse>
            {[
              { label: 'ENTRENO', value: workoutPct, color: accent },
              { label: 'NUTRICIÓN', value: nutritionPct, color: C.cyan },
              { label: 'HIDRATACIÓN', value: hydrationPct, color: C.orange },
              { label: 'CONTINUIDAD', value: Math.min(100, state.racha * 10), color: C.red },
            ].map(signal => (
              <Card key={signal.label} style={{ padding: 12, marginBottom: 7 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Label>{signal.label}</Label>
                  <Label style={{ color: signal.color }}>{signal.value}%</Label>
                </View>
                <AnimatedBar fill={signal.value / 100} color={signal.color} height={6} />
              </Card>
            ))}
          </>
        )}

        {tab === 'cards' && (
          <>
            <Label style={{ marginBottom: 9 }}>TARJETAS RECIENTES</Label>
            {!recentPrs.length && !earnedCards.length && (
              <Card style={{ padding: 22, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary, textAlign: 'center', lineHeight: 17 }}>
                  COMPLETÁ SESIONES PARA REVELAR TU PRIMERA TARJETA
                </Text>
              </Card>
            )}
            {recentPrs.map((record, index) => (
              <GlowPulse
                key={`${record.exerciseId}-${record.achievedAt.getTime()}`}
                color={index === 0 ? C.red : accent}
                active={index === 0}
                intensity={0.05}
                period={1600}
                style={{
                  borderWidth: 1,
                  borderColor: index === 0 ? C.red : C.border,
                  backgroundColor: C.card,
                  padding: 16,
                  marginBottom: 9,
                }}
              >
                <Label style={{ color: index === 0 ? C.red : accent }}>NUEVO PULSO · FUERZA</Label>
                <Text style={{ fontFamily: F.grotesk, fontSize: 20, color: C.textPrimary, marginTop: 10 }}>
                  {record.nombre}
                </Text>
                <Text style={{ fontFamily: F.monoXBold, fontSize: 27, color: index === 0 ? C.red : accent, marginTop: 5 }}>
                  {displayWeight(record.weightKg, weightUnit)} {weightUnit.toUpperCase()} × {record.reps}
                </Text>
                <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary, marginTop: 9 }}>
                  {record.achievedAt.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase()}
                </Text>
              </GlowPulse>
            ))}
            {earnedCards.map(([key, earnedAt]) => (
              <Card key={key} style={{ padding: 14, marginBottom: 8 }}>
                <Label style={{ color: C.orange }}>CONSISTENCIA · LOGRO</Label>
                <Text style={{ fontFamily: F.monoBold, fontSize: 15, color: C.textPrimary, marginTop: 8 }}>
                  {key.replaceAll('_', ' ').toUpperCase()}
                </Text>
                <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary, marginTop: 5 }}>
                  {new Date(earnedAt).toLocaleDateString('es-AR')}
                </Text>
              </Card>
            ))}
          </>
        )}

        {tab === 'week' && (
          <>
            <Card style={{ padding: 16, marginBottom: 12 }}>
              <Label style={{ color: accent, marginBottom: 8 }}>TU SEMANA EN PULSO</Label>
              <Text style={{ fontFamily: F.monoXBold, fontSize: 46, color: accent }}>{activeDays}/7</Text>
              <Text style={{ fontFamily: F.inter, fontSize: 12, color: C.textSecondary, marginTop: 5 }}>
                días con una acción registrada
              </Text>
              <View style={{ flexDirection: 'row', gap: 5, marginTop: 16 }}>
                {state.weekDays.map((day, index) => (
                  <View key={index} style={{
                    flex: 1,
                    height: 40,
                    borderWidth: 1,
                    borderColor: day.isToday ? accent : C.border,
                    backgroundColor: day.done ? accent : C.bgEl,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Text style={{ fontFamily: F.monoBold, fontSize: 9, color: day.done ? C.bg : C.textTertiary }}>
                      {day.label}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
            {[
              { label: 'SESIONES TOTALES', value: state.sessionsCount, color: accent },
              { label: 'RACHA ACTIVA', value: `${state.racha} DÍAS`, color: C.orange },
              { label: 'SETS DE HOY', value: completedSets, color: C.cyan },
              { label: 'PR REGISTRADOS', value: state.prHistory.length, color: C.red },
            ].map(metric => (
              <Card key={metric.label} style={{ padding: 14, marginBottom: 7, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Label>{metric.label}</Label>
                <Text style={{ fontFamily: F.monoXBold, fontSize: 18, color: metric.color }}>{metric.value}</Text>
              </Card>
            ))}
          </>
        )}

        {tab === 'team' && (
          <>
            <Card style={{ padding: 14, marginBottom: 12 }}>
              <Label style={{ color: C.cyan, marginBottom: 9 }}>MODO EQUIPO · PRIVADO</Label>
              <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textSecondary }}>
                Prepara tus señales de progreso para compartirlas con profesionales vinculados. No crea rankings ni compara atletas.
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: C.border, marginTop: 13, paddingTop: 13 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }}>Compartir resumen de progreso</Text>
                  <Text style={{ fontFamily: F.inter, fontSize: 10, color: C.textTertiary, marginTop: 3 }}>
                    Preferencia local; la sincronización con el portal se habilitará en la fase de equipo.
                  </Text>
                </View>
                <Switch
                  value={shareWithTeam}
                  onValueChange={toggleTeamSharing}
                  trackColor={{ false: C.border, true: 'rgba(61,220,255,0.42)' }}
                  thumbColor={shareWithTeam ? C.cyan : C.textSecondary}
                />
              </View>
            </Card>
            <Card style={{ padding: 14, marginBottom: 12 }}>
              <Label style={{ marginBottom: 10 }}>PROFESIONALES VINCULADOS</Label>
              <Text style={{ fontFamily: F.inter, fontSize: 13, color: state.assignedWorkoutBy ? C.textPrimary : C.textTertiary }}>
                ◆ Entrenador · {state.assignedWorkoutBy ?? 'sin plan asignado'}
              </Text>
              <Text style={{ fontFamily: F.inter, fontSize: 13, color: state.assignedMealsBy ? C.textPrimary : C.textTertiary, marginTop: 9 }}>
                ✚ Nutrición · {state.assignedMealsBy ?? 'sin plan asignado'}
              </Text>
              <PressableScale
                onPress={() => router.push('/mensajes')}
                style={{ backgroundColor: C.cyan, padding: 11, alignItems: 'center', marginTop: 14 }}
              >
                <Text style={{ fontFamily: F.monoXBold, fontSize: 10, color: C.bg }}>ABRIR MENSAJES →</Text>
              </PressableScale>
            </Card>
          </>
        )}
      </View>
    </ScrollView>
  );
}
