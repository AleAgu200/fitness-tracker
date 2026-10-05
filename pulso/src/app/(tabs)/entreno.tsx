import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExerciseAnimationModal } from '@/components/exercise-animation-modal';
import { ExercisePlanForm, ExercisePlanValues, ExistingPlanExercise } from '@/components/exercise-plan-form';
import { PreviousPulse } from '@/components/pulse/previous-pulse';
import { AnimatedBar, Card, GlowPulse, Label, PressableScale, SMALL_TARGET_HIT_SLOP } from '@/components/ui/kit';
import { TabAdGate } from '@/components/tab-ad-gate';
import { F, useColors, withAlpha } from '@/constants/colors';
import { SetFeedback, useApp } from '@/context/app-state';
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
import { useNow } from '@/hooks/use-pulse';
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

/** Closing is the moment of payoff: land on the result, never back on the logger. */
function openSessionResult(sessionId: string | null) {
  if (sessionId) router.push({ pathname: '/resultado-sesion', params: { sessionId } });
}

function feedbackText(feedback: SetFeedback, weightUnit: 'kg' | 'lb'): string {
  if (feedback.kind === 'record') return `⚡ NUEVO RÉCORD · ${formatWeight(feedback.weightKg, weightUnit).toUpperCase()}`;
  if (feedback.kind === 'beat') return `✓ SERIE ${feedback.setNumber} · SUPERASTE TU PULSO ANTERIOR`;
  return `✓ SERIE ${feedback.setNumber} GUARDADA`;
}

function Stepper({ label, value, onInc, onDec }: { label: string; value: string | number; onInc: () => void; onDec: () => void }) {
  const C = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: C.card, padding: 12 }}>
      <Label style={{ textAlign: 'center', marginBottom: 9 }}>{label}</Label>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <PressableScale onPress={onDec} style={{ width: 30, height: 30, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: F.mono, fontSize: 18, color: C.textPrimary }}>−</Text>
        </PressableScale>
        <Text
          numberOfLines={1}
          style={{ fontFamily: F.monoXBold, fontSize: 22, color: C.textPrimary, minWidth: 54, textAlign: 'center', fontVariant: ['tabular-nums'] as any }}
        >
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
  const [viewingAnimation, setViewingAnimation] = useState<{ nombre: string; wxId: string | null; gifPath: string | null; instructions: string | null } | null>(null);

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

  async function addFromMap(exercise: { name: string; sets: number; reps: number; weight: number; step: number; gifPath?: string | null; instructions?: string | null }) {
    if (!userId || !templateId) return;
    if (exercises.some(item => item.nombre.trim().toLocaleLowerCase('es') === exercise.name.trim().toLocaleLowerCase('es'))) return;
    await addPlanExercise(userId, templateId, {
      nombre: exercise.name, target: exercise.sets, reps: exercise.reps, peso: exercise.weight, step: exercise.step,
      gifPath: exercise.gifPath,
      instructions: exercise.instructions,
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
            ? { nombre: editingExercise.nombre, target: editingExercise.target, reps: editingExercise.reps, peso: editingExercise.peso, step: editingExercise.step, wxId: editingExercise.wxId, gifPath: editingExercise.gifPath, instructions: editingExercise.instructions }
            : { nombre: '', target: 3, reps: 8, peso: 0, step: 2.5, wxId: null, gifPath: null, instructions: null }}
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
              {(ex.gifPath || ex.wxId || ex.instructions) && (
                <PressableScale
                  haptic="light"
                  onPress={() => setViewingAnimation({ nombre: ex.nombre, wxId: ex.wxId, gifPath: ex.gifPath, instructions: ex.instructions })}
                  accessibilityLabel={`Ver guía de ${ex.nombre}`}
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
          instructions={viewingAnimation.instructions}
          onClose={() => setViewingAnimation(null)}
        />
      )}
    </>
  );
}

