import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExerciseAnimationModal } from '@/components/exercise-animation-modal';
import { ExercisePlanForm, ExercisePlanValues, ExistingPlanExercise } from '@/components/exercise-plan-form';
import { AnimatedBar, Card, GlowPulse, Label, PressableScale } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import { useApp } from '@/context/app-state';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import {
  addPlanExercise,
  deletePlanExercise,
  getPlan,
  getWeekSummary,
  PlanExercise,
  updatePlanExercise,
} from '@/db/plan';
import { WEEKDAY_DISPLAY_ORDER, WEEKDAY_LABELS, WEEKDAY_SHORT_LABELS, weekdayOf } from '@/lib/dates';
import {
  cancelRestTimerNotification,
  completeRestTimerNotification,
  loadRestTimerOverlayPreference,
  showRestTimerNotification,
} from '@/lib/notifications';
import { displayWeight, formatWeight } from '@/lib/units';
import { syncWorkoutWidgets } from '@/lib/widget-bridge';

const RPE_VALUES = [6, 7, 8, 9, 10];

function Stepper({ label, value, onInc, onDec }: { label: string; value: string | number; onInc: () => void; onDec: () => void }) {
  const C = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: C.card, padding: 12 }}>
      <Label style={{ textAlign: 'center', marginBottom: 9 }}>{label}</Label>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <PressableScale onPress={onDec} style={{ width: 30, height: 30, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: F.mono, fontSize: 18, color: C.textPrimary }}>−</Text>
        </PressableScale>
        <Text style={{ fontFamily: F.monoXBold, fontSize: 22, color: C.textPrimary, width: 54, textAlign: 'center', fontVariant: ['tabular-nums'] as any }}>
          {value}
        </Text>
        <PressableScale onPress={onInc} style={{ width: 30, height: 30, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: F.mono, fontSize: 18, color: C.textPrimary }}>+</Text>
        </PressableScale>
      </View>
    </View>
  );
}

/**
 * Add/edit/delete editor for a single day's plan, entirely self-contained (own
 * DB reads/writes) — deliberately does NOT touch the shared AppState, since
 * that state is "today's plan" everywhere else in the app (Hoy, Pulso). Browsing
 * or editing another day here must never leak into those dashboards. Uses the
 * same WorkoutX search + muscle map as today's flow (via ExercisePlanForm).
 */
