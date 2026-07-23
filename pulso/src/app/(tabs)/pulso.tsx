import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Switch, Text, TextInput, View } from 'react-native';
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
import { C, F } from '@/constants/colors';
import { useApp } from '@/context/app-state';
import {
  DETAILED_MUSCLE_LABELS,
  DetailedMuscleKey,
  exerciseTargetsMuscle,
  inferExerciseMuscles,
  POPULAR_EXERCISES,
} from '@/lib/muscles';

type PulseTab = 'core' | 'map' | 'cards' | 'week' | 'team';

const TABS: { key: PulseTab; label: string }[] = [
  { key: 'core', label: 'NÚCLEO' },
  { key: 'map', label: 'MAPA' },
  { key: 'cards', label: 'CARTAS' },
  { key: 'week', label: 'SEMANA' },
  { key: 'team', label: 'EQUIPO' },
];

const MUSCLES: { key: MuscleGroup; label: string }[] = [
  { key: 'chest', label: 'PECHO' },
  { key: 'back', label: 'ESPALDA' },
  { key: 'legs', label: 'PIERNAS' },
  { key: 'shoulders', label: 'HOMBROS' },
  { key: 'arms', label: 'BRAZOS' },
  { key: 'core', label: 'CORE' },
  { key: 'full', label: 'FULL BODY' },
];

const TEAM_SHARE_KEY = 'pulso_team_progress_sharing';

