import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MealPlanForm, MealPlanFormValues } from '@/components/meal-plan-form';
import { FoodLogger } from '@/components/nutrition/food-logger';
import { HydrationPanel } from '@/components/nutrition/hydration-panel';
import { SavedFoodSheet } from '@/components/nutrition/saved-food-sheet';
import { UndoState, UndoToast } from '@/components/nutrition/undo-toast';
import { AnimatedBar, Card, Label, PressableScale, Segmented } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import { useApp } from '@/context/app-state';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import {
  archiveSavedFood,
  clearPlannedMeal,
  ConsumptionComponent,
  ConsumptionItem,
  deleteConsumption,
  listConsumptions,
  listSavedFoods,
  logConsumption,
  recordPlannedMeal,
  restoreConsumption,
  SavedFoodItem,
  setFoodFavorite,
  updateConsumption,
  updatePlannedMealNote,
} from '@/db/consumption';
import {
  addMealSlot,
  deleteMealSlot,
  getMealPlan,
  getMealWeekSummary,
  getTodayMealEntries,
  MealSlotUI,
  MealStatusDb,
  setMealEntry,
  updateMealSlot,
} from '@/db/nutrition';
import { addDays, dateStr, todayStr, WEEKDAY_DISPLAY_ORDER, WEEKDAY_LABELS, WEEKDAY_SHORT_LABELS, weekdayOf } from '@/lib/dates';
import {
  formatNutrient,
  formatVolume,
  hydrationTotals,
  NutrientKey,
  parseAmount,
  sumNutrients,
} from '@/lib/nutrition-math';

type View3 = 'hoy' | 'plan' | 'alimentos';

function parseDate(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

function dayTitle(date: string): string {
  const today = todayStr();
  if (date === today) return 'HOY';
  if (date === dateStr(addDays(new Date(), -1))) return 'AYER';
  return parseDate(date).toLocaleDateString('es-HN', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
}

function describeItem(item: ConsumptionItem): string {
  const parts: string[] = [];
  if (item.mealLabel) parts.push(item.mealLabel);
  if (item.volumeMl) parts.push(formatVolume(item.volumeMl));
  else if (item.amount != null && item.unit) parts.push(`${Math.round(item.amount * 10) / 10} ${item.unit}`);
  parts.push(formatNutrient('kcal', item.nutrients.kcal));
  return parts.join(' · ');
}

function qualityTag(item: ConsumptionItem): string | null {
  if (item.legacyAggregate) return 'ESTIMADO';
  if (item.completeness === 'partial') return 'INCOMPLETO';
  return null;
}

export default function DietaScreen() {
  const { state } = useApp();
  const { accent } = usePreferences();
  const C = useColors();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<View3>('hoy');
  const [undo, setUndo] = useState<UndoState | null>(null);
  const dismissUndo = useCallback(() => setUndo(null), []);
  const offerUndo = useCallback((message: string, action: () => void) => {
    setUndo({ key: Date.now(), message, undo: action });
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16 }}>
          <PressableScale
            onPress={() => router.push({ pathname: '/mis-planes', params: { tab: 'dieta' } })}
            accessibilityRole="link"
            accessibilityLabel={`Plan activo: ${state.activeMealPlan?.name ?? 'plan nutricional'}. Abrir mis planes`}
            style={{ alignSelf: 'flex-start', minHeight: 24, justifyContent: 'center', marginBottom: 6 }}
          >
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1, color: C.textSecondary }}>
              {`◆ ${(state.activeMealPlan?.name ?? 'MIS PLANES').toUpperCase()} →`}
            </Text>
          </PressableScale>
          <Text accessibilityRole="header" style={{ fontFamily: F.grotesk, fontSize: 27, color: C.textPrimary, marginBottom: 12 }}>Nutrición</Text>
          <Segmented
            options={[
              { key: 'hoy', label: 'HOY' },
              { key: 'plan', label: 'PLAN' },
              { key: 'alimentos', label: 'MIS ALIMENTOS' },
            ]}
            value={view}
            onChange={setView}
            accent={accent}
            style={{ marginBottom: 16 }}
          />
          {view === 'hoy' && <DayView offerUndo={offerUndo} />}
          {view === 'plan' && <PlanView />}
          {view === 'alimentos' && <FoodsView />}
        </View>
      </ScrollView>
      <UndoToast state={undo} onDismiss={dismissUndo} />
    </View>
  );
}

// ── HOY: consumption of a concrete date ─────────────────────────────────────

