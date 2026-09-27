import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Label, PressableScale } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import { useApp } from '@/context/app-state';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import { listPrograms, ProgramOrigin, ProgramSummary } from '@/db/plan';
import { mondayOf, WEEKDAY_DISPLAY_ORDER, WEEKDAY_LABELS, WEEKDAY_SHORT_LABELS, weekdayOf } from '@/lib/dates';
import { sessionTime } from '@/lib/pulse-engine';

function originLabel(origin: ProgramOrigin, coachName: string | null): string {
  if (origin === 'coach') return coachName ? `COACH · ${coachName.toUpperCase()}` : 'DE TU COACH';
  if (origin === 'ai') return 'PULSO IA';
  return 'PROPIO';
}

function trainingDays(program: ProgramSummary): number {
  return Object.values(program.dayCounts).filter(count => count > 0).length;
}

function weekNumber(startDate: string): number {
  const start = new Date(`${startDate}T00:00:00`);
  return Math.max(1, Math.floor((mondayOf(new Date()).getTime() - mondayOf(start).getTime()) / (7 * 86_400_000)) + 1);
}

/**
 * The athlete chooses how to train without losing a professional plan: every
 * plan stays here, one is active, and switching is an explicit inline choice.
 */
export default function MisPlanesScreen() {
  const { state, activatePlan } = useApp();
  const { userId } = useSession();
  const { accent } = usePreferences();
  const C = useColors();
  const insets = useSafeAreaInsets();
  const [programs, setPrograms] = useState<ProgramSummary[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(() => {
    if (!userId) return;
    listPrograms(userId).then(setPrograms).catch(e => console.error('[plans]', e));
  }, [userId]);
  useFocusEffect(load);

  const loggedToday = Object.values(state.log).some(sets => sets.length > 0);
  const locked = loggedToday && !state.sessionDone;
  const todayWeekday = weekdayOf(new Date());
  const weekStart = mondayOf(new Date()).getTime();
  const trainedThisWeek = new Set(state.trainingSessions
    .filter(session => session.status === 'completed' && sessionTime(session) >= weekStart)
    .map(session => weekdayOf(new Date(sessionTime(session)))));

  /** "HOY" or the weekday of the first session the plan would bring. */
  function nextSession(program: ProgramSummary): { label: string; count: number } | null {
    for (let offset = 0; offset < 7; offset++) {
      if (offset === 0 && (state.sessionDone || state.freeSession)) continue;
      const weekday = ((todayWeekday - 1 + offset) % 7) + 1;
      const count = program.dayCounts[weekday] ?? 0;
      if (count > 0) return { label: offset === 0 ? 'hoy' : WEEKDAY_LABELS[weekday].toLowerCase(), count };
    }
    return null;
  }

  async function confirm(program: ProgramSummary) {
    setSwitching(true);
    try {
      await activatePlan(program.id);
      setConfirming(null);
      load();
    } catch (e) {
      console.error('[plan-activate]', e);
    } finally {
      setSwitching(false);
    }
  }

  const active = programs?.find(program => program.active) ?? null;
  const others = programs?.filter(program => !program.active) ?? [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <PressableScale
          onPress={() => router.back()}
          accessibilityLabel="Volver"
          style={{ width: 44, height: 44, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontFamily: F.mono, fontSize: 15, color: C.textPrimary }}>←</Text>
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Label>ENTRENO</Label>
          <Text accessibilityRole="header" style={{ fontFamily: F.grotesk, fontSize: 23, color: C.textPrimary, marginTop: 2 }}>Mis planes</Text>
        </View>
      </View>

      {!programs && <ActivityIndicator color={C.textTertiary} style={{ marginTop: 40 }} accessibilityLabel="Cargando planes" />}

      {active && (
        <Animated.View entering={FadeIn.duration(200)} style={{ borderWidth: 1, borderColor: accent, backgroundColor: C.card, padding: 14, gap: 8, marginBottom: 22 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <View style={{ borderWidth: 1, borderColor: accent, backgroundColor: withAlpha(accent, 0.1), paddingHorizontal: 7, paddingVertical: 3 }}>
              <Text style={{ fontFamily: F.monoBold, fontSize: 9, letterSpacing: 1, color: C.textPrimary }}>ACTIVO</Text>
            </View>
            <Label>{originLabel(active.origin, state.assignedWorkoutBy)}</Label>
          </View>
          <Text style={{ fontFamily: F.grotesk, fontSize: 24, color: C.textPrimary }}>{active.name}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textSecondary }}>
            {`SEMANA ${weekNumber(active.startDate)} · ${trainingDays(active)} DÍA${trainingDays(active) === 1 ? '' : 'S'} CON EJERCICIOS`}
          </Text>
          <View
            accessible
            accessibilityLabel={`Esta semana: ${WEEKDAY_DISPLAY_ORDER.filter(day => trainedThisWeek.has(day)).length} sesiones hechas.`}
            style={{ flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.border, paddingVertical: 10, marginTop: 4 }}
          >
            {WEEKDAY_DISPLAY_ORDER.map(day => {
              const planned = (active.dayCounts[day] ?? 0) > 0;
              const done = trainedThisWeek.has(day);
              const isToday = day === todayWeekday;
              return (
                <View key={day} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
                  <Text style={{ fontFamily: F.monoBold, fontSize: 12, color: done ? C.textPrimary : isToday ? accent : planned ? C.textSecondary : C.textTertiary }}>
                    {done ? '✓' : planned ? active.dayCounts[day] : '—'}
                  </Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 9, color: isToday ? accent : C.textTertiary }}>{WEEKDAY_SHORT_LABELS[day]}</Text>
                </View>
              );
            })}
          </View>
          <PressableScale
            onPress={() => router.dismissTo('/entreno')}
            haptic="medium"
            style={{ minHeight: 46, justifyContent: 'center', alignItems: 'center', backgroundColor: accent, marginTop: 4 }}
          >
            <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, color: C.onAccent }}>ABRIR ENTRENAMIENTO</Text>
          </PressableScale>
        </Animated.View>
      )}

      {others.length > 0 && (
        <>
          <Label style={{ marginBottom: 6 }}>OTROS PLANES</Label>
          {others.map(program => {
            const next = nextSession(program);
            const open = confirming === program.id;
            return (
              <View key={program.id} style={{ borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.textPrimary }}>{program.name}</Text>
                    <Label>{`${originLabel(program.origin, state.assignedWorkoutBy)} · ${trainingDays(program)} DÍA${trainingDays(program) === 1 ? '' : 'S'}`}</Label>
                  </View>
                  {!open && (
                    <PressableScale
                      onPress={() => setConfirming(program.id)}
                      disabled={locked}
                      accessibilityHint="Muestra qué cambia antes de confirmar"
                      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1, borderColor: C.border }}
                    >
                      <Text style={{ fontFamily: F.monoBold, fontSize: 10, color: C.textPrimary }}>ACTIVAR</Text>
                    </PressableScale>
                  )}
                </View>
                {open && (
                  <Animated.View entering={FadeIn.duration(160)} style={{ marginTop: 10, padding: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, gap: 10 }}>
                    <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textSecondary }}>
                      {next
                        ? `Tu próxima sesión (${next.label}) pasa a tener ${next.count} ejercicio${next.count === 1 ? '' : 's'} de “${program.name}”.`
                        : `“${program.name}” todavía no tiene ejercicios: Entreno va a quedar vacío hasta que agregues alguno.`}
                      {active ? ` “${active.name}” queda guardado acá y podés volver cuando quieras.` : ''}
                      {state.freeSession ? ' Hoy seguís con tu sesión libre.' : ''}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <PressableScale
                        onPress={() => void confirm(program)}
                        disabled={switching}
                        haptic="success"
                        containerStyle={{ flex: 1 }}
                        style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.textSecondary }}
                      >
                        <Text style={{ fontFamily: F.monoBold, fontSize: 10, color: C.textPrimary }}>{switching ? 'CAMBIANDO…' : 'CAMBIAR DE PLAN'}</Text>
                      </PressableScale>
                      <PressableScale
                        onPress={() => setConfirming(null)}
                        containerStyle={{ flex: 1 }}
                        style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border }}
                      >
                        <Text style={{ fontFamily: F.monoBold, fontSize: 10, color: C.textSecondary }}>CANCELAR</Text>
                      </PressableScale>
                    </View>
                  </Animated.View>
                )}
              </View>
            );
          })}
          {locked && (
            <Text style={{ fontFamily: F.inter, fontSize: 11, lineHeight: 16, color: C.orange, marginTop: 4 }}>
              Tenés una sesión en curso. Terminala en Entreno para cambiar de plan.
            </Text>
          )}
        </>
      )}

      {programs && (
        <View style={{ borderWidth: 1, borderColor: C.border, padding: 12, marginTop: 22, gap: 4 }}>
          <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }}>Tu elección, tus datos</Text>
          <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textSecondary }}>
            Cambiar de plan no borra ninguno. Si tu coach actualiza su plan, lo vas a encontrar acá con los cambios. Si compartís tu entrenamiento, tu coach solo ve si su plan es el activo, nunca el contenido de tus otros planes.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
