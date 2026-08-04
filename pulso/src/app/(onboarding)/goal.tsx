import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { SectionHeader } from '@/components/onboarding/section-header';
import { WizardShell } from '@/components/onboarding/wizard-shell';
import { ChipSelect } from '@/components/ui/chip-select';
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

const GOAL_OPTIONS = [
  { label: 'Perder grasa', value: 'fat_loss' },
  { label: 'Ganar músculo', value: 'muscle_gain' },
  { label: 'Más fuerza', value: 'strength' },
  { label: 'Recomposición', value: 'recomposition' },
  { label: 'Mantenerme', value: 'maintenance' },
];

const PACE_OPTIONS = [
  { label: 'Gradual', value: 'slow' },
  { label: 'Moderado', value: 'moderate' },
  { label: 'Intenso', value: 'aggressive' },
];

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
      onBack={() => router.back()}
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
          <ChipSelect
            options={GOAL_OPTIONS}
            selected={goal ?? ''}
            onChange={next => setGoal(typeof next === 'string' ? next as Goal : null)}
          />

          <View style={{ height: 28 }} />
          <SectionHeader label="RITMO PREFERIDO" />
          <ChipSelect
            options={PACE_OPTIONS}
            selected={pace ?? ''}
            onChange={next => setPace(typeof next === 'string' ? next as Pace : null)}
          />

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
