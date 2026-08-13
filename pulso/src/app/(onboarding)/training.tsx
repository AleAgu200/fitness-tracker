import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { FieldLabel, SectionHeader } from '@/components/onboarding/section-header';
import { WizardShell } from '@/components/onboarding/wizard-shell';
import { ChipSelect, FreeTextChipInput } from '@/components/ui/chip-select';
import { DurationPickerField } from '@/components/ui/duration-picker-field';
import { PressableScale } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import {
  ActivityLevel,
  ExperienceLevel,
  getGenerationProfile,
  saveGenerationProfileDraft,
  setOnboardingStep,
  TrainingLocation,
} from '@/db/onboarding';

const EXPERIENCE_OPTIONS = [
  { label: 'Principiante', value: 'beginner' },
  { label: 'Intermedio', value: 'intermediate' },
  { label: 'Avanzado', value: 'advanced' },
];

const ACTIVITY_OPTIONS = [
  { label: 'Mayormente sentado', value: 'sedentary' },
  { label: 'Actividad ligera', value: 'light' },
  { label: 'Actividad moderada', value: 'moderate' },
  { label: 'Muy activo', value: 'active' },
  { label: 'Actividad intensa diaria', value: 'very_active' },
];

const LOCATION_OPTIONS = [
  { label: 'Gimnasio', value: 'gym' },
  { label: 'Casa', value: 'home' },
  { label: 'Al aire libre', value: 'outdoor' },
];

// Values intentionally match server/lib/library.ts's EQUIPMENT vocabulary.
const EQUIPMENT_OPTIONS = [
  { label: 'Peso corporal', value: 'peso corporal' },
  { label: 'Mancuernas', value: 'mancuernas' },
  { label: 'Barra', value: 'barra' },
  { label: 'Polea', value: 'polea' },
  { label: 'Máquinas', value: 'máquina' },
  { label: 'Otro', value: 'otro' },
];

function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix: string;
}) {
  const { accent } = usePreferences();
  const C = useColors();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border, backgroundColor: C.card }}>
      <PressableScale
        onPress={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: C.border }}
      >
        <Text style={{ fontFamily: F.monoBold, fontSize: 18, color: C.textSecondary }}>−</Text>
      </PressableScale>
      <View style={{ flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 16, color: accent }}>
          {value} <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary }}>{suffix}</Text>
        </Text>
      </View>
      <PressableScale
        onPress={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: C.border }}
      >
        <Text style={{ fontFamily: F.monoBold, fontSize: 18, color: C.textSecondary }}>+</Text>
      </PressableScale>
    </View>
  );
}