interface DayData {
  mealPlanId: string;
  meals: MealSlotUI[];
  status: Record<string, MealStatusDb>;
  notes: Record<string, string>;
  items: ConsumptionItem[];
}

function DayView({ offerUndo }: { offerUndo: (message: string, action: () => void) => void }) {
  const { state, reloadNutritionToday } = useApp();
  const { userId } = useSession();
  const { accent } = usePreferences();
  const C = useColors();
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState<DayData | null>(null);
  const [logger, setLogger] = useState<null | { mode: 'extra' } | { mode: 'replace'; meal: MealSlotUI }>(null);
  const isToday = date === todayStr();

  const load = useCallback(async () => {
    if (!userId) return;
    const [plan, entries, items] = await Promise.all([
      getMealPlan(userId, weekdayOf(parseDate(date))),
      getTodayMealEntries(userId, date),
      listConsumptions(userId, date),
    ]);
    setData({ mealPlanId: plan.mealPlanId, meals: plan.meals, status: entries.status, notes: entries.notes, items });
  }, [userId, date]);

  // Reload on focus too: a plan switch in "Mis planes" changes today's meals.
  useFocusEffect(useCallback(() => { load().catch(e => console.error('[day]', e)); }, [load]));

  const refresh = useCallback(async () => {
    await load();
    if (date === todayStr()) await reloadNutritionToday();
  }, [load, date, reloadNutritionToday]);

  const plannedMeal = (meal: MealSlotUI) => ({
    slotId: meal.id, label: meal.label, description: meal.n, kcal: meal.kcal, p: meal.p, c: meal.c, g: meal.g,
  });

  async function markMeal(meal: MealSlotUI, status: MealStatusDb) {
    if (!userId || !data) return;
    try {
      await setMealEntry(userId, data.mealPlanId, meal.id, { status }, date);
      if (status === 'pending') await clearPlannedMeal(userId, meal.id, date);
      else await recordPlannedMeal(userId, date, plannedMeal(meal), status === 'completed'
        ? { type: 'confirmed' }
        : { type: 'substituted', note: data.notes[meal.id] ?? null });
      await refresh();
    } catch (e) {
      console.error('[meal-mark]', e);
    }
  }

  async function replaceMeal(meal: MealSlotUI, components: ConsumptionComponent[]) {
    if (!userId || !data) return;
    await setMealEntry(userId, data.mealPlanId, meal.id, { status: 'substituted' }, date);
    await recordPlannedMeal(userId, date, plannedMeal(meal), { type: 'substituted', components, note: data.notes[meal.id] ?? null });
    await refresh();
  }

  const noteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  function changeNote(meal: MealSlotUI, text: string) {
    setData(current => (current ? { ...current, notes: { ...current.notes, [meal.id]: text } } : current));
    if (!userId || !data) return;
    const mealPlanId = data.mealPlanId;
    clearTimeout(noteTimers.current[meal.id]);
    noteTimers.current[meal.id] = setTimeout(() => {
      setMealEntry(userId, mealPlanId, meal.id, { note: text }, date)
        .then(() => updatePlannedMealNote(userId, meal.id, date, text, meal.label))
        .then(() => load())
        .catch(e => console.error('[meal-note]', e));
    }, 500);
  }

  async function removeItem(item: ConsumptionItem) {
    if (!userId) return;
    await deleteConsumption(userId, item.id);
    // A planned meal removed from the log goes back to pending.
    if (item.planSlotId && data) await setMealEntry(userId, data.mealPlanId, item.planSlotId, { status: 'pending' }, date);
    await refresh();
    offerUndo(`Quitaste ${item.name}`, () => {
      restoreConsumption(userId, item.id)
        .then(async () => {
          if (item.planSlotId && data) {
            await setMealEntry(userId, data.mealPlanId, item.planSlotId, { status: item.source === 'plan' ? 'completed' : 'substituted' }, date);
          }
          await refresh();
        })
        .catch(e => console.error('[undo]', e));
    });
  }

  async function changeAmount(item: ConsumptionItem, amount: number) {
    if (!userId || item.components.length !== 1) return;
    const [component] = item.components;
    await updateConsumption(userId, item.id, {
      amount,
      components: [{ ...component, amount }],
      ...(item.volumeMl != null && component.unit === 'ml' ? { volumeMl: amount } : {}),
    });
    await refresh();
  }

  const items = data?.items ?? [];
  const slotItems = new Map(items.filter(item => item.planSlotId).map(item => [item.planSlotId!, item]));
  const planIds = new Set(data?.meals.map(meal => meal.id) ?? []);
  // Everything not fulfilling one of this day's planned meals: extras, drinks
  // and meals of a plan that is no longer active.
  const extras = items.filter(item => !item.planSlotId || !planIds.has(item.planSlotId));
  // Plain water carries no nutrients; any other drink counts (or flags the
  // totals as incomplete when its values are unknown).
  const eaten = items.filter(item => !(item.kind === 'beverage' && item.plainWater));
  const { totals, incomplete } = sumNutrients(eaten.map(item => item.nutrients));
  const hydration = hydrationTotals(items);
  const planned = (data?.meals ?? []).reduce((acc, meal) => ({
    kcal: acc.kcal + meal.kcal, proteinG: acc.proteinG + meal.p, carbsG: acc.carbsG + meal.c, fatG: acc.fatG + meal.g,
  }), { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  const hasPlan = (data?.meals.length ?? 0) > 0;
  const isAssigned = isToday && state.activeMealPlan?.origin === 'nutritionist' && state.assignedMealsBy != null;

  const bars: { key: NutrientKey; label: string; color: string }[] = [
    { key: 'kcal', label: 'KCAL', color: accent },
    { key: 'proteinG', label: 'PROTEÍNA', color: C.cyan },
    { key: 'carbsG', label: 'CARBOS', color: C.orange },
    { key: 'fatG', label: 'GRASAS', color: '#A855F7' },
  ];

  return (
    <>
      {/* DATE — a concrete day, not a recurring weekday */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <PressableScale
          onPress={() => setDate(dateStr(addDays(parseDate(date), -1)))}
          accessibilityLabel="Día anterior"
          style={{ width: 44, height: 44, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontFamily: F.mono, fontSize: 15, color: C.textPrimary }}>‹</Text>
        </PressableScale>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text accessibilityLiveRegion="polite" style={{ fontFamily: F.monoBold, fontSize: 13, letterSpacing: 1, color: C.textPrimary }}>{dayTitle(date)}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary }}>{parseDate(date).toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
        </View>
        <PressableScale
          onPress={() => setDate(dateStr(addDays(parseDate(date), 1)))}
          disabled={isToday}
          accessibilityLabel="Día siguiente"
          style={{ width: 44, height: 44, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', opacity: isToday ? 0.3 : 1 }}
        >
          <Text style={{ fontFamily: F.mono, fontSize: 15, color: C.textPrimary }}>›</Text>
        </PressableScale>
      </View>

      {isAssigned && (
        <Animated.View entering={FadeInDown.duration(240)} style={{ flexDirection: 'row', gap: 10, borderWidth: 1, borderColor: C.cyan, backgroundColor: withAlpha(C.cyan, 0.06), padding: 12, marginBottom: 12 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.cyan }}>✚</Text>
          <Text style={{ flex: 1, fontFamily: F.inter, fontSize: 12, color: C.textSecondary, lineHeight: 17 }}>
            Plan de <Text style={{ color: C.cyan, fontFamily: F.interSemi }}>{state.assignedMealsBy}</Text>. Lo que registrás acá es tuyo: sus comidas no cambian.
          </Text>
        </Animated.View>
      )}
      {isToday && state.scheduledMeals?.effectiveAt != null && (
        <View style={{ flexDirection: 'row', gap: 10, borderWidth: 1, borderColor: withAlpha(C.textTertiary, 0.4), padding: 12, marginBottom: 12 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.textTertiary }}>→</Text>
          <Text style={{ flex: 1, fontFamily: F.inter, fontSize: 12, color: C.textSecondary, lineHeight: 17 }}>
            {state.scheduledMeals.name ? `“${state.scheduledMeals.name}” entra` : 'Un plan nuevo entra'} en vigor el{' '}
            <Text style={{ color: C.textPrimary, fontFamily: F.interSemi }}>
              {new Date(state.scheduledMeals.effectiveAt).toLocaleDateString('es-HN', { day: '2-digit', month: 'long' })}
            </Text>. Hasta entonces seguís con este.
          </Text>
        </View>
      )}

      {!data && <ActivityIndicator color={C.textTertiary} style={{ marginVertical: 30 }} accessibilityLabel="Cargando el día" />}

      {data && (
        <>
          {/* SUMMARY — what was consumed, against the plan when there is one */}
          <Card index={0} style={{ padding: 14, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <Label>{hasPlan ? 'CONSUMIDO vs PLAN' : 'CONSUMIDO'}</Label>
              {hasPlan && planned.kcal > 0 && <Label>{`${Math.round((totals.kcal / planned.kcal) * 100)}% del plan`}</Label>}
            </View>
            {bars.map(bar => (
              <View key={bar.key} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.8, color: C.textMid }}>{bar.label}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textSecondary }}>
                    {`${incomplete.has(bar.key) ? '≥ ' : ''}${formatNutrient(bar.key, totals[bar.key])}`}
                    {hasPlan && <Text style={{ color: bar.color }}>{` / ${formatNutrient(bar.key, planned[bar.key as keyof typeof planned])}`}</Text>}
                  </Text>
                </View>
                {hasPlan && <AnimatedBar fill={planned[bar.key as keyof typeof planned] > 0 ? Math.min(1, totals[bar.key] / planned[bar.key as keyof typeof planned]) : 0} color={bar.color} />}
              </View>
            ))}
            {incomplete.size > 0 && (
              <Text style={{ fontFamily: F.inter, fontSize: 11, lineHeight: 16, color: C.textTertiary }}>
                “≥” = algún registro no tiene ese dato; el total real puede ser mayor.
              </Text>
            )}
          </Card>

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            <PressableScale
              onPress={() => setLogger({ mode: 'extra' })}
              haptic="medium"
              containerStyle={{ flex: 1 }}
              style={{ minHeight: 50, justifyContent: 'center', alignItems: 'center', backgroundColor: accent }}
            >
              <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, color: C.onAccent }}>+ AGREGAR LO QUE COMISTE</Text>
            </PressableScale>
            {isToday && (
              <PressableScale
                onPress={() => router.push('/escanear')}
                accessibilityLabel="Escanear código de barras o tabla nutricional"
                style={{ minHeight: 50, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, borderWidth: 1, borderColor: C.textSecondary }}
              >
                <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, color: C.textPrimary }}>ESCANEAR</Text>
              </PressableScale>
            )}
          </View>

          <View style={{ marginBottom: 14 }}>
            <HydrationPanel
              localDate={date}
              totalMl={hydration.totalMl}
              plainWaterMl={hydration.plainWaterMl}
              goalMl={state.hydration.goalMl}
              onLogged={(id, message) => {
                refresh().catch(e => console.error('[drink-refresh]', e));
                offerUndo(message, () => {
                  if (!userId) return;
                  deleteConsumption(userId, id).then(refresh).catch(e => console.error('[undo]', e));
                });
              }}
              onGoalChanged={() => { reloadNutritionToday().catch(e => console.error('[goal]', e)); }}
            />
          </View>

          {/* PLANNED MEALS */}
          {hasPlan ? (
            <>
              <Label style={{ marginBottom: 8 }}>{`COMIDAS DEL PLAN · ${WEEKDAY_LABELS[weekdayOf(parseDate(date))]}`}</Label>
              {data.meals.map((meal, index) => (
                <PlannedMealCard
                  key={meal.id}
                  meal={meal}
                  index={index}
                  status={data.status[meal.id] ?? 'pending'}
                  note={data.notes[meal.id] ?? ''}
                  recorded={slotItems.get(meal.id) ?? null}
                  onConfirm={() => void markMeal(meal, 'completed')}
                  onAdjust={() => setLogger({ mode: 'replace', meal })}
                  onSubstituteNote={() => void markMeal(meal, 'substituted')}
                  onPending={() => void markMeal(meal, 'pending')}
                  onNote={text => changeNote(meal, text)}
                />
              ))}
            </>
          ) : (
            <Card style={{ padding: 16, marginBottom: 12 }}>
              <Text style={{ fontFamily: F.inter, fontSize: 13, lineHeight: 19, color: C.textSecondary }}>
                Tu plan no tiene comidas para este día. Podés registrar lo que comas igual, o armarlo en PLAN.
              </Text>
            </Card>
          )}

          {/* EVERYTHING ELSE LOGGED THAT DAY */}
          {extras.length > 0 && (
            <>
              <Label style={{ marginTop: 10, marginBottom: 8 }}>REGISTRADO</Label>
              {extras.map(item => (
                <LoggedRow key={item.id} item={item} onRemove={() => void removeItem(item)} onAmount={amount => void changeAmount(item, amount)} />
              ))}
            </>
          )}
        </>
      )}

      {logger && (
        <FoodLogger
          visible
          onClose={() => setLogger(null)}
          dateLabel={dayTitle(date)}
          mode={logger.mode}
          fixedMealLabel={logger.mode === 'replace' ? logger.meal.label : undefined}
          onSubmit={async (components, mealLabel) => {
            if (!userId) return;
            if (logger.mode === 'replace') {
              await replaceMeal(logger.meal, components);
              return;
            }
            const id = await logConsumption(userId, {
              localDate: date,
              kind: 'food',
              mealLabel,
              name: components.map(component => component.name).join(', '),
              amount: components.length === 1 ? components[0].amount : null,
              unit: components.length === 1 ? components[0].unit : null,
              source: components[0].source,
              components,
            });
            await refresh();
            offerUndo('Registrado', () => { deleteConsumption(userId, id).then(refresh).catch(e => console.error('[undo]', e)); });
          }}
        />
      )}
    </>
  );
}