export default function EntrenoScreen() {
  const {
    state, selectEx, incPeso, decPeso, incReps, decReps, setRpe, guardarSet,
    finishWorkout, discardFreeSession,
    startEditEx, startAddEx, cancelExForm, saveEditEx, saveAddEx, deleteEx,
    addRest, reduceRest, skipRest, addRecommendedExercise,
  } = useApp();
  const { accent, weightUnit } = usePreferences();
  const { userId } = useSession();
  const C = useColors();
  const insets = useSafeAreaInsets();
  const { exercises, exIndex, log, curPeso, curReps, curRpe, restActive, restLeft, restTotal, setFeedback, prMap, editingEx, addingEx, sessionDone, assignedWorkoutBy, scheduledWorkout, activePlan, freeSession } = state;
  // Attribution only while the coach's plan is the one in force (see Mis planes).
  const isAssigned = activePlan?.origin === 'coach' && freeSession == null;
  const coachName = assignedWorkoutBy ?? 'tu coach';
  const [finishing, setFinishing] = useState(false);

  const now = useNow();

  const finishAndReveal = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      openSessionResult(await finishWorkout());
    } finally {
      setFinishing(false);
    }
  }, [finishWorkout, finishing]);

  useEffect(() => {
    if (setFeedback) AccessibilityInfo.announceForAccessibility(feedbackText(setFeedback, weightUnit));
  }, [setFeedback, weightUnit]);

  const todayWeekday = weekdayOf(new Date());
  // Day tabs are local to this screen: only today's plan feeds the shared
  // AppState (used by Hoy/Pulso), so browsing another day here can't leak into
  // those dashboards. See OtherDayPlanEditor below for the non-today branch.
  const [selectedWeekday, setSelectedWeekday] = useState(todayWeekday);
  const [weekPlanCounts, setWeekPlanCounts] = useState<Record<number, number>>({});
  const [viewingAnimation, setViewingAnimation] = useState<{ nombre: string; wxId: string | null; gifPath: string | null; instructions: string | null } | null>(null);
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
    } else if (params.action === 'skip-rest') {
      skipRest();
    } else if (params.action === 'add-rest') {
      addRest();
    } else if (params.action === 'reduce-rest') {
      reduceRest();
    } else if (params.action === 'finish') {
      finishWorkout().then(openSessionResult).catch(e => console.error('[widget-finish]', e));
    }
    router.setParams({ action: undefined, slotId: undefined });
  }, [state.ready, params.action, params.slotId, guardarSet, finishWorkout, skipRest, addRest, reduceRest]);
  useEffect(() => {
    if (!params.action) handledAction.current = false;
  }, [params.action]);

  const refreshWeekPlanCounts = useCallback(() => {
    if (!userId) return;
    getWeekSummary(userId)
      .then(summary => setWeekPlanCounts(Object.fromEntries(summary.map(s => [s.weekday, s.exerciseCount]))))
      .catch(e => console.error('[week-summary]', e));
  }, [userId]);

  // Also when the active plan changes (Mis planes): the counts belong to that plan.
  useEffect(() => { refreshWeekPlanCounts(); }, [refreshWeekPlanCounts, activePlan?.id]);
  const activeEx = exercises[exIndex];
  const previousSession = activeEx ? state.previousSessions[activeEx.exerciseId] : null;
  const previousRestActive = useRef(false);
  const previousRestTotal = useRef(restTotal);

  useEffect(() => {
    const wasActive = previousRestActive.current;
    const durationChanged = previousRestTotal.current !== restTotal;

    if (restActive && (!wasActive || durationChanged)) {
      const restEndAt = Date.now() + restLeft * 1000;
      // "Descanso terminado" always; the pinned countdown only with the overlay setting.
      loadRestTimerOverlayPreference()
        .then(withCountdown => showRestTimerNotification(restEndAt, activeEx?.nombre, withCountdown))
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
  const todaysSessionId = sessionDone
    ? state.trainingSessions.find(session =>
      session.status === 'completed' && session.finishedAt != null
      && new Date(session.finishedAt).toDateString() === new Date().toDateString())?.id ?? null
    : null;

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
      nextExercises: exercises.slice(exIndex + 1, exIndex + 3).map(exercise => exercise.nombre),
      muscleGroup: activeEx?.muscleGroup ?? null,
      weight: activeEx ? curPeso : null,
      reps: activeEx ? curReps : null,
      weightUnit,
      completedSets: activeEx ? (log[activeEx.id] ?? []).length : 0,
      targetSets: activeEx?.target ?? 0,
      loggedSets: activeEx
        ? (log[activeEx.id] ?? []).map(set => ({ weight: set.peso, reps: set.reps, rpe: set.rpe }))
        : [],
      sessionVolume: exercises.reduce((total, exercise) => (
        total + (log[exercise.id] ?? []).reduce((sum, set) => sum + set.peso * set.reps, 0)
      ), 0),
      restActive,
      restLeft,
      restEndAt: restActive ? Date.now() + restLeft * 1000 : null,
      restTotal,
      accent,
    });
  }, [activeEx, exercises, exIndex, log, curPeso, curReps, weightUnit, restActive, restLeft, restTotal, accent, sessionDone, totalSets]);

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
  const totalTarget = exercises.reduce((total, exercise) => total + exercise.target, 0);
  const canSwitchSession = totalSets === 0 && !sessionDone;

  function confirmDiscardFreeSession() {
    Alert.alert(
      'Volver al plan',
      'La sesión libre se descarta y Entreno vuelve a mostrar tu plan de hoy.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Volver al plan', onPress: () => { discardFreeSession().catch(e => console.error('[free-session-discard]', e)); } },
      ],
    );
  }

  return (
    <>
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Label style={{ marginBottom: 6 }}>
              {freeSession && isToday
                ? 'SESIÓN LIBRE · HOY'
                : isAssigned ? `PLAN DE ${coachName.toUpperCase()}` : `${WEEKDAY_LABELS[selectedWeekday]}${isToday ? ' · HOY' : ''}`}
            </Label>
            <Text accessibilityRole="header" style={{ fontFamily: F.grotesk, fontSize: 27, color: C.textPrimary }}>Entreno</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontFamily: F.monoXBold, fontSize: 20, color: C.textPrimary, fontVariant: ['tabular-nums'] as any }}>
              {displayWeight(totalTonelaje, weightUnit).toLocaleString()}
            </Text>
            <Label style={{ marginTop: 4 }}>TONELAJE {weightUnit}</Label>
          </View>
        </View>

        {/* Plan + free-session entry points */}
        <View style={{ flexDirection: 'row', gap: 18, marginBottom: 14 }}>
          <PressableScale onPress={() => router.push('/mis-planes')} hitSlop={SMALL_TARGET_HIT_SLOP}>
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1, color: C.textSecondary }}>
              {`◆ ${(activePlan?.name ?? 'MIS PLANES').toUpperCase()} →`}
            </Text>
          </PressableScale>
          {isToday && canSwitchSession && !freeSession && hasPlan && (
            <PressableScale onPress={() => router.push('/sesion-libre')} hitSlop={SMALL_TARGET_HIT_SLOP}>
              <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1, color: C.textSecondary }}>SESIÓN LIBRE →</Text>
            </PressableScale>
          )}
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
        {/* SESSION PROGRESS — exercise position and sets done */}
        {hasPlan && (
          <View
            accessible
            accessibilityLabel={`Ejercicio ${exIndex + 1} de ${exercises.length}. ${totalSets} de ${totalTarget} series.`}
            style={{ marginBottom: 14 }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Label>{`EJERCICIO ${String(exIndex + 1).padStart(2, '0')} / ${String(exercises.length).padStart(2, '0')}`}</Label>
              <Label>{`${totalSets}/${totalTarget} SERIES`}</Label>
            </View>
            <AnimatedBar fill={totalTarget ? totalSets / totalTarget : 0} color={C.cyan} height={4} />
          </View>
        )}

        {/* FREE SESSION BANNER */}
        {freeSession && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Label style={{ color: C.cyan }}>SESIÓN LIBRE</Label>
              <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary, marginTop: 3 }}>{freeSession.label}</Text>
            </View>
            {canSwitchSession && (
              <PressableScale onPress={confirmDiscardFreeSession} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: C.border }}>
                <Text style={{ fontFamily: F.monoBold, fontSize: 10, color: C.textSecondary }}>VOLVER AL PLAN</Text>
              </PressableScale>
            )}
          </View>
        )}

        {/* ASSIGNED PLAN BANNER */}
        {isAssigned && (
          <Animated.View entering={FadeInDown.duration(280)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: C.cyan, backgroundColor: 'rgba(61,220,255,0.06)', padding: 12, marginBottom: 12 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.cyan }}>◆</Text>
            <Text style={{ flex: 1, fontFamily: F.inter, fontSize: 12, color: C.textSecondary, lineHeight: 17 }}>
              Plan asignado por <Text style={{ color: C.cyan, fontFamily: F.interSemi }}>{coachName}</Text>. Podés ajustarlo; desde el portal solo tu entrenador puede cambiar el entrenamiento.
            </Text>
          </Animated.View>
        )}

        {/* SCHEDULED PLAN BANNER — the next phase is published but not in force yet */}
        {scheduledWorkout?.effectiveAt != null && (
          <Animated.View entering={FadeInDown.duration(280)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: withAlpha(C.textTertiary, 0.4), padding: 12, marginBottom: 12 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.textTertiary }}>→</Text>
            <Text style={{ flex: 1, fontFamily: F.inter, fontSize: 12, color: C.textSecondary, lineHeight: 17 }}>
              {scheduledWorkout.name ? `“${scheduledWorkout.name}” entra` : 'Un plan nuevo entra'} en vigor el{' '}
              <Text style={{ color: C.textPrimary, fontFamily: F.interSemi }}>
                {new Date(scheduledWorkout.effectiveAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'long' })}
              </Text>
              . Hasta entonces seguís con este.
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
            {todaysSessionId && (
              <PressableScale
                onPress={() => router.push({ pathname: '/resultado-sesion', params: { sessionId: todaysSessionId } })}
                style={{ marginTop: 10, minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderWidth: 1, borderColor: C.border }}
              >
                <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 0.6, color: C.textPrimary }}>VER RESULTADO →</Text>
              </PressableScale>
            )}
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
              onPress={() => router.push('/sesion-libre')}
              haptic="medium"
              containerStyle={{ alignSelf: 'stretch' }}
              style={{ backgroundColor: accent, paddingVertical: 13, paddingHorizontal: 22, alignItems: 'center', marginBottom: 8 }}
            >
              <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, color: C.onAccent, textTransform: 'uppercase' }}>
                SESIÓN LIBRE · ELEGIR MÚSCULOS
              </Text>
            </PressableScale>
            <PressableScale
              onPress={startAddEx}
              containerStyle={{ alignSelf: 'stretch' }}
              style={{ borderWidth: 1, borderColor: C.border, paddingVertical: 12, paddingHorizontal: 22, alignItems: 'center' }}
            >
              <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, color: C.textPrimary, textTransform: 'uppercase' }}>
                + AGREGAR EJERCICIO AL PLAN
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
                {(activeEx.gifPath || activeEx.wxId || activeEx.instructions) && (
                  <PressableScale
                    haptic="light"
                    onPress={() => setViewingAnimation({ nombre: activeEx.nombre, wxId: activeEx.wxId, gifPath: activeEx.gifPath, instructions: activeEx.instructions })}
                    accessibilityLabel={`Ver guía de ${activeEx.nombre}`}
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

            {/* PREVIOUS PULSE — context right before the input */}
            <PreviousPulse
              previous={previousSession}
              current={{ weightKg: curPeso, reps: curReps, rpe: curRpe }}
              now={now}
              weightUnit={weightUnit}
              accent={accent}
            />

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

            {/* The screen's only accent CTA. For ≤ 1.5 s after a save it carries
                the confirmation instead of shifting the layout. */}
            <PressableScale
              onPress={() => guardarSet()}
              disabled={restActive}
              haptic="success"
              accessibilityLabel={restActive ? 'Guardar serie, disponible al terminar el descanso' : 'Guardar serie'}
              style={{ minHeight: 48, padding: 15, backgroundColor: setFeedback?.kind === 'record' ? C.red : accent, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontFamily: F.monoXBold, fontSize: 12, letterSpacing: 0.8, color: C.onAccent, textTransform: 'uppercase' }}>
                {setFeedback ? feedbackText(setFeedback, weightUnit) : restActive ? 'SALTÁ EL DESCANSO PARA GUARDAR' : '✓ GUARDAR SET'}
              </Text>
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
                    {s.workingSeconds != null && (
                      <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary }}>⏱ {s.workingSeconds}s</Text>
                    )}
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
              ? { nombre: activeEx.nombre, target: activeEx.target, reps: activeEx.reps, peso: activeEx.peso, step: activeEx.step, wxId: activeEx.wxId, gifPath: activeEx.gifPath, instructions: activeEx.instructions }
              : { nombre: '', target: 3, reps: 8, peso: 0, step: 2.5, wxId: null, gifPath: null, instructions: null }}
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
                    {(e.gifPath || e.wxId || e.instructions) && (
                      <PressableScale
                        haptic="light"
                        onPress={() => setViewingAnimation({ nombre: e.nombre, wxId: e.wxId, gifPath: e.gifPath, instructions: e.instructions })}
                        accessibilityLabel={`Ver guía de ${e.nombre}`}
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
                  onPress={() => void finishAndReveal()}
                  disabled={finishing}
                  haptic="success"
                  style={{ marginTop: 14, padding: 15, borderWidth: 1, borderColor: C.textSecondary, alignItems: 'center' }}
                >
                  <Text style={{ fontFamily: F.monoXBold, fontSize: 12, letterSpacing: 0.8, color: C.textPrimary, textTransform: 'uppercase' }}>
                    {finishing ? 'CERRANDO…' : `■ TERMINAR SESIÓN${totalTarget > totalSets ? ` · ${totalTarget - totalSets} SERIES SIN HACER` : ''}`}
                  </Text>
                </PressableScale>
              </Animated.View>
            )}
          </>
        )}
        </>
        ) : (
          // Keyed by plan too: switching plans in Mis planes must not leave the previous plan's day on screen.
          <OtherDayPlanEditor key={`${activePlan?.id ?? 'none'}-${selectedWeekday}`} weekday={selectedWeekday} onChanged={refreshWeekPlanCounts} />
        )}
      </View>
    </ScrollView>
    {viewingAnimation && (
      <ExerciseAnimationModal
        nombre={viewingAnimation.nombre}
        wxId={viewingAnimation.wxId}
        gifPath={viewingAnimation.gifPath}
        instructions={viewingAnimation.instructions}
        onClose={() => setViewingAnimation(null)}
      />
    )}
    {/* Last child on purpose: it's an absolutely-positioned overlay that has to
        paint above the whole screen until the ad is done. */}
    <TabAdGate placement="entreno" />
    </>
  );
}
