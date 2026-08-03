import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BodyGender,
  BodySide,
  getAvailableMuscles,
  muscleDetailForSlug,
  MuscleGroup,
  PulsoBodyMap,
} from '@/components/body-map/pulso-body-map';
import { AnimatedBar, Card, GlowPulse, Label, PressableScale } from '@/components/ui/kit';
import { WorkoutXSearch } from '@/components/workoutx-search';
import { C, F, withAlpha } from '@/constants/colors';
import { useApp } from '@/context/app-state';
import { usePreferences } from '@/context/preferences';
import { displayWeight, formatWeight, toKg } from '@/lib/units';
import {
  DETAILED_MUSCLE_LABELS,
  DetailedMuscleKey,
  exerciseTargetsMuscle,
  inferExerciseMuscles,
  POPULAR_EXERCISES,
} from '@/lib/muscles';
import {
  cancelRestTimerNotification,
  completeRestTimerNotification,
  loadRestTimerOverlayPreference,
  showRestTimerNotification,
} from '@/lib/notifications';
import { syncWorkoutWidgets } from '@/lib/widget-bridge';
import { WxSuggestion } from '@/lib/workoutx';

const RPE_VALUES = [6, 7, 8, 9, 10];

const MUSCLES: { key: MuscleGroup; label: string }[] = [
  { key: 'chest', label: 'PECHO' },
  { key: 'back', label: 'ESPALDA' },
  { key: 'legs', label: 'PIERNAS' },
  { key: 'shoulders', label: 'HOMBROS' },
  { key: 'arms', label: 'BRAZOS' },
  { key: 'core', label: 'CORE' },
  { key: 'full', label: 'FULL BODY' },
];