function PlannedMealCard({ meal, index, status, note, recorded, onConfirm, onAdjust, onSubstituteNote, onPending, onNote }: {
  meal: MealSlotUI;
  index: number;
  status: MealStatusDb;
  note: string;
  recorded: ConsumptionItem | null;
  onConfirm: () => void;
  onAdjust: () => void;
  onSubstituteNote: () => void;
  onPending: () => void;
  onNote: (text: string) => void;
}) {
  const C = useColors();
  const { accent } = usePreferences();
  const color = status === 'completed' ? accent : status === 'substituted' ? C.cyan : C.textTertiary;
  const replacedWithFoods = status === 'substituted' && (recorded?.components.length ?? 0) > 0;

  return (
    <Animated.View
      layout={LinearTransition.duration(200)}
      entering={FadeIn.duration(220).delay(index * 40)}
      style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, borderLeftColor: color, marginBottom: 10 }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 11, paddingBottom: 4 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.2, color: C.textPrimary }}>{`${meal.label}${meal.time ? ` · ${meal.time}` : ''}`}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.8, color }}>
          {status === 'completed' ? 'CONFIRMADA' : status === 'substituted' ? 'AJUSTADA' : 'PENDIENTE'}
        </Text>
      </View>
      <View style={{ paddingHorizontal: 14, paddingBottom: 10, gap: 3 }}>
        <Text style={{ fontFamily: F.interMed, fontSize: 14, color: status === 'substituted' ? C.textSecondary : C.textPrimary, textDecorationLine: status === 'substituted' ? 'line-through' : 'none' }}>{meal.n}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary }}>{`PLAN · ${meal.kcal} kcal · P ${meal.p}g · C ${meal.c}g · G ${meal.g}g`}</Text>
        {replacedWithFoods && recorded && (
          <Text style={{ fontFamily: F.interMed, fontSize: 13, color: C.textPrimary, marginTop: 4 }}>
            {`Comiste: ${recorded.name} · ${formatNutrient('kcal', recorded.nutrients.kcal)}`}
          </Text>
        )}
      </View>
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border }}>
        {status !== 'completed' && (
          <PressableScale onPress={onConfirm} haptic="success" containerStyle={{ flex: 1 }} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRightWidth: 1, borderRightColor: C.border }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: 9, letterSpacing: 0.5, color: C.textPrimary }}>CONFIRMAR</Text>
          </PressableScale>
        )}
        <PressableScale onPress={onAdjust} accessibilityHint="Registrá lo que comiste en lugar de lo planificado" containerStyle={{ flex: 1 }} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRightWidth: status === 'pending' ? 0 : 1, borderRightColor: C.border }}>
          <Text style={{ fontFamily: F.monoBold, fontSize: 9, letterSpacing: 0.5, color: C.textSecondary }}>AJUSTAR</Text>
        </PressableScale>
        {status !== 'pending' && (
          <PressableScale onPress={onPending} containerStyle={{ flex: 1 }} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: 9, letterSpacing: 0.5, color: C.textSecondary }}>DESHACER</Text>
          </PressableScale>
        )}
      </View>
      {status === 'pending' && (
        <PressableScale onPress={onSubstituteNote} style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: C.border }}>
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary }}>COMÍ OTRA COSA · SOLO ANOTARLO</Text>
        </PressableScale>
      )}
      {status === 'substituted' && !replacedWithFoods && (
        <View style={{ padding: 11, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: withAlpha(C.cyan, 0.05), gap: 6 }}>
          <Label style={{ color: C.cyan }}>¿QUÉ COMISTE?</Label>
          <TextInput
            value={note}
            onChangeText={onNote}
            placeholder="Ej: yogur griego en vez del licuado"
            placeholderTextColor={C.textTertiary}
            accessibilityLabel={`Nota de sustitución de ${meal.label}`}
            style={{ backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 9, color: C.textPrimary, fontFamily: F.inter, fontSize: 13 }}
          />
          <Text style={{ fontFamily: F.inter, fontSize: 11, color: C.textTertiary }}>Sin alimentos no se suman nutrientes. Usá AJUSTAR para que cuente.</Text>
        </View>
      )}
    </Animated.View>
  );
}