function OtherDayPlanEditor({ weekday, onChanged }: { weekday: number; onChanged: () => void }) {
  const { userId } = useSession();
  const { state } = useApp(); // read-only: profile sex for the map's default body
  const { accent, weightUnit } = usePreferences();
  const C = useColors();
  const [loading, setLoading] = useState(true);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [exercises, setExercises] = useState<PlanExercise[]>([]);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [viewingAnimation, setViewingAnimation] = useState<{ nombre: string; wxId: string | null; gifPath: string | null } | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const plan = await getPlan(userId, weekday);
      setTemplateId(plan.templateId);
      setExercises(plan.exercises);
    } catch (e) {
      console.error('[other-day-plan]', e);
    } finally {
      setLoading(false);
    }
  }, [userId, weekday]);

  useEffect(() => {
    setEditingSlotId(null);
    setAdding(false);
    load();
  }, [load]);

  function cancel() {
    setAdding(false);
    setEditingSlotId(null);
  }

  async function save(values: ExercisePlanValues) {
    if (!userId || !values.nombre.trim()) { cancel(); return; }
    const data = { ...values, nombre: values.nombre.trim() };
    try {
      if (editingSlotId) {
        await updatePlanExercise(userId, editingSlotId, data);
      } else if (templateId) {
        await addPlanExercise(userId, templateId, data);
      }
      cancel();
      await load();
      onChanged();
    } catch (e) {
      console.error('[other-day-plan-save]', e);
    }
  }

  async function remove() {
    if (!editingSlotId) return;
    try {
      await deletePlanExercise(editingSlotId);
      cancel();
      await load();
      onChanged();
    } catch (e) {
      console.error('[other-day-plan-delete]', e);
    }
  }

  async function addFromMap(exercise: { name: string; sets: number; reps: number; weight: number; step: number; gifPath?: string | null }) {
    if (!userId || !templateId) return;
    if (exercises.some(item => item.nombre.trim().toLocaleLowerCase('es') === exercise.name.trim().toLocaleLowerCase('es'))) return;
    await addPlanExercise(userId, templateId, {
      nombre: exercise.name, target: exercise.sets, reps: exercise.reps, peso: exercise.weight, step: exercise.step,
      gifPath: exercise.gifPath,
    });
    await load();
    onChanged();
  }

  const editingExercise = editingSlotId ? exercises.find(e => e.slotId === editingSlotId) ?? null : null;
  const formOpen = adding || editingExercise != null;
  const existingExercises: ExistingPlanExercise[] = exercises.map(e => ({
    id: e.slotId, nombre: e.nombre, muscleGroup: e.muscleGroup, target: e.target,
  }));

  if (loading) {
    return (
      <View style={{ padding: 30, alignItems: 'center' }}>
        <ActivityIndicator color={C.textTertiary} />
      </View>
    );
  }

  return (
    <>
      {formOpen && (
        <ExercisePlanForm
          key={editingExercise ? `edit-${editingExercise.slotId}` : 'add'}
          editing={editingExercise != null}
          initial={editingExercise
            ? { nombre: editingExercise.nombre, target: editingExercise.target, reps: editingExercise.reps, peso: editingExercise.peso, step: editingExercise.step, wxId: editingExercise.wxId, gifPath: editingExercise.gifPath }
            : { nombre: '', target: 3, reps: 8, peso: 0, step: 2.5, wxId: null, gifPath: null }}
          weightUnit={weightUnit}
          accent={accent}
          existingExercises={existingExercises}
          profileSex={state.profileData?.sex}
          onCancel={cancel}
          onSave={save}
          onDelete={editingExercise ? remove : undefined}
          onAddFromMap={addFromMap}
        />
      )}

      {!exercises.length && !formOpen && (
        <Card index={0} style={{ padding: 22, marginBottom: 12, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.8, color: C.textTertiary, textTransform: 'uppercase', marginBottom: 10 }}>
            SIN EJERCICIOS PARA {WEEKDAY_LABELS[weekday]}
          </Text>
          <Text style={{ fontFamily: F.inter, fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 16 }}>
            No hay ejercicios registrados para este día
          </Text>
          <PressableScale
            onPress={() => { setAdding(true); setEditingSlotId(null); }}
            style={{ borderWidth: 1, borderColor: accent, paddingVertical: 12, paddingHorizontal: 22, alignItems: 'center', alignSelf: 'stretch' }}
          >
            <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, color: accent, textTransform: 'uppercase' }}>
              + AGREGAR EJERCICIO
            </Text>
          </PressableScale>
        </Card>
      )}

      {exercises.length > 0 && (
        <>
          <Label style={{ marginBottom: 9 }}>{`EJERCICIOS DE ${WEEKDAY_LABELS[weekday]}`}</Label>
          {exercises.map(ex => (
            <PressableScale
              key={ex.slotId}
              onPress={() => { setEditingSlotId(ex.slotId); setAdding(false); }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
                padding: 12, paddingHorizontal: 14, marginBottom: 7,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.textPrimary }}>{ex.nombre}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary, marginTop: 2 }}>
                  {ex.target}×{ex.reps} · {formatWeight(ex.peso, weightUnit)}
                </Text>
              </View>
              {(ex.gifPath || ex.wxId) && (
                <PressableScale
                  haptic="light"
                  onPress={() => setViewingAnimation({ nombre: ex.nombre, wxId: ex.wxId, gifPath: ex.gifPath })}
                  accessibilityLabel={`Ver animación de ${ex.nombre}`}
                  style={{ paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl }}
                >
                  <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textSecondary }}>▶</Text>
                </PressableScale>
              )}
              <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textSecondary, textTransform: 'uppercase' }}>✎ EDITAR</Text>
            </PressableScale>
          ))}
          {!formOpen && (
            <PressableScale
              onPress={() => { setAdding(true); setEditingSlotId(null); }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#3a3a40', borderStyle: 'dashed', backgroundColor: C.bgEl, padding: 14, marginTop: 3 }}
            >
              <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, color: C.textSecondary, textTransform: 'uppercase' }}>
                + AGREGAR EJERCICIO
              </Text>
            </PressableScale>
          )}
        </>
      )}

      {viewingAnimation && (
        <ExerciseAnimationModal
          nombre={viewingAnimation.nombre}
          wxId={viewingAnimation.wxId}
          gifPath={viewingAnimation.gifPath}
          onClose={() => setViewingAnimation(null)}
        />
      )}
    </>
  );
}

