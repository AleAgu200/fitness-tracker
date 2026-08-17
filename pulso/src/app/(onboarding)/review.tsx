import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { WizardShell } from '@/components/onboarding/wizard-shell';
import { Card, Label, PressableScale } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import {
  GenerationProfile,
  getGenerationProfile,
  setOnboardingStep,
} from '@/db/onboarding';
import { getAthleteProfile, getLatestWeight } from '@/db/profile';
import { formatWeight } from '@/lib/units';

type AthleteProfile = NonNullable<Awaited<ReturnType<typeof getAthleteProfile>>>;

const GOAL_LABELS: Record<string, string> = {
  fat_loss: 'Perder grasa',
  muscle_gain: 'Ganar músculo',
  strength: 'Más fuerza',
  recomposition: 'Recomposición',
  maintenance: 'Mantenimiento',
};

const PACE_LABELS: Record<string, string> = {
  slow: 'Gradual',
  moderate: 'Moderado',
  aggressive: 'Intenso',
};

const EXPERIENCE_LABELS: Record<string, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
};

const ACTIVITY_LABELS: Record<string, string> = {
  sedentary: 'Mayormente sentado',
  light: 'Actividad ligera',
  moderate: 'Actividad moderada',
  active: 'Muy activo',
  very_active: 'Actividad intensa diaria',
};

const LOCATION_LABELS: Record<string, string> = {
  gym: 'Gimnasio',
  home: 'Casa',
  outdoor: 'Al aire libre',
};

const DIET_LABELS: Record<string, string> = {
  omnivoro: 'Omnívoro',
  vegetariano: 'Vegetariano',
  vegano: 'Vegano',
  pescetariano: 'Pescetariano',
};

const COOKING_LABELS: Record<string, string> = {
  minimal: 'Mínimo',
  moderate: 'Moderado',
  flexible: 'Flexible',
};

const BUDGET_LABELS: Record<string, string> = {
  low: 'Ajustado',
  medium: 'Medio',
  high: 'Flexible',
};

function valueOrDash(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  return String(value);
}

function listOrNone(value: string[] | undefined): string {
  return value?.length ? value.join(', ') : 'Ninguno';
}

function parseStoredDob(value: string | null): Date | null {
  if (!value) return null;
  const local = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const day = local ? Number(local[1]) : iso ? Number(iso[3]) : NaN;
  const month = local ? Number(local[2]) : iso ? Number(iso[2]) : NaN;
  const year = local ? Number(local[3]) : iso ? Number(iso[1]) : NaN;
  if (![day, month, year].every(Number.isFinite)) return null;
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
}

function ageOn(dateOfBirth: Date, today = new Date()): number {
  let age = today.getFullYear() - dateOfBirth.getFullYear();
  if (
    today.getMonth() < dateOfBirth.getMonth() ||
    (today.getMonth() === dateOfBirth.getMonth() && today.getDate() < dateOfBirth.getDate())
  ) age -= 1;
  return age;
}

function SummaryRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  const C = useColors();
  return (
    <View
      style={{
        paddingVertical: 11,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: C.borderLight,
        gap: 4,
      }}
    >
      <Label>{label}</Label>
      <Text style={{ fontFamily: F.interMed, fontSize: 13, lineHeight: 18, color: value === '—' ? C.red : C.textPrimary }}>
        {value}
      </Text>
    </View>
  );
}

function ReviewSection({
  title,
  editPath,
  rows,
  index,
}: {
  title: string;
  editPath: string;
  rows: { label: string; value: string }[];
  index: number;
}) {
  const { accent } = usePreferences();
  const C = useColors();
  return (
    <Card index={index} style={{ marginBottom: 12, paddingHorizontal: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 1.2, color: accent }}>{title}</Text>
        <PressableScale
          onPress={() => router.push(editPath as never)}
          style={{ paddingHorizontal: 9, paddingVertical: 6, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl }}
        >
          <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.5, color: C.textSecondary }}>EDITAR</Text>
        </PressableScale>
      </View>
      {rows.map((row, rowIndex) => (
        <SummaryRow key={row.label} {...row} last={rowIndex === rows.length - 1} />
      ))}
    </Card>
  );
}