function LoggedRow({ item, onRemove, onAmount }: { item: ConsumptionItem; onRemove: () => void; onAmount: (amount: number) => void }) {
  const C = useColors();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(item.amount ?? ''));
  const editable = item.components.length === 1;
  const tag = qualityTag(item);

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 10, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 12, color: item.kind === 'beverage' ? C.cyan : C.textTertiary, width: 14 }}>{item.kind === 'beverage' ? '◉' : '◆'}</Text>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }} numberOfLines={2}>{item.name}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary }}>{`${describeItem(item)}${tag ? ` · ${tag}` : ''}`}</Text>
        </View>
        {editable && (
          <PressableScale onPress={() => setEditing(!editing)} accessibilityLabel={`Cambiar cantidad de ${item.name}`} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 9, borderWidth: 1, borderColor: C.border }}>
            <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textSecondary }}>✎</Text>
          </PressableScale>
        )}
        <PressableScale onPress={onRemove} accessibilityLabel={`Quitar ${item.name}`} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 9, borderWidth: 1, borderColor: C.border }}>
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textSecondary }}>✕</Text>
        </PressableScale>
      </View>
      {editing && (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingLeft: 24 }}>
          <TextInput
            value={text}
            onChangeText={value => setText(value.replace(/[^0-9.,]/g, ''))}
            keyboardType="decimal-pad"
            accessibilityLabel={`Nueva cantidad en ${item.unit ?? ''}`}
            style={{ width: 90, backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 8, color: C.textPrimary, fontFamily: F.monoBold, fontSize: 13 }}
          />
          <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary }}>{item.unit}</Text>
          <PressableScale
            onPress={() => { const amount = parseAmount(text); if (amount) { onAmount(amount); setEditing(false); } }}
            style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: C.textSecondary }}
          >
            <Text style={{ fontFamily: F.monoBold, fontSize: 9, color: C.textPrimary }}>GUARDAR</Text>
          </PressableScale>
        </View>
      )}
    </View>
  );
}

