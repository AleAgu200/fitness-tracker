import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { FieldLabel, SectionHeader } from '@/components/onboarding/section-header';
import { WizardShell } from '@/components/onboarding/wizard-shell';
import { ChipSelect, FreeTextChipInput } from '@/components/ui/chip-select';
import { PressableScale } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import {
  BudgetLevel,
  CookingTimeBudget,
  DietaryStyle,
  getGenerationProfile,
  saveGenerationProfileDraft,
  setOnboardingStep,
} from '@/db/onboarding';

const DIET_OPTIONS = [
  { label: 'Omnívoro', value: 'omnivoro' },
  { label: 'Vegetariano', value: 'vegetariano' },
  { label: 'Vegano', value: 'vegano' },
  { label: 'Pescetariano', value: 'pescetariano' },
];

const COOKING_OPTIONS = [
  { label: 'Mínimo', value: 'minimal' },
  { label: 'Moderado', value: 'moderate' },
  { label: 'Flexible', value: 'flexible' },
];

const BUDGET_OPTIONS = [
  { label: 'Ajustado', value: 'low' },
  { label: 'Medio', value: 'medium' },
  { label: 'Flexible', value: 'high' },
];

const LATIN_OPTIONS = [
  { label: 'Sí, priorizalos', value: 'yes' },
  { label: 'No es necesario', value: 'no' },
];

function MealsStepper({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const { accent } = usePreferences();
  const C = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border, backgroundColor: C.card }}>
      <PressableScale
        onPress={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        style={{ width: 52, height: 50, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: C.border }}
      >
        <Text style={{ fontFamily: F.monoBold, fontSize: 18, color: C.textSecondary }}>−</Text>
      </PressableScale>
      <View style={{ flex: 1, height: 50, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 16, color: accent }}>
          {value} <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary }}>COMIDAS</Text>
        </Text>
      </View>
      <PressableScale
        onPress={() => onChange(Math.min(8, value + 1))}
        disabled={value >= 8}
        style={{ width: 52, height: 50, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: C.border }}
      >
        <Text style={{ fontFamily: F.monoBold, fontSize: 18, color: C.textSecondary }}>+</Text>
      </PressableScale>
    </View>
  );
}

function validMealTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
}