export default function OnboardingTrainingScreen() {
  const { userId } = useSession();
  const { accent } = usePreferences();
  const C = useColors();

  const [experience, setExperience] = useState<ExperienceLevel | null>(null);
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [sessionMinutes, setSessionMinutes] = useState(60);
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [location, setLocation] = useState<TrainingLocation | null>(null);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [injuries, setInjuries] = useState<string[]>([]);
  const [excludedExercises, setExcludedExercises] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!userId) return () => { active = false; };

    Promise.all([
      setOnboardingStep(userId, 'training'),
      getGenerationProfile(userId),
    ])
      .then(([, draft]) => {
        if (!active) return;
        setExperience(draft?.experienceLevel ?? null);
        setDaysPerWeek(Math.min(7, Math.max(1, draft?.daysPerWeek ?? 3)));
        setSessionMinutes(Math.min(180, Math.max(15, draft?.sessionMinutes ?? 60)));
        setActivity(draft?.activityOutsideTraining ?? null);
        setLocation(draft?.trainingLocation ?? null);
        setEquipment(draft?.availableEquipment ?? []);
        setInjuries(draft?.injuriesAndLimitations ?? []);
        setExcludedExercises(draft?.excludedExercises ?? []);
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
    if (!userId || saving) return;
    if (!experience || !activity || !location) {
      setError('Completá experiencia, actividad diaria y lugar de entrenamiento.');
      return;
    }
    if (equipment.length === 0) {
      setError('Seleccioná al menos una opción de equipo. Elegí “Peso corporal” si no tenés equipo.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await saveGenerationProfileDraft(userId, {
        experienceLevel: experience,
        daysPerWeek,
        sessionMinutes,
        activityOutsideTraining: activity,
        availableEquipment: equipment,
        trainingLocation: location,
        injuriesAndLimitations: injuries,
        excludedExercises,
      });
      router.push('/(onboarding)/nutrition' as never);
    } catch {
      setError('No pudimos guardar tus preferencias de entrenamiento.');
    } finally {
      setSaving(false);
    }
  }

  const complete = Boolean(experience && activity && location && equipment.length > 0);

  return (
    <WizardShell
      stepIndex={4}
      title="Diseñemos tu entrenamiento"
      subtitle="Contanos cuánto tiempo tenés, tu experiencia y con qué podés entrenar."
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/(onboarding)/goal' as never))}
      onNext={saveAndContinue}
      canProceed={loaded && complete && Boolean(userId)}
      busy={saving}
    >
      {!loaded && userId ? (
        <View style={{ paddingVertical: 36, alignItems: 'center' }}>
          <ActivityIndicator color={accent} />
        </View>
      ) : loaded ? (
        <>
          <SectionHeader label="EXPERIENCIA" />
          <ChipSelect
            options={EXPERIENCE_OPTIONS}
            selected={experience ?? ''}
            onChange={next => setExperience(typeof next === 'string' ? next as ExperienceLevel : null)}
          />

          <View style={{ height: 26 }} />
          <SectionHeader label="DISPONIBILIDAD" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <FieldLabel>DÍAS POR SEMANA</FieldLabel>
              <Stepper value={daysPerWeek} onChange={setDaysPerWeek} min={1} max={7} suffix="DÍAS" />
            </View>
            <View style={{ flex: 1 }}>
              <FieldLabel>MINUTOS POR SESIÓN</FieldLabel>
              <DurationPickerField
                value={sessionMinutes}
                onChange={setSessionMinutes}
                min={15}
                max={180}
                step={15}
              />
            </View>
          </View>
          <Text style={{ fontFamily: F.inter, fontSize: 11, lineHeight: 16, color: C.textTertiary, marginTop: 7 }}>
            Los minutos se ajustan en bloques de 15. Podés afinarlos después en tu plan.
          </Text>

          <View style={{ height: 26 }} />
          <SectionHeader label="ACTIVIDAD FUERA DEL ENTRENO" />
          <ChipSelect
            options={ACTIVITY_OPTIONS}
            selected={activity ?? ''}
            onChange={next => setActivity(typeof next === 'string' ? next as ActivityLevel : null)}
          />

          <View style={{ height: 26 }} />
          <SectionHeader label="LUGAR Y EQUIPO" />
          <FieldLabel>LUGAR PRINCIPAL</FieldLabel>
          <ChipSelect
            options={LOCATION_OPTIONS}
            selected={location ?? ''}
            onChange={next => setLocation(typeof next === 'string' ? next as TrainingLocation : null)}
          />
          <View style={{ height: 16 }} />
          <FieldLabel>EQUIPO DISPONIBLE</FieldLabel>
          <ChipSelect
            options={EQUIPMENT_OPTIONS}
            selected={equipment}
            onChange={next => setEquipment(Array.isArray(next) ? next : [])}
            multi
          />

          <View style={{ height: 26 }} />
          <SectionHeader label="LÍMITES" />
          <FieldLabel>LESIONES O LIMITACIONES</FieldLabel>
          <FreeTextChipInput
            value={injuries}
            onChange={setInjuries}
            placeholder="Ej. piernas, hombros, espalda"
            addLabel="AGREGAR"
          />
          <Text style={{ fontFamily: F.inter, fontSize: 11, lineHeight: 16, color: C.textTertiary, marginTop: 7 }}>
            Agregá una zona por vez. Dejalo vacío si no tenés limitaciones.
          </Text>

          <View style={{ height: 16 }} />
          <FieldLabel>EJERCICIOS QUE NO QUERÉS HACER</FieldLabel>
          <FreeTextChipInput
            value={excludedExercises}
            onChange={setExcludedExercises}
            placeholder="Ej. burpees"
            addLabel="EXCLUIR"
          />
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