// ── PLAN: the recurring week ────────────────────────────────────────────────

/**
 * Planning, not logging: editing the week never records consumption and
 * never touches the professional's original plan (edits apply to the active
 * plan, which is the athlete's own copy when it came from a professional).
 */
function PlanView() {
  const { state, reloadAll } = useApp();
  const { userId } = useSession();
  const { accent } = usePreferences();
  const C = useColors();
  const todayWeekday = weekdayOf(new Date());
  const [weekday, setWeekday] = useState(todayWeekday);
  const [counts, setCounts] = useState<Record<number, number>>({});

  const refreshCounts = useCallback(() => {
    if (!userId) return;
    getMealWeekSummary(userId)
      .then(summary => setCounts(Object.fromEntries(summary.map(s => [s.weekday, s.mealCount]))))
      .catch(e => console.error('[meal-week-summary]', e));
  }, [userId]);
  useEffect(refreshCounts, [refreshCounts, state.activeMealPlan?.id]);

  return (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
        {WEEKDAY_DISPLAY_ORDER.map(day => {
          const selected = weekday === day;
          const isToday = day === todayWeekday;
          return (
            <PressableScale
              key={day}
              onPress={() => setWeekday(day)}
              selected={selected}
              accessibilityLabel={`${WEEKDAY_LABELS[day]}${isToday ? ', hoy' : ''}, ${counts[day] ?? 0} comidas`}
              style={{
                width: 40, height: 44, borderWidth: 1, gap: 4, alignItems: 'center', justifyContent: 'center',
                borderColor: selected ? accent : isToday ? C.textSecondary : C.border,
                backgroundColor: selected ? withAlpha(accent, 0.12) : C.card,
              }}
            >
              <Text style={{ fontFamily: F.monoBold, fontSize: 12, color: selected ? accent : isToday ? C.textPrimary : C.textTertiary }}>{WEEKDAY_SHORT_LABELS[day]}</Text>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: (counts[day] ?? 0) > 0 ? (selected ? accent : C.textTertiary) : 'transparent' }} />
            </PressableScale>
          );
        })}
      </View>
      <DayMealEditor
        key={`${state.activeMealPlan?.id}-${weekday}`}
        weekday={weekday}
        onChanged={() => {
          refreshCounts();
          // Today's meals feed Hoy and the check-in.
          if (weekday === todayWeekday) reloadAll().catch(e => console.error('[plan-reload]', e));
        }}
      />
    </>
  );
}