export default function OnboardingNutritionScreen() {
  const { userId } = useSession();
  const { accent } = usePreferences();
  const C = useColors();

  const [dietaryStyle, setDietaryStyle] = useState<DietaryStyle | null>(null);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [intolerances, setIntolerances] = useState<string[]>([]);
  const [dislikedFoods, setDislikedFoods] = useState<string[]>([]);
  const [mealsPerDay, setMealsPerDay] = useState(3);
  const [preferredMealTimes, setPreferredMealTimes] = useState<string[]>([]);
  const [cookingTime, setCookingTime] = useState<CookingTimeBudget | null>(null);
  const [budget, setBudget] = useState<BudgetLevel | null>(null);
  const [latinPreference, setLatinPreference] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!userId) return () => { active = false; };

    Promise.all([
      setOnboardingStep(userId, 'nutrition'),
      getGenerationProfile(userId),
    ])
      .then(([, draft]) => {
        if (!active) return;
        setDietaryStyle(draft?.dietaryStyle ?? null);
        setAllergies(draft?.allergies ?? []);
        setIntolerances(draft?.intolerances ?? []);
        setDislikedFoods(draft?.dislikedFoods ?? []);
        setMealsPerDay(Math.min(8, Math.max(1, draft?.mealsPerDay ?? 3)));
        setPreferredMealTimes(draft?.preferredMealTimes ?? []);
        setCookingTime(draft?.cookingTimeBudget ?? null);
        setBudget(draft?.budgetLevel ?? null);
        setLatinPreference(draft?.hondurasLatinPreference ?? null);
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
    if (!dietaryStyle || !cookingTime || !budget || latinPreference == null) {
      setError('Completá el estilo de alimentación, tiempo de cocina, presupuesto y preferencia regional.');
      return;
    }
    const invalidTime = preferredMealTimes.find(time => !validMealTime(time));
    if (invalidTime) {
      setError(`Revisá el horario “${invalidTime}”. Usá el formato de 24 horas HH:MM.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await saveGenerationProfileDraft(userId, {
        dietaryStyle,
        allergies,
        intolerances,
        dislikedFoods,
        mealsPerDay,
        preferredMealTimes,
        cookingTimeBudget: cookingTime,
        budgetLevel: budget,
        hondurasLatinPreference: latinPreference,
      });
      router.push('/(onboarding)/safety' as never);
    } catch {
      setError('No pudimos guardar tus preferencias de alimentación.');
    } finally {
      setSaving(false);
    }
  }

  const complete = Boolean(dietaryStyle && cookingTime && budget && latinPreference != null);

  return (
    <WizardShell
      stepIndex={5}
      title="Comidas que encajen con vos"
      subtitle="Usaremos estas respuestas para filtrar alimentos antes de crear cualquier sugerencia."
      onBack={() => router.back()}
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
          <SectionHeader label="ESTILO DE ALIMENTACIÓN" />
          <ChipSelect
            options={DIET_OPTIONS}
            selected={dietaryStyle ?? ''}
            onChange={next => setDietaryStyle(typeof next === 'string' ? next as DietaryStyle : null)}
          />

          <View style={{ height: 26 }} />
          <SectionHeader label="RESTRICCIONES" />
          <FieldLabel>ALERGIAS</FieldLabel>
          <FreeTextChipInput value={allergies} onChange={setAllergies} placeholder="Ej. maní" addLabel="AGREGAR" />
          <View style={{ height: 15 }} />
          <FieldLabel>INTOLERANCIAS</FieldLabel>
          <FreeTextChipInput value={intolerances} onChange={setIntolerances} placeholder="Ej. lactosa" addLabel="AGREGAR" />
          <View style={{ height: 15 }} />
          <FieldLabel>ALIMENTOS QUE NO TE GUSTAN</FieldLabel>
          <FreeTextChipInput value={dislikedFoods} onChange={setDislikedFoods} placeholder="Ej. atún" addLabel="EVITAR" />
          <Text style={{ fontFamily: F.inter, fontSize: 11, lineHeight: 16, color: C.textTertiary, marginTop: 7 }}>
            Agregá un alimento por vez. Podés dejar cualquier lista vacía.
          </Text>

          <View style={{ height: 26 }} />
          <SectionHeader label="RUTINA DE COMIDAS" />
          <FieldLabel>COMIDAS POR DÍA</FieldLabel>
          <MealsStepper value={mealsPerDay} onChange={setMealsPerDay} />
          <View style={{ height: 15 }} />
          <FieldLabel>HORARIOS PREFERIDOS (OPCIONAL)</FieldLabel>
          <FreeTextChipInput
            value={preferredMealTimes}
            onChange={setPreferredMealTimes}
            placeholder="Ej. 07:30"
            addLabel="AGREGAR"
            maxLength={5}
          />

          <View style={{ height: 26 }} />
          <SectionHeader label="PREFERENCIAS PRÁCTICAS" />
          <FieldLabel>TIEMPO PARA COCINAR</FieldLabel>
          <ChipSelect
            options={COOKING_OPTIONS}
            selected={cookingTime ?? ''}
            onChange={next => setCookingTime(typeof next === 'string' ? next as CookingTimeBudget : null)}
          />
          <View style={{ height: 15 }} />
          <FieldLabel>PRESUPUESTO</FieldLabel>
          <ChipSelect
            options={BUDGET_OPTIONS}
            selected={budget ?? ''}
            onChange={next => setBudget(typeof next === 'string' ? next as BudgetLevel : null)}
          />
          <View style={{ height: 15 }} />
          <FieldLabel>¿PRIORIZAR SABORES E INGREDIENTES DE HONDURAS Y LATINOAMÉRICA?</FieldLabel>
          <ChipSelect
            options={LATIN_OPTIONS}
            selected={latinPreference == null ? '' : latinPreference ? 'yes' : 'no'}
            onChange={next => setLatinPreference(next === 'yes')}
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
