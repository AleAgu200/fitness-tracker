import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { SectionHeader } from '@/components/onboarding/section-header';
import { WizardShell } from '@/components/onboarding/wizard-shell';
import { ChipSelect } from '@/components/ui/chip-select';
import { PressableScale } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import {
  getGenerationProfile,
  Goal,
  Pace,
  saveGenerationProfileDraft,
  setOnboardingStep,
} from '@/db/onboarding';

interface GoalOption {
  value: Goal;
  label: string;
  summary: string;
  training: string;
  nutrition: string;
}

// Each goal says what it changes in the plan, so the choice is informed rather
// than a label. Shown expanded when selected.
const GOAL_OPTIONS: GoalOption[] = [
  {
    value: 'fat_loss',
    label: 'Perder grasa',
    summary: 'Bajar grasa conservando músculo.',
    training: 'Fuerza para mantener músculo + gasto extra con circuitos o cardio.',
    nutrition: 'Déficit calórico moderado con proteína alta para no perder masa muscular.',
  },
  {
    value: 'muscle_gain',
    label: 'Ganar músculo',
    summary: 'Más masa muscular, con la menor grasa posible.',
    training: 'Hipertrofia: volumen progresivo, 8–12 repeticiones, más series por músculo.',
    nutrition: 'Superávit pequeño y proteína alta repartida en el día.',
  },
  {
    value: 'strength',
    label: 'Más fuerza',
    summary: 'Levantar más en los ejercicios básicos.',
    training: 'Básicos pesados (sentadilla, press, peso muerto), menos repeticiones y descansos largos.',
    nutrition: 'Calorías de mantenimiento o leve superávit para rendir y recuperar.',
  },
  {
    value: 'recomposition',
    label: 'Recomposición',
    summary: 'Bajar grasa y ganar músculo a la vez, más lento.',
    training: 'Fuerza e hipertrofia con progresión constante.',
    nutrition: 'Cerca del mantenimiento, proteína alta. Funciona mejor si recién empezás o volvés.',
  },
  {
    value: 'maintenance',
    label: 'Mantenerme',
    summary: 'Sostener tu estado actual con hábitos firmes.',
    training: 'Rutina equilibrada de fuerza y acondicionamiento.',
    nutrition: 'Calorías de mantenimiento, flexibles según tu actividad.',
  },
];

const PACE_OPTIONS = [
  { label: 'Gradual', value: 'slow' },
  { label: 'Moderado', value: 'moderate' },
  { label: 'Intenso', value: 'aggressive' },
];

/** What a pace means for the chosen goal, in plain numbers. */
function paceDetail(goal: Goal | null, pace: Pace | null): string | null {
  if (!goal || !pace) return null;
  if (goal === 'maintenance') return 'Con este objetivo el ritmo solo ajusta qué tan exigentes son las sesiones.';
  const byGoal: Partial<Record<Goal, Record<Pace, string>>> = {
    fat_loss: {
      slow: 'Alrededor de 0,25 kg por semana. Más fácil de sostener y con menos hambre.',
      moderate: 'Alrededor de 0,5 kg por semana. El equilibrio más común.',
      aggressive: 'Hasta ~0,75–1 kg por semana. Exige más; lo limitamos si tus datos no lo permiten.',
    },
    muscle_gain: {
      slow: 'Superávit pequeño: menos grasa ganada, progreso visible en meses.',
      moderate: 'Superávit moderado: progreso más rápido con algo de grasa.',
      aggressive: 'Superávit amplio: útil si te cuesta subir de peso.',
    },
    strength: {
      slow: 'Progresión de cargas conservadora, ideal si volvés de una pausa.',
      moderate: 'Subís carga semana a semana cuando completás las repeticiones.',
      aggressive: 'Progresión agresiva con más días pesados; requiere buen descanso.',
    },
    recomposition: {
      slow: 'Cambios lentos y sostenibles; la balanza casi no se mueve.',
      moderate: 'Ligero déficit los días de descanso y mantenimiento al entrenar.',
      aggressive: 'Más exigente en entrenamiento; el déficit sigue siendo pequeño.',
    },
  };
  return byGoal[goal]?.[pace] ?? null;
}

