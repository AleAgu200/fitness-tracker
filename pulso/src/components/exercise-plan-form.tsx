import { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import {
  BodyGender,
  BodySide,
  getAvailableMuscles,
  muscleDetailForSlug,
  MuscleGroup,
  PulsoBodyMap,
} from '@/components/body-map/pulso-body-map';
import { Label, PressableScale } from '@/components/ui/kit';
import { WorkoutXSearch } from '@/components/workoutx-search';
import { F, useColors, withAlpha } from '@/constants/colors';
import { WeightUnit } from '@/lib/settings';
import {
  DETAILED_MUSCLE_LABELS,
  DetailedMuscleKey,
  exerciseTargetsMuscle,
  inferExerciseMuscles,
  POPULAR_EXERCISES,
} from '@/lib/muscles';
import { displayWeight, formatWeight, toKg } from '@/lib/units';
import { WxSuggestion } from '@/lib/workoutx';

const MUSCLES: { key: MuscleGroup; label: string }[] = [
  { key: 'chest', label: 'PECHO' },
  { key: 'back', label: 'ESPALDA' },
  { key: 'legs', label: 'PIERNAS' },
  { key: 'shoulders', label: 'HOMBROS' },
  { key: 'arms', label: 'BRAZOS' },
  { key: 'core', label: 'CORE' },
  { key: 'full', label: 'FULL BODY' },
];

export interface ExercisePlanValues {
  nombre: string;
  target: number;
  reps: number;
  peso: number; // kg
  step: number;
}

/** An exercise already in whichever day's plan is being edited, for the muscle
 *  map's load display and popular-exercise dedup. `doneCount` only applies to
 *  today's plan (logged sets) — omit it for other days, it defaults to 0. */
export interface ExistingPlanExercise {
  id: string;
  nombre: string;
  muscleGroup: MuscleGroup | null;
  target: number;
  doneCount?: number;
}

interface ExercisePlanFormProps {
  /** Editing an existing exercise (skips the buscador/mapa picker, straight to config) vs adding a new one */
  editing: boolean;
  initial: ExercisePlanValues;
  weightUnit: WeightUnit;
  accent: string;
  existingExercises: ExistingPlanExercise[];
  profileSex?: 'M' | 'F' | 'X' | null;
  onCancel: () => void;
  onSave: (values: ExercisePlanValues) => void;
  onDelete?: () => void;
  onAddFromMap: (exercise: { name: string; sets: number; reps: number; weight: number; step: number }) => Promise<void>;
}

/**
 * Rich exercise picker (WorkoutX search + muscle-body map) shared by today's
 * session editor and the per-day week planner — every day of the week gets the
 * same search/map experience, not just today.
 */
export function ExercisePlanForm({
  editing, initial, weightUnit, accent, existingExercises, profileSex,
  onCancel, onSave, onDelete, onAddFromMap,
}: ExercisePlanFormProps) {
  const C = useColors();
  const [nombre, setNombre] = useState(initial.nombre);
  const [target, setTarget] = useState(String(initial.target));
  const [reps, setReps] = useState(String(initial.reps));
  const [peso, setPeso] = useState(String(displayWeight(initial.peso, weightUnit)));
  // Increment isn't user-editable in this form (matches the original UI), just carried through
  const [step] = useState(String(initial.step));

  const [selectedWorkoutX, setSelectedWorkoutX] = useState<WxSuggestion | null>(null);
  const [usingManualName, setUsingManualName] = useState(false);
  const [addMode, setAddMode] = useState<'buscador' | 'mapa'>('buscador');
  const [bodySide, setBodySide] = useState<BodySide>('front');
  const [bodyGender, setBodyGender] = useState<BodyGender>(profileSex === 'F' ? 'female' : 'male');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [muscleSlug, setMuscleSlug] = useState<string | null>(null);
  const [muscleQuery, setMuscleQuery] = useState('');
  const [addingSuggestion, setAddingSuggestion] = useState<string | null>(null);
  const [mapAddError, setMapAddError] = useState<string | null>(null);

  const canConfigureExercise = editing || selectedWorkoutX != null || usingManualName;

  // ── mapa muscular · agregar ejercicio por músculo ───────────────────────────
  const muscleStats = useMemo(() => MUSCLES.map(item => {
    const exs = existingExercises.filter(exercise => exercise.muscleGroup === item.key);
    const total = exs.reduce((sum, exercise) => sum + exercise.target, 0);
    const done = exs.reduce((sum, exercise) => sum + (exercise.doneCount ?? 0), 0);
    return { ...item, exercises: exs, target: total, done, load: total ? Math.min(1, done / total) : 0 };
  }), [existingExercises]);
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
      const relevant = existingExercises.filter(exercise =>
        exerciseTargetsMuscle(
          inferExerciseMuscles(exercise.nombre, exercise.muscleGroup),
          detail.key,
        ));
      const total = relevant.reduce((sum, exercise) => sum + exercise.target, 0);
      const done = relevant.reduce((sum, exercise) => sum + (exercise.doneCount ?? 0), 0);
      result[detail.key] = total ? Math.min(1, done / total) : 0;
    }
    return result;
  }, [availableMuscles, existingExercises]);
  const selectedTarget = selectedExercises.reduce((sum, exercise) => sum + exercise.target, 0);
  const selectedDone = selectedExercises.reduce((sum, exercise) => sum + (exercise.doneCount ?? 0), 0);

  function save() {
    onSave({
      nombre: nombre.trim(),
      target: Math.max(1, +target || 1),
      reps: Math.max(1, +reps || 1),
      peso: toKg(Math.max(0, +peso || 0), weightUnit),
      step: +step || 2.5,
    });
  }

  return (
    <Animated.View entering={FadeInDown.duration(280)} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: accent, padding: 14, marginBottom: 12 }}>
      <Label style={{ color: accent, marginBottom: 12 }}>
        {editing ? 'EDITAR EJERCICIO' : 'NUEVO EJERCICIO'}
      </Label>

      {!editing && (
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

      {(editing || addMode === 'buscador') && (
        <>
          <Label style={{ marginBottom: 6 }}>NOMBRE · BUSCAR EN WORKOUTX</Label>
          <TextInput
            value={nombre}
            onChangeText={v => {
              setSelectedWorkoutX(null);
              setUsingManualName(false);
              setNombre(v);
            }}
            placeholder="Ej: sentadilla, curl, press…"
            placeholderTextColor={C.textTertiary}
            style={{ backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 10, color: C.textPrimary, fontFamily: F.inter, fontSize: 14, marginBottom: 10 }}
          />

          <WorkoutXSearch
            query={nombre}
            enabled
            onSelect={suggestion => {
              setSelectedWorkoutX(suggestion);
              setUsingManualName(false);
              setNombre(suggestion.name);
            }}
          />

          {!editing && !canConfigureExercise && nombre.trim().length > 0 && (
            <PressableScale
              onPress={() => setUsingManualName(true)}
              style={{ borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, padding: 10, marginBottom: 12, alignItems: 'center' }}
            >
              <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textSecondary, textTransform: 'uppercase', textAlign: 'center' }}>
                USAR “{nombre.trim()}” COMO EJERCICIO MANUAL
              </Text>
            </PressableScale>
          )}
        </>
      )}

      {!editing && addMode === 'mapa' && (
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
                      {exercise.doneCount ?? 0}/{exercise.target} SETS
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
                    const exists = existingExercises.some(
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
                              await onAddFromMap(exercise);
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
            <View style={{ flex: 1 }}>
              <Label style={{ marginBottom: 6 }}>SERIES</Label>
              <TextInput
                keyboardType="numeric"
                value={target}
                onChangeText={setTarget}
                style={{ backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 9, color: C.textPrimary, fontFamily: F.monoBold, fontSize: 15, textAlign: 'center' }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Label style={{ marginBottom: 6 }}>REPS</Label>
              <TextInput
                keyboardType="numeric"
                value={reps}
                onChangeText={setReps}
                style={{ backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 9, color: C.textPrimary, fontFamily: F.monoBold, fontSize: 15, textAlign: 'center' }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Label style={{ marginBottom: 6 }}>{`PESO ${weightUnit}`}</Label>
              <TextInput
                keyboardType="numeric"
                value={peso}
                onChangeText={setPeso}
                style={{ backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 9, color: C.textPrimary, fontFamily: F.monoBold, fontSize: 15, textAlign: 'center' }}
              />
            </View>
          </View>
        </>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <PressableScale onPress={onCancel} style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 0.4, color: C.textSecondary, textTransform: 'uppercase' }}>CANCELAR</Text>
        </PressableScale>
        {canConfigureExercise && editing && onDelete && (
          <PressableScale onPress={onDelete} haptic="medium" style={{ paddingHorizontal: 13, padding: 12, borderWidth: 1, borderColor: C.red, backgroundColor: 'rgba(255,61,90,0.06)', alignItems: 'center' }}>
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.red, textTransform: 'uppercase' }}>ELIMINAR</Text>
          </PressableScale>
        )}
        {canConfigureExercise && (
          <PressableScale onPress={save} haptic="medium" style={{ flex: 1.5, padding: 12, backgroundColor: accent, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.monoXBold, fontSize: 11, letterSpacing: 0.6, color: C.bg, textTransform: 'uppercase' }}>
              {editing ? 'GUARDAR CAMBIOS' : 'AGREGAR AL PLAN'}
            </Text>
          </PressableScale>
        )}
      </View>
    </Animated.View>
  );
}