/** Add/edit/delete the meals of one weekday of the active plan. */
function DayMealEditor({ weekday, onChanged }: { weekday: number; onChanged: () => void }) {
  const { userId } = useSession();
  const C = useColors();
  const [loading, setLoading] = useState(true);
  const [mealPlanId, setMealPlanId] = useState<string | null>(null);
  const [meals, setMeals] = useState<MealSlotUI[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const plan = await getMealPlan(userId, weekday);
      setMealPlanId(plan.mealPlanId);
      setMeals(plan.meals);
    } catch (e) {
      console.error('[plan-day]', e);
    } finally {
      setLoading(false);
    }
  }, [userId, weekday]);
  useEffect(() => { load(); }, [load]);

  function cancel() {
    setAdding(false);
    setEditingId(null);
  }

  async function save(values: MealPlanFormValues) {
    if (!mealPlanId) return;
    try {
      if (editingId) await updateMealSlot(mealPlanId, editingId, values);
      else await addMealSlot(mealPlanId, weekday, values);
      cancel();
      await load();
      onChanged();
    } catch (e) {
      console.error('[plan-meal-save]', e);
    }
  }

  async function remove() {
    if (!mealPlanId || !editingId) return;
    try {
      await deleteMealSlot(mealPlanId, editingId);
      cancel();
      await load();
      onChanged();
    } catch (e) {
      console.error('[plan-meal-delete]', e);
    }
  }

  const editing = editingId ? meals.find(meal => meal.id === editingId) ?? null : null;
  const formOpen = adding || editing != null;

  if (loading) return <ActivityIndicator color={C.textTertiary} style={{ marginVertical: 30 }} />;

  return (
    <>
      {formOpen && (
        <MealPlanForm
          key={editing ? `edit-${editing.id}` : 'add'}
          editing={editing != null}
          initial={editing
            ? { label: editing.label, time: editing.time, n: editing.n, kcal: editing.kcal, p: editing.p, c: editing.c, g: editing.g }
            : { label: '', time: '', n: '', kcal: 0, p: 0, c: 0, g: 0 }}
          onCancel={cancel}
          onSave={save}
          onDelete={editing ? remove : undefined}
        />
      )}
      {!meals.length && !formOpen && (
        <Card style={{ padding: 20, marginBottom: 12, alignItems: 'center' }}>
          <Label style={{ marginBottom: 8 }}>{`SIN COMIDAS PARA ${WEEKDAY_LABELS[weekday]}`}</Label>
          <Text style={{ fontFamily: F.inter, fontSize: 13, color: C.textSecondary, textAlign: 'center', lineHeight: 19 }}>
            Planificar no registra consumo: armá tu semana habitual y confirmá cada comida en HOY.
          </Text>
        </Card>
      )}
      {meals.length > 0 && <Label style={{ marginBottom: 8 }}>{`COMIDAS DE ${WEEKDAY_LABELS[weekday]}`}</Label>}
      {meals.map(meal => (
        <PressableScale
          key={meal.id}
          onPress={() => { setEditingId(meal.id); setAdding(false); }}
          accessibilityHint="Editar esta comida del plan"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 7 }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.textPrimary }}>{`${meal.label}${meal.time ? ` · ${meal.time}` : ''}`}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary, marginTop: 2 }} numberOfLines={1}>{`${meal.n} · ${meal.kcal} kcal`}</Text>
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textSecondary }}>✎ EDITAR</Text>
        </PressableScale>
      ))}
      {!formOpen && (
        <PressableScale
          onPress={() => { setAdding(true); setEditingId(null); }}
          style={{ alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border, borderStyle: 'dashed', backgroundColor: C.bgEl, padding: 14, marginTop: 4 }}
        >
          <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, color: C.textSecondary }}>+ AGREGAR COMIDA AL PLAN</Text>
        </PressableScale>
      )}
    </>
  );
}