export default function OnboardingGoalScreen() {
  const { userId } = useSession();
  const { accent } = usePreferences();
  const C = useColors();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [pace, setPace] = useState<Pace | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!userId) return () => { active = false; };

    Promise.all([
      setOnboardingStep(userId, 'goal'),
      getGenerationProfile(userId),
    ])
      .then(([, draft]) => {
        if (!active) return;
        setGoal(draft?.goal ?? null);
        setPace(draft?.pace ?? null);
        setLoaded(true);
      })
      .catch(() => {
        if (active) {
          setError('No pudimos cargar tus respuestas guardadas.');
          setLoaded(true);
        }
      });

    return () => { active = false; };
  }, [userId]);

  const shownError = error ?? (!userId ? 'No encontramos una sesión activa.' : null);

  async function saveAndContinue() {
    if (!userId || !goal || !pace || saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveGenerationProfileDraft(userId, { goal, pace });
      router.push('/(onboarding)/training' as never);
    } catch {
      setError('No pudimos guardar tu objetivo. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <WizardShell
      stepIndex={3}
      title="¿Qué querés conseguir?"
      subtitle="Tu objetivo define el enfoque del entrenamiento y las estimaciones de energía."
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/(onboarding)/body' as never))}
      onNext={saveAndContinue}
      canProceed={loaded && Boolean(goal && pace && userId)}
      busy={saving}
    >
      {!loaded && userId ? (
        <View style={{ paddingVertical: 36, alignItems: 'center' }}>
          <ActivityIndicator color={accent} />
        </View>
      ) : loaded ? (
        <>
          <SectionHeader label="OBJETIVO PRINCIPAL" />
          <View style={{ gap: 8 }} accessibilityRole="radiogroup">
            {GOAL_OPTIONS.map(option => {
              const selected = goal === option.value;
              return (
                <PressableScale
                  key={option.value}
                  onPress={() => setGoal(option.value)}
                  accessibilityRole="radio"
                  selected={selected}
                  accessibilityLabel={`${option.label}. ${option.summary}`}
                  style={{
                    padding: 14,
                    borderWidth: 1,
                    borderColor: selected ? accent : C.border,
                    backgroundColor: selected ? withAlpha(accent, 0.07) : C.card,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 18, height: 18, borderWidth: 1, borderColor: selected ? accent : C.textTertiary, alignItems: 'center', justifyContent: 'center' }}>
                      {selected && <View style={{ width: 10, height: 10, backgroundColor: accent }} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: F.interSemi, fontSize: 15, color: C.textPrimary }}>{option.label}</Text>
                      <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 17, color: C.textSecondary, marginTop: 2 }}>{option.summary}</Text>
                    </View>
                  </View>
                  {selected && (
                    <Animated.View entering={FadeIn.duration(200)} style={{ marginTop: 12, marginLeft: 30, gap: 8 }}>
                      <View>
                        <Text style={{ fontFamily: F.monoBold, fontSize: 9, letterSpacing: 1, color: C.cyan }}>ENTRENAMIENTO</Text>
                        <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textMid, marginTop: 2 }}>{option.training}</Text>
                      </View>
                      <View>
                        <Text style={{ fontFamily: F.monoBold, fontSize: 9, letterSpacing: 1, color: C.cyan }}>NUTRICIÓN</Text>
                        <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textMid, marginTop: 2 }}>{option.nutrition}</Text>
                      </View>
                    </Animated.View>
                  )}
                </PressableScale>
              );
            })}
          </View>

          <View style={{ height: 28 }} />
          <SectionHeader label="RITMO PREFERIDO" />
          <ChipSelect
            options={PACE_OPTIONS}
            selected={pace ?? ''}
            onChange={next => setPace(typeof next === 'string' ? next as Pace : null)}
          />
          {paceDetail(goal, pace) && (
            <Animated.View key={`${goal}-${pace}`} entering={FadeIn.duration(180)} accessibilityLiveRegion="polite" style={{ marginTop: 10, flexDirection: 'row', gap: 10 }}>
              <View style={{ width: 2, backgroundColor: accent }} />
              <Text style={{ flex: 1, fontFamily: F.inter, fontSize: 13, lineHeight: 19, color: C.textMid }}>{paceDetail(goal, pace)}</Text>
            </Animated.View>
          )}

          <View
            style={{
              marginTop: 18,
              padding: 14,
              borderWidth: 1,
              borderColor: C.border,
              backgroundColor: withAlpha(accent, 0.06),
            }}
          >
            <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary, marginBottom: 5 }}>
              Un ritmo intenso no siempre es mejor
            </Text>
            <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textSecondary }}>
              PULSO respeta límites mínimos de energía. Si el ritmo elegido no es seguro para tus datos, se ajustará y quedará indicado en el plan.
            </Text>
          </View>
        </>
      ) : null}

      {shownError ? (
        <View style={{ marginTop: 16, padding: 12, borderWidth: 1, borderColor: C.red, backgroundColor: withAlpha(C.red, 0.08) }}>
          <Text style={{ fontFamily: F.interMed, fontSize: 12, lineHeight: 18, color: C.red }}>{shownError}</Text>
        </View>
      ) : null}
    </WizardShell>
  );
}