export default function PulsoScreen() {
  const { state, addRecommendedExercise } = useApp();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<PulseTab>('core');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [muscleSlug, setMuscleSlug] = useState<string | null>(null);
  const [bodySide, setBodySide] = useState<BodySide>('front');
  const [bodyGender, setBodyGender] = useState<BodyGender>(
    state.profileData?.sex === 'F' ? 'female' : 'male',
  );
  const [muscleQuery, setMuscleQuery] = useState('');
  const [addingExercise, setAddingExercise] = useState<string | null>(null);
  const [exerciseError, setExerciseError] = useState<string | null>(null);
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

  const muscleStats = useMemo(() => MUSCLES.map(item => {
    const exercises = state.exercises.filter(exercise => exercise.muscleGroup === item.key);
    const target = exercises.reduce((total, exercise) => total + exercise.target, 0);
    const done = exercises.reduce((total, exercise) => total + (state.log[exercise.id]?.length ?? 0), 0);
    return { ...item, exercises, target, done, load: target ? Math.min(1, done / target) : 0 };
  }), [state.exercises, state.log]);
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
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es');
    const query = normalize(muscleQuery.trim());
    return [...byKey.values()]
      .filter(detail => !query || normalize(detail.label).includes(query))
      .slice(0, query ? 8 : 0);
  }, [bodyGender, muscleQuery]);
  const detailedLoads = useMemo(() => {
    const result: Record<string, number> = {};
    for (const detail of availableMuscles) {
      const relevant = state.exercises.filter(exercise =>
        exerciseTargetsMuscle(
          inferExerciseMuscles(exercise.nombre, exercise.muscleGroup),
          detail.key,
        ));
      const target = relevant.reduce((total, exercise) => total + exercise.target, 0);
      const done = relevant.reduce(
        (total, exercise) => total + (state.log[exercise.id]?.length ?? 0),
        0,
      );
      result[detail.key] = target ? Math.min(1, done / target) : 0;
    }
    return result;
  }, [availableMuscles, state.exercises, state.log]);
  const selectedTarget = selectedExercises.reduce((total, exercise) => total + exercise.target, 0);
  const selectedDone = selectedExercises.reduce(
    (total, exercise) => total + (state.log[exercise.id]?.length ?? 0),
    0,
  );

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
                    borderColor: selected ? C.yellow : C.border,
                    backgroundColor: selected ? 'rgba(232,255,89,0.08)' : C.card,
                  }}
                >
                  <Text style={{
                    fontFamily: F.monoBold,
                    fontSize: 9,
                    letterSpacing: 0.7,
                    color: selected ? C.yellow : C.textTertiary,
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
              color={C.yellow}
              active={momentum > 0}
              intensity={0.08}
              period={1400}
              style={{ borderWidth: 1, borderColor: C.yellow, backgroundColor: C.card, padding: 22, marginBottom: 14 }}
            >
              <View style={{ alignItems: 'center' }}>
                <Label style={{ color: C.yellow, marginBottom: 15 }}>NÚCLEO PULSO · {coreState}</Label>
                <View style={{
                  width: 136,
                  height: 136,
                  borderWidth: 2,
                  borderColor: C.yellow,
                  transform: [{ rotate: '45deg' }],
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(232,255,89,0.04)',
                }}>
                  <View style={{ transform: [{ rotate: '-45deg' }], alignItems: 'center' }}>
                    <Text style={{ fontFamily: F.monoXBold, fontSize: 42, color: C.yellow }}>{momentum}</Text>
                    <Label style={{ color: C.yellow }}>MOMENTUM</Label>
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
              { label: 'ENTRENO', value: workoutPct, color: C.yellow },
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

        {tab === 'map' && (
          <>
            <Card style={{ padding: 14, marginBottom: 12 }}>
              <Label style={{ marginBottom: 6 }}>MAPA DE CARGA · HOY</Label>
              <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textSecondary, marginBottom: 13 }}>
                Tocá una zona del cuerpo para revisar su carga y los ejercicios del plan.
              </Text>
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
                      borderColor: bodyGender === gender ? C.yellow : C.border,
                      backgroundColor: C.bgEl,
                      padding: 8,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontFamily: F.monoBold, fontSize: 10, color: bodyGender === gender ? C.yellow : C.textTertiary }}>
                      {gender === 'male' ? 'M' : 'F'}
                    </Text>
                  </PressableScale>
                ))}
              </View>

              <View style={{ minHeight: 300, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border }}>
                <PulsoBodyMap
                  gender={bodyGender}
                  side={bodySide}
                  scale={0.72}
                  signals={muscleStats.map(item => ({
                    group: item.key,
                    load: item.load,
                    selected: muscle === item.key && muscleSlug == null,
                  }))}
                  selectedSlugs={muscleSlug ? [muscleSlug] : []}
                  detailedLoads={detailedLoads}
                  onMusclePress={(group, slug) => {
                    const detail = muscleDetailForSlug(slug);
                    setMuscle(group);
                    setMuscleSlug(current => current === slug ? null : slug);
                    setMuscleQuery(detail?.label ?? '');
                  }}
                />
              </View>

              <Label style={{ marginTop: 13, marginBottom: 7 }}>BUSCAR MÚSCULO</Label>
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
                <View style={{ borderWidth: 1, borderTopWidth: 0, borderColor: C.border }}>
                  {searchableMuscles.map(detail => (
                    <PressableScale
                      key={detail.key}
                      onPress={() => {
                        setMuscle(detail.group);
                        setMuscleSlug(detail.slug);
                        setMuscleQuery(detail.label);
                        if (detail.view) setBodySide(detail.view);
                      }}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderTopWidth: 1,
                        borderTopColor: C.border,
                        backgroundColor: muscleSlug === detail.slug ? 'rgba(232,255,89,0.08)' : C.bgEl,
                      }}
                    >
                      <Text style={{
                        fontFamily: F.mono,
                        fontSize: 9,
                        color: muscleSlug === detail.slug ? C.yellow : C.textSecondary,
                      }}>
                        {detail.label} · {detail.view === 'back' ? 'POSTERIOR' : 'FRONTAL'}
                      </Text>
                    </PressableScale>
                  ))}
                </View>
              )}
            </Card>
            {selectedMuscle && (
              <Card style={{ padding: 14, marginBottom: 12 }}>
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
                      {state.log[exercise.id]?.length ?? 0}/{exercise.target} SETS
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 7 }}>
                      {exerciseMuscles.map(key => (
                        <Text
                          key={key}
                          style={{
                            fontFamily: F.mono,
                            fontSize: 7,
                            color: selectedMuscleDetail?.key === key ? C.yellow : C.textTertiary,
                            borderWidth: 1,
                            borderColor: selectedMuscleDetail?.key === key ? C.yellow : C.border,
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
                    <Label style={{ color: C.yellow, marginBottom: 8 }}>EJERCICIOS POPULARES</Label>
                    {selectedPopularExercises.map(exercise => {
                      const exists = state.exercises.some(
                        item => item.nombre.trim().toLocaleLowerCase('es') ===
                          exercise.name.trim().toLocaleLowerCase('es'),
                      );
                      const loading = addingExercise === exercise.name;
                      return (
                        <View
                          key={exercise.name}
                          style={{
                            borderWidth: 1,
                            borderColor: C.border,
                            backgroundColor: C.bgEl,
                            padding: 11,
                            marginBottom: 7,
                          }}
                        >
                          <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }}>
                            {exercise.name}
                          </Text>
                          <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.textTertiary, marginTop: 4 }}>
                            {exercise.sets} SETS × {exercise.reps} REPS · {exercise.weight} KG INICIAL
                          </Text>
                          <PressableScale
                            disabled={exists || addingExercise != null}
                            onPress={async () => {
                              setExerciseError(null);
                              setAddingExercise(exercise.name);
                              try {
                                await addRecommendedExercise(exercise);
                              } catch {
                                setExerciseError('No se pudo agregar el ejercicio. Intentá de nuevo.');
                              } finally {
                                setAddingExercise(null);
                              }
                            }}
                            style={{
                              borderWidth: 1,
                              borderColor: exists ? C.border : C.yellow,
                              paddingVertical: 8,
                              alignItems: 'center',
                              marginTop: 9,
                              opacity: addingExercise != null && !loading ? 0.45 : 1,
                            }}
                          >
                            <Text style={{
                              fontFamily: F.monoBold,
                              fontSize: 9,
                              color: exists ? C.textTertiary : C.yellow,
                            }}>
                              {exists ? 'AGREGADO' : loading ? 'AGREGANDO…' : '+ AGREGAR AL PLAN'}
                            </Text>
                          </PressableScale>
                        </View>
                      );
                    })}
                    {exerciseError && (
                      <Text style={{ fontFamily: F.inter, fontSize: 11, color: C.red, marginTop: 3 }}>
                        {exerciseError}
                      </Text>
                    )}
                  </View>
                )}
                <PressableScale
                  onPress={() => router.push('/entreno')}
                  style={{ borderWidth: 1, borderColor: C.cyan, padding: 11, alignItems: 'center', marginTop: 8 }}
                >
                  <Text style={{ fontFamily: F.monoBold, fontSize: 10, color: C.cyan }}>IR A ENTRENO →</Text>
                </PressableScale>
              </Card>
            )}
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
                color={index === 0 ? C.red : C.yellow}
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
                <Label style={{ color: index === 0 ? C.red : C.yellow }}>NUEVO PULSO · FUERZA</Label>
                <Text style={{ fontFamily: F.grotesk, fontSize: 20, color: C.textPrimary, marginTop: 10 }}>
                  {record.nombre}
                </Text>
                <Text style={{ fontFamily: F.monoXBold, fontSize: 27, color: index === 0 ? C.red : C.yellow, marginTop: 5 }}>
                  {record.weightKg} KG × {record.reps}
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
              <Label style={{ color: C.yellow, marginBottom: 8 }}>TU SEMANA EN PULSO</Label>
              <Text style={{ fontFamily: F.monoXBold, fontSize: 46, color: C.yellow }}>{activeDays}/7</Text>
              <Text style={{ fontFamily: F.inter, fontSize: 12, color: C.textSecondary, marginTop: 5 }}>
                días con una acción registrada
              </Text>
              <View style={{ flexDirection: 'row', gap: 5, marginTop: 16 }}>
                {state.weekDays.map((day, index) => (
                  <View key={index} style={{
                    flex: 1,
                    height: 40,
                    borderWidth: 1,
                    borderColor: day.isToday ? C.yellow : C.border,
                    backgroundColor: day.done ? C.yellow : C.bgEl,
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
              { label: 'SESIONES TOTALES', value: state.sessionsCount, color: C.yellow },
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