function Stepper({ label, value, onInc, onDec }: { label: string; value: string | number; onInc: () => void; onDec: () => void }) {
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

export default function EntrenoScreen() {
  const {
    state, selectEx, incPeso, decPeso, incReps, decReps, setRpe, guardarSet,
    finishWorkout, applySuggestedPlan,
    startEditEx, startAddEx, cancelExForm, setDraft, saveEditEx, saveAddEx, deleteEx,
    addRest, skipRest, dismissPrFlash, addRecommendedExercise,
  } = useApp();
  const { accent, weightUnit } = usePreferences();
  const insets = useSafeAreaInsets();
  const { exercises, exIndex, log, curPeso, curReps, curRpe, restActive, restLeft, restTotal, prFlash, prMap, editingEx, addingEx, draft, sessionDone, assignedWorkoutBy } = state;
  const isAssigned = assignedWorkoutBy != null;
  const exerciseFormOpen = editingEx || addingEx;
  const activeEx = exercises[exIndex];
  const previousSession = activeEx ? state.previousSessions[activeEx.exerciseId] : null;
  const [selectedWorkoutX, setSelectedWorkoutX] = useState<WxSuggestion | null>(null);
  const [usingManualName, setUsingManualName] = useState(false);
  const [addMode, setAddMode] = useState<'buscador' | 'mapa'>('buscador');
  const [bodySide, setBodySide] = useState<BodySide>('front');
  const [bodyGender, setBodyGender] = useState<BodyGender>(
    state.profileData?.sex === 'F' ? 'female' : 'male',
  );
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [muscleSlug, setMuscleSlug] = useState<string | null>(null);
  const [muscleQuery, setMuscleQuery] = useState('');
  const [addingSuggestion, setAddingSuggestion] = useState<string | null>(null);
  const [mapAddError, setMapAddError] = useState<string | null>(null);
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

  useEffect(() => {
    syncWorkoutWidgets({
      workoutActive: activeEx != null,
      currentExercise: activeEx?.nombre ?? null,
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
  }, [activeEx, exercises, exIndex, curPeso, curReps, weightUnit, restActive, restLeft, restTotal, accent]);

  useEffect(() => () => {
    if (!restActive) cancelRestTimerNotification().catch(() => {});
  }, [restActive]);

  useEffect(() => {
    if (!exerciseFormOpen) {
      setSelectedWorkoutX(null);
      setUsingManualName(false);
      setAddMode('buscador');
      setMuscle(null);
      setMuscleSlug(null);
      setMuscleQuery('');
      setMapAddError(null);
    }
  }, [exerciseFormOpen]);

  const canConfigureExercise = editingEx || selectedWorkoutX != null || usingManualName;

  // ── mapa muscular · agregar ejercicio por músculo ───────────────────────────
  const muscleStats = useMemo(() => MUSCLES.map(item => {
    const exs = exercises.filter(exercise => exercise.muscleGroup === item.key);
    const target = exs.reduce((total, exercise) => total + exercise.target, 0);
    const done = exs.reduce((total, exercise) => total + (log[exercise.id]?.length ?? 0), 0);
    return { ...item, exercises: exs, target, done, load: target ? Math.min(1, done / target) : 0 };
  }), [exercises, log]);
  const selectedMuscle = muscleStats.find(item => item.key === muscle);
  const selectedMuscleDetail = muscleSlug ? muscleDetailForSlug(muscleSlug) : null;
  const selectedPopularExercises = selectedMuscleDetail
    ? POPULAR_EXERCISES[selectedMuscleDetail.key as DetailedMuscleKey] ?? []
    : [];
  const selectedExercises = selectedMuscle?.exercises.filter(exercise =>
    !selectedMuscleDetail ||
    exerciseTargetsMuscle(
      inferExerciseMuscles(exercise.nombre, exercise.muscleGroup),
      selectedMuscleDetail.key,
    ),
  ) ?? [];
  const availableMuscles = useMemo(
    () => getAvailableMuscles(bodyGender, bodySide),
    [bodyGender, bodySide],
  );
  const searchableMuscles = useMemo(() => {
    const all = [
      ...getAvailableMuscles(bodyGender, 'front'),
      ...getAvailableMuscles(bodyGender, 'back'),
    ];
    const byKey = new Map(all.map(detail => [detail.key, detail]));
    const normalize = (value: string) => value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase('es');
    const query = normalize(muscleQuery.trim());
    return [...byKey.values()]
      .filter(detail => !query || normalize(detail.label).includes(query))
      .slice(0, query ? 8 : 0);
  }, [bodyGender, muscleQuery]);
  const detailedLoads = useMemo(() => {
    const result: Record<string, number> = {};
    for (const detail of availableMuscles) {
      const relevant = exercises.filter(exercise =>
        exerciseTargetsMuscle(
          inferExerciseMuscles(exercise.nombre, exercise.muscleGroup),
          detail.key,
        ));
      const target = relevant.reduce((total, exercise) => total + exercise.target, 0);
      const done = relevant.reduce(
        (total, exercise) => total + (log[exercise.id]?.length ?? 0),
        0,
      );
      result[detail.key] = target ? Math.min(1, done / target) : 0;
    }
    return result;
  }, [availableMuscles, exercises, log]);
  const selectedTarget = selectedExercises.reduce((total, exercise) => total + exercise.target, 0);
  const selectedDone = selectedExercises.reduce(
    (total, exercise) => total + (log[exercise.id]?.length ?? 0),
    0,
  );

  const doneSets = (log[activeEx?.id] || []).length;
  const totalSets = Object.values(log).reduce((a, sets) => a + sets.length, 0);
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
            <Label style={{ marginBottom: 6 }}>{isAssigned ? `PLAN DE ${assignedWorkoutBy?.toUpperCase()}` : 'SESIÓN A · FULL BODY'}</Label>
            <Text style={{ fontFamily: F.grotesk, fontSize: 27, color: C.textPrimary }}>Entreno</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontFamily: F.monoXBold, fontSize: 20, color: accent, fontVariant: ['tabular-nums'] as any }}>
              {displayWeight(totalTonelaje, weightUnit).toLocaleString()}
            </Text>
            <Label style={{ marginTop: 4 }}>TONELAJE {weightUnit}</Label>
          </View>
        </View>

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
              SIN PLAN DE ENTRENO
            </Text>
            <Text style={{ fontFamily: F.inter, fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 16 }}>
              Empezá con un plan full-body sugerido o armá el tuyo desde cero
            </Text>
            <PressableScale
              onPress={applySuggestedPlan}
              haptic="medium"
              style={{ backgroundColor: accent, paddingVertical: 12, paddingHorizontal: 22, alignItems: 'center', marginBottom: 10, alignSelf: 'stretch' }}
            >
              <Text style={{ fontFamily: F.monoXBold, fontSize: 11, letterSpacing: 0.6, color: C.bg, textTransform: 'uppercase' }}>
                ★ USAR PLAN SUGERIDO
              </Text>
            </PressableScale>
            <PressableScale
              onPress={startAddEx}
              style={{ borderWidth: 1, borderColor: C.border, paddingVertical: 12, paddingHorizontal: 22, alignItems: 'center', alignSelf: 'stretch' }}
            >
              <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, color: C.textSecondary, textTransform: 'uppercase' }}>
                + CREAR MI PLAN
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

        {/* EXERCISE FORM */}
        {(editingEx || addingEx) && (
          <Animated.View entering={FadeInDown.duration(280)} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: accent, padding: 14, marginBottom: 12 }}>
            <Label style={{ color: accent, marginBottom: 12 }}>
              {editingEx ? 'EDITAR EJERCICIO' : 'NUEVO EJERCICIO'}
            </Label>

            {addingEx && (
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 13 }}>
                {([['buscador', 'BUSCADOR'], ['mapa', 'MAPA']] as const).map(([key, label]) => {
                  const sel = addMode === key;
                  return (
                    <PressableScale
                      key={key}
                      onPress={() => setAddMode(key)}
                      style={{
                        flex: 1, padding: 9, borderWidth: 1,
                        borderColor: sel ? C.cyan : C.border,
                        backgroundColor: sel ? 'rgba(61,220,255,0.08)' : C.bgEl,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 0.6, color: sel ? C.cyan : C.textTertiary }}>
                        {label}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>
            )}

            {(editingEx || addMode === 'buscador') && (
              <>
                <Label style={{ marginBottom: 6 }}>NOMBRE · BUSCAR EN WORKOUTX</Label>
                <TextInput
                  value={draft.nombre}
                  onChangeText={v => {
                    setSelectedWorkoutX(null);
                    setUsingManualName(false);
                    setDraft('nombre', v);
                  }}
                  placeholder="Ej: sentadilla, curl, press…"
                  placeholderTextColor={C.textTertiary}
                  style={{ backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 10, color: C.textPrimary, fontFamily: F.inter, fontSize: 14, marginBottom: 10 }}
                />

                <WorkoutXSearch
                  query={String(draft.nombre)}
                  enabled={editingEx || addingEx}
                  onSelect={suggestion => {
                    setSelectedWorkoutX(suggestion);
                    setUsingManualName(false);
                    setDraft('nombre', suggestion.name);
                  }}
                />

                {addingEx && !canConfigureExercise && String(draft.nombre).trim().length > 0 && (
                  <PressableScale
                    onPress={() => setUsingManualName(true)}
                    style={{ borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, padding: 10, marginBottom: 12, alignItems: 'center' }}
                  >
                    <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textSecondary, textTransform: 'uppercase', textAlign: 'center' }}>
                      USAR “{String(draft.nombre).trim()}” COMO EJERCICIO MANUAL
                    </Text>
                  </PressableScale>
                )}
              </>
            )}

            {addingEx && addMode === 'mapa' && (
              <>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                  {(['front', 'back'] as BodySide[]).map(side => (
                    <PressableScale
                      key={side}
                      onPress={() => setBodySide(side)}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: bodySide === side ? C.cyan : C.border,
                        backgroundColor: bodySide === side ? 'rgba(61,220,255,0.07)' : C.bgEl,
                        padding: 8,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontFamily: F.monoBold, fontSize: 9, color: bodySide === side ? C.cyan : C.textTertiary }}>
                        {side === 'front' ? 'FRONTAL' : 'POSTERIOR'}
                      </Text>
                    </PressableScale>
                  ))}
                  {(['male', 'female'] as BodyGender[]).map(gender => (
                    <PressableScale
                      key={gender}
                      onPress={() => setBodyGender(gender)}
                      style={{
                        width: 42,
                        borderWidth: 1,
                        borderColor: bodyGender === gender ? accent : C.border,
                        backgroundColor: C.bgEl,
                        padding: 8,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontFamily: F.monoBold, fontSize: 10, color: bodyGender === gender ? accent : C.textTertiary }}>
                        {gender === 'male' ? 'M' : 'F'}
                      </Text>
                    </PressableScale>
                  ))}
                </View>

                <View style={{ minHeight: 280, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, marginBottom: 13 }}>
                  <PulsoBodyMap
                    gender={bodyGender}
                    side={bodySide}
                    scale={0.68}
                    signals={muscleStats.map(item => ({
                      group: item.key,
                      load: item.load,
                      selected: muscle === item.key && muscleSlug == null,
                    }))}
                    selectedSlugs={muscleSlug ? [muscleSlug] : []}
                    detailedLoads={detailedLoads}
                    onMusclePress={(group, slug) => {
                      setMuscle(group);
                      setMuscleSlug(current => current === slug ? null : slug);
                      setMuscleQuery('');
                    }}
                  />
                </View>

                <Label style={{ marginBottom: 7 }}>BUSCAR MÚSCULO</Label>
                <TextInput
                  value={muscleQuery}
                  onChangeText={setMuscleQuery}
                  placeholder="Ej: cuádriceps, bíceps, glúteos…"
                  placeholderTextColor={C.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    borderWidth: 1,
                    borderColor: C.border,
                    backgroundColor: C.bgEl,
                    color: C.textPrimary,
                    fontFamily: F.inter,
                    fontSize: 13,
                    paddingHorizontal: 12,
                    paddingVertical: 11,
                  }}
                />
                {searchableMuscles.length > 0 && (
                  <View style={{ borderWidth: 1, borderTopWidth: 0, borderColor: C.border, marginBottom: 13 }}>
                    {searchableMuscles.map(detail => (
                      <PressableScale
                        key={detail.key}
                        onPress={() => {
                          setMuscle(detail.group);
                          setMuscleSlug(detail.slug);
                          setMuscleQuery('');
                          if (detail.view) setBodySide(detail.view);
                        }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          borderTopWidth: 1,
                          borderTopColor: C.border,
                          backgroundColor: muscleSlug === detail.slug ? withAlpha(accent, 0.08) : C.bgEl,
                        }}
                      >
                        <Text style={{
                          fontFamily: F.mono,
                          fontSize: 9,
                          color: muscleSlug === detail.slug ? accent : C.textSecondary,
                        }}>
                          {detail.label} · {detail.view === 'back' ? 'POSTERIOR' : 'FRONTAL'}
                        </Text>
                      </PressableScale>
                    ))}
                  </View>
                )}

                {selectedMuscle && (
                  <View style={{ borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, padding: 13, marginBottom: 13 }}>
                    <Label style={{ color: C.cyan, marginBottom: 5 }}>
                      {selectedMuscleDetail?.label ?? selectedMuscle.label}
                      {selectedMuscleDetail?.side === 'left' ? ' · LADO IZQUIERDO' : ''}
                      {selectedMuscleDetail?.side === 'right' ? ' · LADO DERECHO' : ''}
                    </Label>
                    {selectedMuscleDetail && (
                      <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary, marginBottom: 10 }}>
                        GRUPO {selectedMuscle.label} · {selectedDone}/{selectedTarget || '—'} SETS
                      </Text>
                    )}
                    {selectedExercises.length ? selectedExercises.map(exercise => {
                      const exerciseMuscles = inferExerciseMuscles(exercise.nombre, exercise.muscleGroup);
                      return (
                        <View key={exercise.id} style={{ borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 10 }}>
                          <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }}>{exercise.nombre}</Text>
                          <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary, marginTop: 3 }}>
                            {log[exercise.id]?.length ?? 0}/{exercise.target} SETS
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 7 }}>
                            {exerciseMuscles.map(key => (
                              <Text
                                key={key}
                                style={{
                                  fontFamily: F.mono,
                                  fontSize: 7,
                                  color: selectedMuscleDetail?.key === key ? accent : C.textTertiary,
                                  borderWidth: 1,
                                  borderColor: selectedMuscleDetail?.key === key ? accent : C.border,
                                  paddingHorizontal: 5,
                                  paddingVertical: 3,
                                }}
                              >
                                {DETAILED_MUSCLE_LABELS[key]}
                              </Text>
                            ))}
                          </View>
                        </View>
                      );
                    }) : (
                      <Text style={{ fontFamily: F.inter, fontSize: 12, color: C.textTertiary }}>
                        No hay ejercicios asociados a este músculo en el plan actual.
                      </Text>
                    )}
                    {selectedMuscleDetail && selectedPopularExercises.length > 0 && (
                      <View style={{ borderTopWidth: 1, borderTopColor: C.border, marginTop: 12, paddingTop: 12 }}>
                        <Label style={{ color: accent, marginBottom: 8 }}>EJERCICIOS POPULARES</Label>
                        {selectedPopularExercises.map(exercise => {
                          const exists = exercises.some(
                            item => item.nombre.trim().toLocaleLowerCase('es') ===
                              exercise.name.trim().toLocaleLowerCase('es'),
                          );
                          const loading = addingSuggestion === exercise.name;
                          return (
                            <View
                              key={exercise.name}
                              style={{
                                borderWidth: 1,
                                borderColor: C.border,
                                backgroundColor: C.card,
                                padding: 11,
                                marginBottom: 7,
                              }}
                            >
                              <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }}>
                                {exercise.name}
                              </Text>
                              <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.textTertiary, marginTop: 4 }}>
                                {exercise.sets} SETS × {exercise.reps} REPS · {formatWeight(exercise.weight, weightUnit).toUpperCase()} INICIAL
                              </Text>
                              <PressableScale
                                disabled={exists || addingSuggestion != null}
                                onPress={async () => {
                                  setMapAddError(null);
                                  setAddingSuggestion(exercise.name);
                                  try {
                                    await addRecommendedExercise(exercise);
                                  } catch {
                                    setMapAddError('No se pudo agregar el ejercicio. Intentá de nuevo.');
                                  } finally {
                                    setAddingSuggestion(null);
                                  }
                                }}
                                style={{
                                  borderWidth: 1,
                                  borderColor: exists ? C.border : accent,
                                  paddingVertical: 8,
                                  alignItems: 'center',
                                  marginTop: 9,
                                  opacity: addingSuggestion != null && !loading ? 0.45 : 1,
                                }}
                              >
                                <Text style={{
                                  fontFamily: F.monoBold,
                                  fontSize: 9,
                                  color: exists ? C.textTertiary : accent,
                                }}>
                                  {exists ? 'AGREGADO' : loading ? 'AGREGANDO…' : '+ AGREGAR AL PLAN'}
                                </Text>
                              </PressableScale>
                            </View>
                          );
                        })}
                        {mapAddError && (
                          <Text style={{ fontFamily: F.inter, fontSize: 11, color: C.red, marginTop: 3 }}>
                            {mapAddError}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                )}
              </>
            )}

            {canConfigureExercise && (
              <>
                <Label style={{ color: accent, marginBottom: 8 }}>CONFIGURACIÓN DEL EJERCICIO</Label>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 13 }}>
                  {[{ label: 'SERIES', field: 'target' as const }, { label: 'REPS', field: 'reps' as const }, { label: `PESO ${weightUnit}`, field: 'peso' as const }].map(item => (
                    <View key={item.field} style={{ flex: 1 }}>
                      <Label style={{ marginBottom: 6 }}>{item.label}</Label>
                      <TextInput
                        keyboardType="numeric"
                        value={item.field === 'peso' ? String(displayWeight(Number(draft.peso) || 0, weightUnit)) : String(draft[item.field])}
                        onChangeText={v => setDraft(item.field, item.field === 'peso' ? toKg(Number(v) || 0, weightUnit) : v)}
                        style={{ backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 9, color: C.textPrimary, fontFamily: F.monoBold, fontSize: 15, textAlign: 'center' }}
                      />
                    </View>
                  ))}
                </View>
              </>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PressableScale onPress={cancelExForm} style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 0.4, color: C.textSecondary, textTransform: 'uppercase' }}>CANCELAR</Text>
              </PressableScale>
              {canConfigureExercise && editingEx && (
                <PressableScale onPress={deleteEx} haptic="medium" style={{ paddingHorizontal: 13, padding: 12, borderWidth: 1, borderColor: C.red, backgroundColor: 'rgba(255,61,90,0.06)', alignItems: 'center' }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.red, textTransform: 'uppercase' }}>ELIMINAR</Text>
                </PressableScale>
              )}
              {canConfigureExercise && (
                <PressableScale onPress={editingEx ? saveEditEx : saveAddEx} haptic="medium" style={{ flex: 1.5, padding: 12, backgroundColor: accent, alignItems: 'center' }}>
                  <Text style={{ fontFamily: F.monoXBold, fontSize: 11, letterSpacing: 0.6, color: C.bg, textTransform: 'uppercase' }}>
                    {editingEx ? 'GUARDAR CAMBIOS' : 'AGREGAR AL PLAN'}
                  </Text>
                </PressableScale>
              )}
            </View>
          </Animated.View>
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
      </View>
    </ScrollView>
  );
}