export default function EntrenoScreen() {
  const {
    state, selectEx, incPeso, decPeso, incReps, decReps, setRpe, guardarSet,
    finishWorkout,
    startEditEx, startAddEx, cancelExForm, saveEditEx, saveAddEx, deleteEx,
    addRest, skipRest, dismissPrFlash, addRecommendedExercise,
  } = useApp();
  const { accent, weightUnit } = usePreferences();
  const { userId } = useSession();
  const C = useColors();
  const insets = useSafeAreaInsets();
  const { exercises, exIndex, log, curPeso, curReps, curRpe, restActive, restLeft, restTotal, prFlash, prMap, editingEx, addingEx, sessionDone, assignedWorkoutBy } = state;
  const isAssigned = assignedWorkoutBy != null;
  const todayWeekday = weekdayOf(new Date());
  // Day tabs are local to this screen: only today's plan feeds the shared
  // AppState (used by Hoy/Pulso), so browsing another day here can't leak into
  // those dashboards. See OtherDayPlanEditor below for the non-today branch.
  const [selectedWeekday, setSelectedWeekday] = useState(todayWeekday);
  const [weekPlanCounts, setWeekPlanCounts] = useState<Record<number, number>>({});
  const [viewingAnimation, setViewingAnimation] = useState<{ nombre: string; wxId: string | null; gifPath: string | null } | null>(null);
  const isToday = selectedWeekday === todayWeekday;

  // Widget "✓ LISTO" / "■ FIN" buttons deep-link here (pulso://entreno?action=...) instead
  // of mutating anything natively — the widget can't touch the app's database, so it just
  // opens the app and this effect performs the action the instant the plan has loaded.
  const params = useLocalSearchParams<{ action?: string; slotId?: string }>();
  const handledAction = useRef(false);
  useEffect(() => {
    if (handledAction.current || !state.ready || !params.action) return;
    handledAction.current = true;
    if (params.action === 'done' && params.slotId) {
      guardarSet({ slotId: params.slotId });
    } else if (params.action === 'finish') {
      finishWorkout();
    }
    router.setParams({ action: undefined, slotId: undefined });
  }, [state.ready, params.action, params.slotId, guardarSet, finishWorkout]);
  useEffect(() => {
    if (!params.action) handledAction.current = false;
  }, [params.action]);

  const refreshWeekPlanCounts = useCallback(() => {
    if (!userId) return;
    getWeekSummary(userId)
      .then(summary => setWeekPlanCounts(Object.fromEntries(summary.map(s => [s.weekday, s.exerciseCount]))))
      .catch(e => console.error('[week-summary]', e));
  }, [userId]);

  useEffect(() => { refreshWeekPlanCounts(); }, [refreshWeekPlanCounts]);
  const activeEx = exercises[exIndex];
  const previousSession = activeEx ? state.previousSessions[activeEx.exerciseId] : null;
  const previousRestActive = useRef(false);
  const previousRestTotal = useRef(restTotal);

  useEffect(() => {
    const wasActive = previousRestActive.current;
    const durationChanged = previousRestTotal.current !== restTotal;

    if (restActive && (!wasActive || durationChanged)) {
      loadRestTimerOverlayPreference()
        .then(enabled => enabled
          ? showRestTimerNotification(restLeft, activeEx?.nombre)
          : false)
        .catch(() => {});
    } else if (wasActive && !restActive) {
      const cleanup = restLeft === 0
        ? completeRestTimerNotification()
        : cancelRestTimerNotification();
      cleanup.catch(() => {});
    }

    previousRestActive.current = restActive;
    previousRestTotal.current = restTotal;
  }, [activeEx?.nombre, restActive, restLeft, restTotal]);

  const totalSets = Object.values(log).reduce((a, sets) => a + sets.length, 0);

  useEffect(() => {
    // "Started" (vs the widget's "begin your training" CTA) means at least one set has
    // been logged today — a plan existing isn't enough, so the CTA still shows up until
    // the athlete actually taps in.
    const started = totalSets > 0;
    syncWorkoutWidgets({
      workoutActive: started && activeEx != null,
      sessionDone,
      currentExercise: activeEx?.nombre ?? null,
      currentSlotId: activeEx?.id ?? null,
      nextExercise: exercises[exIndex + 1]?.nombre ?? null,
      weight: activeEx ? curPeso : null,
      reps: activeEx ? curReps : null,
      weightUnit,
      restActive,
      restLeft,
      restEndAt: restActive ? Date.now() + restLeft * 1000 : null,
      restTotal,
      accent,
    });
  }, [activeEx, exercises, exIndex, curPeso, curReps, weightUnit, restActive, restLeft, restTotal, accent, sessionDone, totalSets]);

  useEffect(() => () => {
    if (!restActive) cancelRestTimerNotification().catch(() => {});
  }, [restActive]);

  const doneSets = (log[activeEx?.id] || []).length;
  const totalTonelaje = exercises.reduce((a, e) => {
    const sets = log[e.id] || [];
    return a + sets.reduce((b, s) => b + s.peso * s.reps, 0);
  }, 0);

  const restMins = Math.floor(restLeft / 60);
  const restSecs = restLeft % 60;
  const restMMSS = `${restMins}:${restSecs.toString().padStart(2, '0')}`;

  const hasPlan = exercises.length > 0;
  const currentE1rm = curPeso * (1 + curReps / 30);
  const previousBeat = previousSession
    ? currentE1rm > previousSession.bestE1rm
      ? 'SUPERÁS TU PULSO ANTERIOR'
      : Math.abs(currentE1rm - previousSession.bestE1rm) < 0.05 && curRpe < previousSession.bestSet.rpe
        ? 'MISMO RENDIMIENTO · MENOR ESFUERZO'
        : currentE1rm >= previousSession.bestE1rm * 0.97
          ? 'ESTÁS A UN PULSO DE IGUALARLO'
          : 'HOY PODÉS CONSOLIDAR'
    : null;

  return (
    <>
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16 }}>

        {/* PR FLASH — pulsing red light */}
        {prFlash && (
          <Animated.View entering={FadeInDown.duration(260).easing(Easing.out(Easing.cubic))} exiting={FadeOutUp.duration(250)}>
            <GlowPulse color={C.red} intensity={0.22} period={650} style={{ marginBottom: 14 }}>
              <PressableScale onPress={dismissPrFlash} haptic="none" style={{ borderWidth: 1, borderColor: C.red, backgroundColor: 'rgba(255,61,90,0.1)', padding: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 22, color: C.red }}>⚡</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.monoXBold, fontSize: 13, letterSpacing: 1.4, color: C.red, textTransform: 'uppercase' }}>¡NUEVO RÉCORD!</Text>
                    <Text style={{ fontFamily: F.interSemi, fontSize: 15, color: C.textPrimary, marginTop: 3 }}>
                      {prFlash.ej} — {prFlash.val}
                    </Text>
                  </View>
                </View>
              </PressableScale>
            </GlowPulse>
          </Animated.View>
        )}

        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <View>
            <Label style={{ marginBottom: 6 }}>
              {isAssigned ? `PLAN DE ${assignedWorkoutBy?.toUpperCase()}` : `${WEEKDAY_LABELS[selectedWeekday]}${isToday ? ' · HOY' : ''}`}
            </Label>
            <Text style={{ fontFamily: F.grotesk, fontSize: 27, color: C.textPrimary }}>Entreno</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontFamily: F.monoXBold, fontSize: 20, color: accent, fontVariant: ['tabular-nums'] as any }}>
              {displayWeight(totalTonelaje, weightUnit).toLocaleString()}
            </Text>
            <Label style={{ marginTop: 4 }}>TONELAJE {weightUnit}</Label>
          </View>
        </View>

        {/* DAY TABS — one plan per day of the week */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
          {WEEKDAY_DISPLAY_ORDER.map(day => {
            const selected = selectedWeekday === day;
            const dayIsToday = day === todayWeekday;
            const hasExercises = (weekPlanCounts[day] ?? 0) > 0;
            return (
              <PressableScale
                key={day}
                onPress={() => setSelectedWeekday(day)}
                haptic="light"
                style={{
                  width: 40, height: 44, borderWidth: 1, gap: 4,
                  borderColor: selected ? accent : dayIsToday ? C.textSecondary : C.border,
                  backgroundColor: selected ? withAlpha(accent, 0.12) : C.card,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ fontFamily: F.monoBold, fontSize: 12, color: selected ? accent : dayIsToday ? C.textPrimary : C.textTertiary }}>
                  {WEEKDAY_SHORT_LABELS[day]}
                </Text>
                <View style={{
                  width: 4, height: 4, borderRadius: 2,
                  backgroundColor: hasExercises ? (selected ? accent : C.textTertiary) : 'transparent',
                }} />
              </PressableScale>
            );
          })}
        </View>

        {isToday ? (
        <>
        {/* ASSIGNED PLAN BANNER */}
        {isAssigned && (
          <Animated.View entering={FadeInDown.duration(280)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: C.cyan, backgroundColor: 'rgba(61,220,255,0.06)', padding: 12, marginBottom: 12 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.cyan }}>◆</Text>
            <Text style={{ flex: 1, fontFamily: F.inter, fontSize: 12, color: C.textSecondary, lineHeight: 17 }}>
              Plan asignado por <Text style={{ color: C.cyan, fontFamily: F.interSemi }}>{assignedWorkoutBy}</Text>. Podés ajustarlo; desde el portal solo tu entrenador puede cambiar el entrenamiento.
            </Text>
          </Animated.View>
        )}

        {/* SESSION COMPLETE BANNER */}
        {sessionDone && (
          <Animated.View entering={FadeInDown.duration(300)} style={{ borderWidth: 1, borderColor: accent, backgroundColor: withAlpha(accent, 0.07), padding: 14, marginBottom: 12, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.monoXBold, fontSize: 12, letterSpacing: 1.2, color: accent, textTransform: 'uppercase' }}>
              ✓ SESIÓN COMPLETADA
            </Text>
            <Text style={{ fontFamily: F.inter, fontSize: 12, color: C.textSecondary, marginTop: 6 }}>
              Podés seguir registrando sets si querés
            </Text>
          </Animated.View>
        )}

        {/* REST TIMER — breathing cyan light while resting */}
        {restActive && (
          <Animated.View
            entering={FadeInDown.duration(300).easing(Easing.out(Easing.cubic))}
            exiting={FadeOutUp.duration(200)}
            style={{ marginBottom: 12 }}
          >
          <GlowPulse color={C.cyan} intensity={0.08} period={1100} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.cyan, padding: 13 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.6, color: C.cyan, textTransform: 'uppercase' }}>DESCANSO</Text>
              <Text style={{ fontFamily: F.monoXBold, fontSize: 24, color: C.cyan, fontVariant: ['tabular-nums'] as any }}>{restMMSS}</Text>
            </View>
            <View style={{ marginBottom: 11 }}>
              <AnimatedBar fill={restTotal > 0 ? restLeft / restTotal : 0} color={C.cyan} height={6} duration={950} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PressableScale onPress={addRest} style={{ flex: 1, padding: 9, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.6, color: C.textPrimary, textTransform: 'uppercase' }}>+30 S</Text>
              </PressableScale>
              <PressableScale onPress={skipRest} style={{ flex: 1, padding: 9, borderWidth: 1, borderColor: C.cyan, backgroundColor: 'rgba(61,220,255,0.06)', alignItems: 'center' }}>
                <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 0.6, color: C.cyan, textTransform: 'uppercase' }}>SALTAR</Text>
              </PressableScale>
            </View>
          </GlowPulse>
          </Animated.View>
        )}

        {/* EMPTY PLAN */}
        {!hasPlan && !addingEx && (
          <Card index={0} style={{ padding: 22, marginBottom: 12, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.8, color: C.textTertiary, textTransform: 'uppercase', marginBottom: 10 }}>
              SIN EJERCICIOS HOY
            </Text>
            <Text style={{ fontFamily: F.inter, fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 16 }}>
              No hay ejercicios registrados para este día
            </Text>
            <PressableScale
              onPress={startAddEx}
              style={{ borderWidth: 1, borderColor: accent, paddingVertical: 12, paddingHorizontal: 22, alignItems: 'center', alignSelf: 'stretch' }}
            >
              <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, color: accent, textTransform: 'uppercase' }}>
                + AGREGAR EJERCICIO
              </Text>
            </PressableScale>
          </Card>
        )}

        {/* ACTIVE EXERCISE LOGGER */}
        {activeEx && (
          <Card index={0} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 13, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontFamily: F.grotesk, fontSize: 18, color: C.textPrimary }}>{activeEx.nombre}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary, marginTop: 4 }}>
                  {activeEx.sub} · PR {formatWeight(prMap[activeEx.id] || activeEx.basePR, weightUnit)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                {(activeEx.gifPath || activeEx.wxId) && (
                  <PressableScale
                    haptic="light"
                    onPress={() => setViewingAnimation({ nombre: activeEx.nombre, wxId: activeEx.wxId, gifPath: activeEx.gifPath })}
                    accessibilityLabel={`Ver animación de ${activeEx.nombre}`}
                    style={{ paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl }}
                  >
                    <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textSecondary }}>▶</Text>
                  </PressableScale>
                )}
                <PressableScale onPress={startEditEx} style={{ paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.4, color: C.textSecondary, textTransform: 'uppercase' }}>✎ EDITAR</Text>
                </PressableScale>
                <Text style={{ fontFamily: F.mono, fontSize: 11, color: accent }}>{doneSets}/{activeEx.target}</Text>
              </View>
            </View>

            {/* PREVIOUS PULSE */}
            {previousSession ? (
              <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.bgEl }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                  <Label style={{ color: C.cyan }}>◉ PULSO ANTERIOR</Label>
                  <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary }}>
                    {previousSession.completedAt.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  <Text style={{ fontFamily: F.monoXBold, fontSize: 22, color: C.textPrimary }}>
                    {displayWeight(previousSession.bestSet.peso, weightUnit)} {weightUnit.toUpperCase()} × {previousSession.bestSet.reps}
                  </Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary }}>
                    RPE {previousSession.bestSet.rpe}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 5, marginTop: 9 }}>
                  {previousSession.sets.map((set, index) => (
                    <View
                      key={`${set.peso}-${set.reps}-${index}`}
                      style={{ flex: 1, borderWidth: 1, borderColor: C.border, paddingVertical: 6, alignItems: 'center' }}
                    >
                      <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.textSecondary }}>
                        {displayWeight(set.peso, weightUnit)}×{set.reps}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={{
                  fontFamily: F.monoBold,
                  fontSize: 9,
                  letterSpacing: 0.6,
                  color: currentE1rm > previousSession.bestE1rm ? accent : C.cyan,
                  marginTop: 10,
                }}>
                  {previousBeat}
                </Text>
              </View>
            ) : (
              <View style={{ padding: 11, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.bgEl }}>
                <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary }}>
                  ◉ PRIMER PULSO · ESTA SESIÓN CREARÁ TU REFERENCIA
                </Text>
              </View>
            )}

            {/* STEPPERS */}
            <View style={{ flexDirection: 'row', gap: 1, backgroundColor: C.border }}>
              <Stepper label={`PESO ${weightUnit}`} value={displayWeight(curPeso, weightUnit)} onInc={incPeso} onDec={decPeso} />
              <Stepper label="REPS" value={curReps} onInc={incReps} onDec={decReps} />
            </View>

            {/* RPE */}
            <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: C.border }}>
              <Label style={{ marginBottom: 9 }}>RPE · ESFUERZO PERCIBIDO</Label>
              <View style={{ flexDirection: 'row', gap: 5 }}>
                {RPE_VALUES.map(v => {
                  const sel = curRpe === v;
                  const rpeColor = v >= 9 ? C.red : v === 8 ? C.orange : accent;
                  return (
                    <PressableScale
                      key={v}
                      onPress={() => setRpe(v)}
                      style={{
                        flex: 1, padding: 9, borderWidth: 1,
                        borderColor: sel ? rpeColor : C.border,
                        backgroundColor: sel ? `${rpeColor}22` : C.card,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontFamily: F.monoBold, fontSize: 12, color: sel ? rpeColor : C.textSecondary }}>{v}</Text>
                    </PressableScale>
                  );
                })}
              </View>
            </View>

            <PressableScale onPress={guardarSet} haptic="success" style={{ padding: 15, backgroundColor: accent, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.monoXBold, fontSize: 12, letterSpacing: 0.8, color: C.bg, textTransform: 'uppercase' }}>✓ GUARDAR SET</Text>
            </PressableScale>

            {/* LOGGED SETS */}
            {(log[activeEx.id] || []).length > 0 && (
              <View style={{ borderTopWidth: 1, borderTopColor: C.border }}>
                {(log[activeEx.id] || []).map((s, idx) => (
                  <Animated.View key={idx} layout={LinearTransition.duration(220)}>
                  <Animated.View
                    entering={FadeIn.duration(250)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.borderLight }}
                  >
                    <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textTertiary, width: 40 }}>SET {idx + 1}</Text>
                    <Text style={{ flex: 1, fontFamily: F.monoBold, fontSize: 13, color: C.textPrimary }}>
                      {formatWeight(s.peso, weightUnit)} × {s.reps}
                    </Text>
                    <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textSecondary }}>RPE {s.rpe}</Text>
                    {s.pr ? (
                      <View style={{ borderWidth: 1, borderColor: C.red, paddingHorizontal: 5, paddingVertical: 1 }}>
                        <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.red }}>PR</Text>
                      </View>
                    ) : (
                      <Text style={{ fontFamily: F.mono, fontSize: 11, color: accent }}>✓</Text>
                    )}
                  </Animated.View>
                  </Animated.View>
                ))}
              </View>
            )}
          </Card>
        )}

        {/* EXERCISE FORM — same WorkoutX search + muscle map as other days */}
        {(editingEx || addingEx) && (
          <ExercisePlanForm
            key={editingEx ? `edit-${activeEx?.id}` : 'add'}
            editing={editingEx}
            initial={editingEx && activeEx
              ? { nombre: activeEx.nombre, target: activeEx.target, reps: activeEx.reps, peso: activeEx.peso, step: activeEx.step, wxId: activeEx.wxId, gifPath: activeEx.gifPath }
              : { nombre: '', target: 3, reps: 8, peso: 0, step: 2.5, wxId: null, gifPath: null }}
            weightUnit={weightUnit}
            accent={accent}
            existingExercises={exercises.map(e => ({
              id: e.id, nombre: e.nombre, muscleGroup: e.muscleGroup, target: e.target, doneCount: log[e.id]?.length ?? 0,
            }))}
            profileSex={state.profileData?.sex}
            onCancel={cancelExForm}
            onSave={editingEx ? saveEditEx : saveAddEx}
            onDelete={editingEx ? deleteEx : undefined}
            onAddFromMap={addRecommendedExercise}
          />
        )}

        {/* EXERCISE LIST */}
        {hasPlan && (
          <>
            <Label style={{ marginTop: 16, marginBottom: 9 }}>EJERCICIOS DE HOY</Label>
            {exercises.map((e, i) => {
              const sets = log[e.id] || [];
              const done = sets.length;
              const ton = sets.reduce((a, s) => a + s.peso * s.reps, 0);
              const isActive = i === exIndex;
              const complete = done >= e.target;
              return (
                <Animated.View key={e.id} layout={LinearTransition.duration(220)}>
                <Animated.View entering={FadeInDown.duration(280).delay(i * 40).easing(Easing.out(Easing.cubic))}>
                  <PressableScale
                    onPress={() => selectEx(i)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      backgroundColor: C.card,
                      borderWidth: 1, borderColor: isActive ? accent : C.border,
                      padding: 12, paddingHorizontal: 14, marginBottom: 7,
                    }}
                  >
                    <View style={{ width: 6, height: 6, backgroundColor: complete ? accent : isActive ? C.cyan : C.border }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.textPrimary }}>{e.nombre}</Text>
                      <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary, marginTop: 2 }}>
                        {e.sub} · {formatWeight(ton, weightUnit)}
                      </Text>
                    </View>
                    {(e.gifPath || e.wxId) && (
                      <PressableScale
                        haptic="light"
                        onPress={() => setViewingAnimation({ nombre: e.nombre, wxId: e.wxId, gifPath: e.gifPath })}
                        accessibilityLabel={`Ver animación de ${e.nombre}`}
                        style={{ paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl }}
                      >
                        <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textSecondary }}>▶</Text>
                      </PressableScale>
                    )}
                    <Text style={{ fontFamily: F.monoBold, fontSize: 13, color: complete ? accent : isActive ? C.cyan : C.textSecondary }}>
                      {done}/{e.target}
                    </Text>
                  </PressableScale>
                </Animated.View>
                </Animated.View>
              );
            })}

            <PressableScale
              onPress={startAddEx}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#3a3a40', borderStyle: 'dashed', backgroundColor: C.bgEl, padding: 14, marginTop: 3 }}
            >
              <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, color: C.textSecondary, textTransform: 'uppercase' }}>
                + AGREGAR EJERCICIO
              </Text>
            </PressableScale>

            {/* FINISH SESSION */}
            {totalSets > 0 && !sessionDone && (
              <Animated.View entering={FadeInDown.duration(300)}>
                <PressableScale
                  onPress={finishWorkout}
                  haptic="success"
                  style={{ marginTop: 14, padding: 15, borderWidth: 1, borderColor: accent, alignItems: 'center' }}
                >
                  <Text style={{ fontFamily: F.monoXBold, fontSize: 12, letterSpacing: 0.8, color: accent, textTransform: 'uppercase' }}>
                    ■ FINALIZAR SESIÓN
                  </Text>
                </PressableScale>
              </Animated.View>
            )}
          </>
        )}
        </>
        ) : (
          <OtherDayPlanEditor weekday={selectedWeekday} onChanged={refreshWeekPlanCounts} />
        )}
      </View>
    </ScrollView>
    {viewingAnimation && (
      <ExerciseAnimationModal
        nombre={viewingAnimation.nombre}
        wxId={viewingAnimation.wxId}
        gifPath={viewingAnimation.gifPath}
        onClose={() => setViewingAnimation(null)}
      />
    )}
    </>
  );
}