// ── MIS ALIMENTOS: saved products, usable offline ───────────────────────────

function FoodsView() {
  const { userId } = useSession();
  const { reloadNutritionToday } = useApp();
  const C = useColors();
  const { accent } = usePreferences();
  const [foods, setFoods] = useState<SavedFoodItem[] | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ food: SavedFoodItem | null } | null>(null);
  const [logging, setLogging] = useState<SavedFoodItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!userId) return;
    listSavedFoods(userId).then(setFoods).catch(e => console.error('[saved-foods]', e));
  }, [userId]);
  useFocusEffect(load);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (foods ?? []).filter(food => !q || `${food.name} ${food.brand ?? ''}`.toLowerCase().includes(q));
  }, [foods, query]);

  return (
    <>
      <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textSecondary, marginBottom: 10 }}>
        Guardar un alimento no lo registra ni cambia tu plan. Todo esto funciona sin conexión.
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar en mis alimentos"
          placeholderTextColor={C.textTertiary}
          accessibilityLabel="Buscar en mis alimentos"
          style={{ flex: 1, backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 10, color: C.textPrimary, fontFamily: F.inter, fontSize: 14 }}
        />
        <PressableScale
          onPress={() => setEditing({ food: null })}
          accessibilityLabel="Nuevo alimento"
          style={{ minWidth: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: accent }}
        >
          <Text style={{ fontFamily: F.monoBold, fontSize: 16, color: C.onAccent }}>+</Text>
        </PressableScale>
      </View>

      {!foods && <ActivityIndicator color={C.textTertiary} style={{ marginVertical: 30 }} />}
      {foods && !foods.length && (
        <Card style={{ padding: 18 }}>
          <Text style={{ fontFamily: F.inter, fontSize: 13, lineHeight: 19, color: C.textSecondary }}>
            Todavía no guardaste alimentos. Agregá los productos que comprás seguido para registrarlos con un toque.
          </Text>
        </Card>
      )}

      {visible.map(food => (
        <View key={food.id} style={{ borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 11, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <PressableScale
              onPress={() => { if (userId) setFoodFavorite(userId, food.id, !food.favorite).then(load).catch(e => console.error('[fav]', e)); }}
              accessibilityRole="checkbox"
              selected={food.favorite}
              accessibilityLabel={`Favorito: ${food.name}`}
              style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 16, color: food.favorite ? accent : C.textTertiary }}>{food.favorite ? '★' : '☆'}</Text>
            </PressableScale>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.textPrimary }}>{food.brand ? `${food.name} · ${food.brand}` : food.name}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary }}>
                {`por ${food.basis.amount} ${food.basis.unit} · ${formatNutrient('kcal', food.nutrients.kcal)} · P ${formatNutrient('proteinG', food.nutrients.proteinG)}${food.servingLabel && food.servingAmount ? ` · 1 ${food.servingLabel} = ${food.servingAmount} ${food.basis.unit}` : ''}`}
              </Text>
            </View>
            <PressableScale onPress={() => setLogging(food)} haptic="medium" style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: C.textSecondary }}>
              <Text style={{ fontFamily: F.monoBold, fontSize: 9, color: C.textPrimary }}>REGISTRAR</Text>
            </PressableScale>
          </View>
          <View style={{ flexDirection: 'row', gap: 18, paddingLeft: 50 }}>
            <PressableScale onPress={() => setEditing({ food })} style={{ minHeight: 32, justifyContent: 'center' }}>
              <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary }}>EDITAR</Text>
            </PressableScale>
            {confirmDelete === food.id ? (
              <PressableScale
                onPress={() => { if (userId) archiveSavedFood(userId, food.id).then(() => { setConfirmDelete(null); load(); }).catch(e => console.error('[food-delete]', e)); }}
                style={{ minHeight: 32, justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: F.monoBold, fontSize: 9, color: C.red }}>CONFIRMAR BORRAR · TU HISTORIAL NO CAMBIA</Text>
              </PressableScale>
            ) : (
              <PressableScale onPress={() => setConfirmDelete(food.id)} style={{ minHeight: 32, justifyContent: 'center' }}>
                <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary }}>BORRAR</Text>
              </PressableScale>
            )}
          </View>
        </View>
      ))}

      {editing && <SavedFoodSheet food={editing.food} onClose={() => setEditing(null)} onSaved={load} />}
      {logging && (
        <FoodLogger
          visible
          onClose={() => setLogging(null)}
          dateLabel="HOY"
          mode="extra"
          initialFood={logging}
          onSubmit={async (components, mealLabel) => {
            if (!userId) return;
            await logConsumption(userId, {
              localDate: todayStr(),
              kind: 'food',
              mealLabel,
              name: components.map(component => component.name).join(', '),
              amount: components.length === 1 ? components[0].amount : null,
              unit: components.length === 1 ? components[0].unit : null,
              source: components[0].source,
              components,
            });
            await reloadNutritionToday();
            load();
          }}
        />
      )}
    </>
  );
}
