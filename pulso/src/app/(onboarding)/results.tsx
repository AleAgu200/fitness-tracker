import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Label, PressableScale } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import { useApp } from '@/context/app-state';
import { EligibleFood, useOnboardingGeneration } from '@/context/onboarding-generation';
import { useSession } from '@/context/session';
import {
  clearGenerationProfile,
  completeOnboarding,
  setOnboardingStepIfInProgress,
} from '@/db/onboarding';
import { MealDraft, getMealPlan, replaceWeekMealSlots } from '@/db/nutrition';
import { AssignedExercise, getPlan, replacePlanExercises } from '@/db/plan';
import { weekdayOf } from '@/lib/dates';

function catalogKey(source: string, id: string): string {
  return `${source}:${id}`;
}

/** Server plans use 1=Monday; the mobile database uses 1=Sunday. */
function toMobileWeekday(serverWeekday: number): number {
  return serverWeekday === 7 ? 1 : serverWeekday + 1;
}

function requireFoodName(foodMap: Map<string, EligibleFood>, source: string, id: string): string {
  const name = foodMap.get(catalogKey(source, id))?.name;
  if (!name) throw new Error('food_not_found');
  return name;
}

export default function ResultsScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId } = useSession();
  const { reloadAll } = useApp();
  const { initialized, result, consumeGeneration } = useOnboardingGeneration();
  const [accepting, setAccepting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    void setOnboardingStepIfInProgress(userId, 'results').catch(error => {
      console.warn('[onboarding] results step save failed', error);
    });
  }, [userId]);

  const acceptPlan = useCallback(async () => {
    if (!userId || !result || accepting) return;
    setAccepting(true);
    setError(null);

    try {
      const exerciseMap = new Map(result.eligibleExercises.map(exercise => [exercise.id, exercise]));
      const foodMap = new Map(
        result.eligibleFoods.map(food => [catalogKey(food.source, food.id), food]),
      );

      // Resolve and validate the complete payload before the first destructive
      // replacement. This keeps catalog mismatches from leaving a partial plan.
      const exercisesByWeekday = new Map<number, AssignedExercise[]>();
      for (const day of result.plan.workout.days) {
        const items: AssignedExercise[] = day.exercises.map(exercise => {
          const catalogExercise = exerciseMap.get(exercise.exerciseId);
          if (!catalogExercise) throw new Error('exercise_not_found');
          return {
            nombre: catalogExercise.name,
            target: exercise.sets,
            reps: exercise.repsMin,
            peso: 0,
            step: exercise.progressionIncrementKg,
            restSeconds: exercise.restSeconds,
            gifPath: catalogExercise.gifPath,
            instructions: catalogExercise.instructions,
          };
        });
        const mobileWeekday = toMobileWeekday(day.weekday);
        if (exercisesByWeekday.has(mobileWeekday)) throw new Error('duplicate_weekday');
        exercisesByWeekday.set(mobileWeekday, items);
      }

      // The plan now carries a full week of meals, each day already fitted to
      // the same daily targets.
      const week = result.plan.week.map(day => ({
        weekday: toMobileWeekday(day.weekday),
        meals: day.meals.map<MealDraft>(meal => ({
          label: meal.label,
          time: meal.time,
          n: meal.items
            .map(item => `${requireFoodName(foodMap, item.source, item.foodId)} (${Math.round(item.grams)} g)`)
            .join(', '),
          kcal: Math.round(meal.totals.kcal),
          p: Math.round(meal.totals.proteinGrams),
          c: Math.round(meal.totals.carbsGrams),
          g: Math.round(meal.totals.fatGrams),
        })),
      }));

      // Replace all seven days so a rest day cannot retain exercises from a
      // previous or interrupted attempt. Each replacement is retry-safe.
      for (let mobileWeekday = 1; mobileWeekday <= 7; mobileWeekday += 1) {
        const { templateId } = await getPlan(userId, mobileWeekday);
        await replacePlanExercises(
          userId,
          templateId,
          exercisesByWeekday.get(mobileWeekday) ?? [],
        );
      }

      const { mealPlanId } = await getMealPlan(userId, weekdayOf(new Date()));
      await replaceWeekMealSlots(mealPlanId, week);

      await reloadAll();
      await clearGenerationProfile(userId);
      await completeOnboarding(userId);
      try {
        await consumeGeneration();
      } catch (consumeError) {
        // The plan is already applied locally. A cleanup/network failure must
        // not tell the user to run those destructive replacements again.
        console.warn('[plan-generation] result acknowledgement deferred', consumeError);
      }
      router.replace('/hoy' as never);
    } catch {
      setError('No pudimos aplicar todo el plan. Una parte puede haberse guardado, pero tus respuestas siguen disponibles: intentá de nuevo para dejarlo consistente.');
    } finally {
      setAccepting(false);
    }
  }, [accepting, consumeGeneration, reloadAll, result, router, userId]);

  const generateAnother = useCallback(async () => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      await consumeGeneration();
      router.replace('/(onboarding)/generating' as never);
    } catch {
      setError('No pudimos cerrar este resultado. Revisá tu conexión e intentá de nuevo.');
      setRegenerating(false);
    }
  }, [consumeGeneration, regenerating, router]);

  if (!result) {
    if (!initialized) return null;
    return (
      <View
        style={{
          flex: 1,
          paddingHorizontal: 20,
          paddingTop: insets.top + 40,
          backgroundColor: C.bg,
          gap: 16,
        }}
      >
        <Label>PLAN NO DISPONIBLE</Label>
        <Text style={{ color: C.textPrimary, fontFamily: F.grotesk, fontSize: 28 }}>
          Todavía no hay un resultado listo
        </Text>
        <PressableScale
          onPress={() => router.replace('/(onboarding)/generating' as never)}
          style={{ paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: C.cyan }}
        >
          <Text style={{ color: C.cyan, fontFamily: F.monoBold, fontSize: 11 }}>
            VER ESTADO DE GENERACIÓN
          </Text>
        </PressableScale>
      </View>
    );
  }

  const { plan } = result;
  // Every day is fitted to the same targets, so the first day represents the
  // week's daily goal; meal count is identical across days.
  const sampleDay = plan.week[0];
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 28,
        paddingHorizontal: 20,
        gap: 18,
      }}
    >
      <View style={{ gap: 7 }}>
        <Label>TU PLAN PULSO</Label>
        <Text style={{ color: C.textPrimary, fontFamily: F.grotesk, fontSize: 32 }}>
          Listo para empezar
        </Text>
        <Text style={{ color: C.textSecondary, fontFamily: F.inter, fontSize: 14, lineHeight: 21 }}>
          Revisamos el entrenamiento y la alimentación contra tus objetivos y restricciones.
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Card style={{ flex: 1, padding: 14, gap: 5 }} index={0}>
          <Label>ENTRENO</Label>
          <Text style={{ color: C.red, fontFamily: F.monoXBold, fontSize: 25 }}>
            {plan.workout.days.length}
          </Text>
          <Text style={{ color: C.textSecondary, fontFamily: F.inter, fontSize: 12 }}>días por semana</Text>
        </Card>
        <Card style={{ flex: 1, padding: 14, gap: 5 }} index={1}>
          <Label>NUTRICIÓN</Label>
          <Text style={{ color: C.cyan, fontFamily: F.monoXBold, fontSize: 25 }}>
            {sampleDay?.meals.length ?? 0}
          </Text>
          <Text style={{ color: C.textSecondary, fontFamily: F.inter, fontSize: 12 }}>comidas al día</Text>
        </Card>
      </View>

      <Card style={{ padding: 16, gap: 14 }} index={2}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Label>OBJETIVO DIARIO</Label>
          <Text style={{ color: C.textPrimary, fontFamily: F.monoBold, fontSize: 18 }}>
            {Math.round(sampleDay?.dailyTotals.kcal ?? 0)} kcal
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[
            ['PROT', sampleDay?.dailyTotals.proteinGrams ?? 0, C.red],
            ['CARB', sampleDay?.dailyTotals.carbsGrams ?? 0, C.cyan],
            ['GRASA', sampleDay?.dailyTotals.fatGrams ?? 0, C.orange],
          ].map(([label, value, color]) => (
            <View
              key={String(label)}
              style={{ flex: 1, padding: 10, backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border }}
            >
              <Text style={{ color: String(color), fontFamily: F.monoBold, fontSize: 15 }}>
                {Math.round(Number(value))}g
              </Text>
              <Label>{String(label)}</Label>
            </View>
          ))}
        </View>
      </Card>

      <Card style={{ padding: 16, gap: 12 }} index={3}>
        <Label>SEMANA DE ENTRENAMIENTO</Label>
        {plan.workout.days
          .slice()
          .sort((a, b) => a.weekday - b.weekday)
          .map(day => (
            <View key={`${day.weekday}-${day.order}`} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <View
                style={{
                  width: 31,
                  height: 31,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: withAlpha(C.red, 0.12),
                  borderWidth: 1,
                  borderColor: withAlpha(C.red, 0.35),
                }}
              >
                <Text style={{ color: C.red, fontFamily: F.monoBold, fontSize: 11 }}>{day.weekday}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.textPrimary, fontFamily: F.interSemi, fontSize: 13 }}>{day.name}</Text>
                <Text style={{ color: C.textSecondary, fontFamily: F.inter, fontSize: 12 }}>
                  {day.exercises.length} ejercicios
                </Text>
              </View>
            </View>
          ))}
      </Card>

      {(plan.assumptions.length > 0 || plan.safetyNotes.length > 0) && (
        <Card style={{ padding: 16, gap: 9 }} index={4}>
          <Label>NOTAS DEL PLAN</Label>
          {[...plan.assumptions, ...plan.safetyNotes].map(note => (
            <Text key={note} style={{ color: C.textMid, fontFamily: F.inter, fontSize: 12, lineHeight: 18 }}>
              · {note}
            </Text>
          ))}
        </Card>
      )}

      {error && (
        <Text style={{ color: C.red, fontFamily: F.interMed, fontSize: 13, lineHeight: 19 }}>
          {error}
        </Text>
      )}

      <PressableScale
        haptic="success"
        disabled={accepting}
        onPress={() => void acceptPlan()}
        style={{ paddingVertical: 16, alignItems: 'center', backgroundColor: C.yellow }}
      >
        <Text style={{ color: C.bg, fontFamily: F.monoXBold, fontSize: 12, letterSpacing: 0.9 }}>
          {accepting ? 'APLICANDO PLAN…' : 'ACEPTAR Y EMPEZAR'}
        </Text>
      </PressableScale>

      <PressableScale
        haptic="none"
        disabled={accepting || regenerating || Boolean(error)}
        onPress={() => void generateAnother()}
        style={{ paddingVertical: 10, alignItems: 'center' }}
      >
        <Text style={{ color: C.textSecondary, fontFamily: F.interMed, fontSize: 13 }}>
          {regenerating ? 'Preparando nueva generación…' : 'Generar otro plan'}
        </Text>
      </PressableScale>
    </ScrollView>
  );
}