export default function OnboardingReviewScreen() {
  const { userId } = useSession();
  const { accent, weightUnit } = usePreferences();
  const C = useColors();
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [draft, setDraft] = useState<GenerationProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!userId) return () => { active = false; };

    Promise.all([
      setOnboardingStep(userId, 'review'),
      getAthleteProfile(userId),
      getLatestWeight(userId),
      getGenerationProfile(userId),
    ])
      .then(([, nextProfile, nextWeight, nextDraft]) => {
        if (!active) return;
        setProfile(nextProfile);
        setWeightKg(nextWeight);
        setDraft(nextDraft);
        setLoaded(true);
      })
      .catch(() => {
        if (active) {
          setError('No pudimos cargar el resumen. Intentá volver a esta pantalla.');
          setLoaded(true);
        }
      });

    return () => { active = false; };
  }, [userId]);

  const shownError = error ?? (!userId ? 'No encontramos una sesión activa.' : null);

  const birthDate = parseStoredDob(profile?.dateOfBirth ?? null);
  const age = birthDate ? ageOn(birthDate) : null;
  const missing: string[] = [];
  if (!profile?.sex || !birthDate || age == null || age < 1 || age >= 120 || !profile.heightCm || !weightKg) missing.push('datos corporales');
  if (!draft?.goal || !draft.pace) missing.push('objetivo');
  if (!draft?.experienceLevel || !draft.daysPerWeek || !draft.sessionMinutes || !draft.activityOutsideTraining || !draft.trainingLocation || !draft.availableEquipment?.length) missing.push('entrenamiento');
  if (!draft?.dietaryStyle || !draft.mealsPerDay || !draft.cookingTimeBudget || !draft.budgetLevel) missing.push('alimentación');
  if (!draft?.consentedToExternalProcessing) missing.push('permiso para generar el plan');

  async function generatePlan() {
    if (!userId || missing.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      await setOnboardingStep(userId, 'review');
      router.push('/(onboarding)/generating' as never);
    } catch {
      setError('No pudimos guardar tu avance. Intentá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  const profileRows = [
    { label: 'NOMBRE', value: valueOrDash(profile?.fullName) },
    { label: 'SEXO', value: profile?.sex ? ({ M: 'Hombre', F: 'Mujer', X: 'Otro' } as const)[profile.sex] : '—' },
    { label: 'NACIMIENTO / EDAD', value: profile?.dateOfBirth && age != null ? `${profile.dateOfBirth} · ${age} años` : '—' },
    { label: 'ALTURA', value: profile?.heightCm ? `${profile.heightCm} cm` : '—' },
    { label: 'PESO ACTUAL', value: weightKg != null ? formatWeight(weightKg, weightUnit) : '—' },
    { label: 'PESO META', value: profile?.goalWeightKg != null ? formatWeight(profile.goalWeightKg, weightUnit) : '—' },
  ];

  const goalRows = [
    { label: 'OBJETIVO', value: draft?.goal ? GOAL_LABELS[draft.goal] : '—' },
    { label: 'RITMO', value: draft?.pace ? PACE_LABELS[draft.pace] : '—' },
  ];

  const trainingRows = [
    { label: 'EXPERIENCIA', value: draft?.experienceLevel ? EXPERIENCE_LABELS[draft.experienceLevel] : '—' },
    { label: 'FRECUENCIA', value: draft?.daysPerWeek ? `${draft.daysPerWeek} días por semana` : '—' },
    { label: 'DURACIÓN', value: draft?.sessionMinutes ? `${draft.sessionMinutes} minutos` : '—' },
    { label: 'ACTIVIDAD DIARIA', value: draft?.activityOutsideTraining ? ACTIVITY_LABELS[draft.activityOutsideTraining] : '—' },
    { label: 'LUGAR', value: draft?.trainingLocation ? LOCATION_LABELS[draft.trainingLocation] : '—' },
    { label: 'EQUIPO', value: listOrNone(draft?.availableEquipment) },
    { label: 'LIMITACIONES', value: listOrNone(draft?.injuriesAndLimitations) },
    { label: 'EJERCICIOS EXCLUIDOS', value: listOrNone(draft?.excludedExercises) },
  ];

  const nutritionRows = [
    { label: 'ESTILO', value: draft?.dietaryStyle ? DIET_LABELS[draft.dietaryStyle] : '—' },
    { label: 'COMIDAS', value: draft?.mealsPerDay ? `${draft.mealsPerDay} al día` : '—' },
    { label: 'HORARIOS', value: listOrNone(draft?.preferredMealTimes) },
    { label: 'ALERGIAS', value: listOrNone(draft?.allergies) },
    { label: 'INTOLERANCIAS', value: listOrNone(draft?.intolerances) },
    { label: 'ALIMENTOS A EVITAR', value: listOrNone(draft?.dislikedFoods) },
    { label: 'TIEMPO DE COCINA', value: draft?.cookingTimeBudget ? COOKING_LABELS[draft.cookingTimeBudget] : '—' },
    { label: 'PRESUPUESTO', value: draft?.budgetLevel ? BUDGET_LABELS[draft.budgetLevel] : '—' },
  ];

  const consentRows = [
    { label: 'PROCESAMIENTO EXTERNO', value: draft?.consentedToExternalProcessing ? 'Autorizado' : 'Pendiente' },
  ];

  return (
    <WizardShell
      stepIndex={7}
      title="Revisá antes de generar"
      subtitle="Confirmá que todo esté correcto. Podés editar cualquier sección sin perder el resto de tus respuestas."
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/(onboarding)/safety' as never))}
      onNext={generatePlan}
      canProceed={loaded && missing.length === 0 && Boolean(userId)}
      nextLabel="GENERAR PLAN"
      busy={busy}
    >
      {!loaded && userId ? (
        <View style={{ paddingVertical: 36, alignItems: 'center' }}>
          <ActivityIndicator color={accent} />
        </View>
      ) : loaded ? (
        <>
          <ReviewSection title="TU CUERPO" editPath="/(onboarding)/body" rows={profileRows} index={0} />
          <ReviewSection title="TU OBJETIVO" editPath="/(onboarding)/goal" rows={goalRows} index={1} />
          <ReviewSection title="ENTRENAMIENTO" editPath="/(onboarding)/training" rows={trainingRows} index={2} />
          <ReviewSection title="ALIMENTACIÓN" editPath="/(onboarding)/nutrition" rows={nutritionRows} index={3} />
          <ReviewSection title="GENERACIÓN CON IA" editPath="/(onboarding)/safety" rows={consentRows} index={4} />

          {missing.length ? (
            <View style={{ padding: 13, borderWidth: 1, borderColor: C.orange, backgroundColor: withAlpha(C.orange, 0.07) }}>
              <Text style={{ fontFamily: F.interSemi, fontSize: 12, color: C.orange, marginBottom: 4 }}>
                Faltan respuestas para generar el plan
              </Text>
              <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textSecondary }}>
                Revisá: {missing.join(', ')}.
              </Text>
            </View>
          ) : (
            <View style={{ padding: 13, borderWidth: 1, borderColor: accent, backgroundColor: withAlpha(accent, 0.06) }}>
              <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textSecondary }}>
                Al tocar “Generar plan” enviaremos únicamente los datos necesarios para crear tu propuesta. Todavía podrás rechazarla antes de aplicarla.
              </Text>
            </View>
          )}
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
