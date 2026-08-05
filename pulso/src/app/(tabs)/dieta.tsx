import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MealPlanForm, MealPlanFormValues } from '@/components/meal-plan-form';
import { AnimatedBar, Card, Label, PressableScale } from '@/components/ui/kit';
import { ColorTokens, F, useColors, withAlpha } from '@/constants/colors';
import { Meal, MealStatus, useApp } from '@/context/app-state';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import {
  addMealSlot,
  deleteMealSlot,
  getMealPlan,
  getMealWeekSummary,
  MealSlotUI,
  updateMealSlot,
} from '@/db/nutrition';
import { WEEKDAY_DISPLAY_ORDER, WEEKDAY_LABELS, WEEKDAY_SHORT_LABELS, weekdayOf } from '@/lib/dates';

const WATER_MAX = 10;

/** Horizontal canteen with a liquid fill; turns into an "energy drink" color once full. */
function HydrationBottle({ level, max }: { level: number; max: number }) {
  const C = useColors();
  const full = level >= max;
  const fill = useSharedValue(0);

  useEffect(() => {
    fill.value = withTiming(Math.max(0, Math.min(1, level / max)), { duration: 550, easing: Easing.out(Easing.cubic) });
  }, [level, max, fill]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  const edgeColor = full ? C.orange : C.border;
  const liquidColor = full ? C.orange : C.cyan;
  const liquidFill = full ? 'rgba(255,166,43,0.28)' : 'rgba(61,220,255,0.24)';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 46 }}>
      <View style={{ width: 9, height: 20, backgroundColor: C.bgEl, borderWidth: 1, borderColor: edgeColor, borderRightWidth: 0 }} />
      <View style={{ flex: 1, height: '100%', backgroundColor: C.bgEl, borderWidth: 1, borderColor: edgeColor, overflow: 'hidden' }}>
        <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: liquidFill }, fillStyle]}>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: liquidColor }} />
        </Animated.View>
      </View>
    </View>
  );
}

function statusColor(s: MealStatus | undefined, accent: string, C: ColorTokens) {
  if (s === 'cumplido')   return accent;
  if (s === 'sustituido') return C.cyan;
  return C.textTertiary;
}

function statusLabel(s: MealStatus | undefined) {
  if (s === 'cumplido')   return 'CUMPLIDO';
  if (s === 'sustituido') return 'SUSTITUIDO';
  return 'PENDIENTE';
}

function MealCard({ m, index }: { m: Meal; index: number }) {
  const { state, setMeal, setMealNote, startEditMeal } = useApp();
  const { accent } = usePreferences();
  const C = useColors();
  const s = state.mealStatus[m.id] as MealStatus | undefined;
  const sc = statusColor(s, accent, C);
  const sl = statusLabel(s);
  const note = state.mealNotes[m.id] || '';

  return (
    <Animated.View layout={LinearTransition.duration(220)}>
    <Animated.View
      entering={FadeInDown.duration(280).delay(index * 45).easing(Easing.out(Easing.cubic))}
      style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, borderLeftColor: sc, marginBottom: 10 }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 11, paddingBottom: 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.2, color: C.textPrimary }}>{m.label}</Text>
          {!!m.time && <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary }}>{m.time}</Text>}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.8, color: sc, textTransform: 'uppercase' }}>{sl}</Text>
          <PressableScale onPress={() => startEditMeal(m.id)} style={{ paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl }}>
            <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textSecondary }}>✎</Text>
          </PressableScale>
        </View>
      </View>
      <View style={{ paddingHorizontal: 14, paddingBottom: 11 }}>
        <Text style={{ fontFamily: F.interMed, fontSize: 14, color: C.textPrimary, marginBottom: 3 }}>{m.n}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary }}>
          {m.kcal} kcal · P {m.p}g · C {m.c}g · G {m.g}g
        </Text>
      </View>
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border }}>
        {(['cumplido', 'sustituido', 'pendiente'] as MealStatus[]).map((action, i) => (
          <PressableScale
            key={action}
            onPress={() => setMeal(m.id, action)}
            style={{
              flex: 1, padding: 11,
              backgroundColor: s === action ? (action === 'cumplido' ? accent : action === 'sustituido' ? C.cyan : C.border) : C.card,
              borderRightWidth: i < 2 ? 1 : 0, borderRightColor: C.border,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontFamily: F.monoBold, fontSize: 9, letterSpacing: 0.5, color: s === action ? C.bg : C.textSecondary, textTransform: 'uppercase' }}>
              {action === 'cumplido' ? 'CUMPLIDO' : action === 'sustituido' ? 'SUSTITUIR' : 'PENDIENTE'}
            </Text>
          </PressableScale>
        ))}
      </View>
      {s === 'sustituido' && (
        <Animated.View entering={FadeIn.duration(250)} style={{ padding: 11, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: 'rgba(61,220,255,0.05)' }}>
          <Label style={{ color: C.cyan, marginBottom: 7 }}>¿CON QUÉ LO SUSTITUISTE?</Label>
          <TextInput
            value={note}
            onChangeText={txt => setMealNote(m.id, txt)}
            placeholder="Ej: yogur griego en vez del licuado"
            placeholderTextColor={C.textTertiary}
            style={{ backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 9, color: C.textPrimary, fontFamily: F.inter, fontSize: 13 }}
          />
          <Label style={{ marginTop: 6 }}>TU NOTA QUEDA GUARDADA</Label>
        </Animated.View>
      )}
    </Animated.View>
    </Animated.View>
  );
}

function TodayMealForm() {
  const { state, cancelMealForm, saveMealForm, deleteMeal } = useApp();
  const d = state.mealDraft;
  const editing = state.editingMealId != null;

  return (
    <MealPlanForm
      editing={editing}
      initial={{
        label: d.label, time: d.time, n: d.n,
        kcal: Number(d.kcal) || 0, p: Number(d.p) || 0, c: Number(d.c) || 0, g: Number(d.g) || 0,
      }}
      onCancel={cancelMealForm}
      onSave={values => saveMealForm({
        label: values.label, time: values.time, n: values.n,
        kcal: String(values.kcal), p: String(values.p), c: String(values.c), g: String(values.g),
      })}
      onDelete={editing ? deleteMeal : undefined}
    />
  );
}

/**
 * Add/edit/delete editor for a single day's meal plan, entirely self-contained
 * (own DB reads/writes) — deliberately does NOT touch the shared AppState,
 * since that state is "today's plan" everywhere else in the app (Hoy, Pulso).
 * Browsing or editing another day here must never leak into those dashboards.
 * Mirrors OtherDayPlanEditor in entreno.tsx. Consumption status (cumplido/
 * sustituido) is a per-date log, not part of the plan, so it has no place here.
 */
function OtherDayMealEditor({ weekday, onChanged }: { weekday: number; onChanged: () => void }) {
  const { userId } = useSession();
  const C = useColors();
  const [loading, setLoading] = useState(true);
  const [mealPlanId, setMealPlanId] = useState<string | null>(null);
  const [meals, setMeals] = useState<MealSlotUI[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const plan = await getMealPlan(userId, weekday);
      setMealPlanId(plan.mealPlanId);
      setMeals(plan.meals);
    } catch (e) {
      console.error('[other-day-meals]', e);
    } finally {
      setLoading(false);
    }
  }, [userId, weekday]);

  useEffect(() => {
    setEditingId(null);
    setAdding(false);
    load();
  }, [load]);

  function cancel() {
    setAdding(false);
    setEditingId(null);
  }

  async function save(values: MealPlanFormValues) {
    if (!mealPlanId) { cancel(); return; }
    try {
      if (editingId) {
        await updateMealSlot(mealPlanId, editingId, values);
      } else {
        await addMealSlot(mealPlanId, weekday, values);
      }
      cancel();
      await load();
      onChanged();
    } catch (e) {
      console.error('[other-day-meal-save]', e);
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
      console.error('[other-day-meal-delete]', e);
    }
  }

  const editingMeal = editingId ? meals.find(m => m.id === editingId) ?? null : null;
  const formOpen = adding || editingMeal != null;

  if (loading) {
    return (
      <View style={{ padding: 30, alignItems: 'center' }}>
        <ActivityIndicator color={C.textTertiary} />
      </View>
    );
  }

  return (
    <>
      {formOpen && (
        <MealPlanForm
          key={editingMeal ? `edit-${editingMeal.id}` : 'add'}
          editing={editingMeal != null}
          initial={editingMeal
            ? { label: editingMeal.label, time: editingMeal.time, n: editingMeal.n, kcal: editingMeal.kcal, p: editingMeal.p, c: editingMeal.c, g: editingMeal.g }
            : { label: '', time: '', n: '', kcal: 0, p: 0, c: 0, g: 0 }}
          onCancel={cancel}
          onSave={save}
          onDelete={editingMeal ? remove : undefined}
        />
      )}

      {!meals.length && !formOpen && (
        <Card index={0} style={{ padding: 22, marginBottom: 12, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.8, color: C.textTertiary, textTransform: 'uppercase', marginBottom: 10 }}>
            SIN PLAN PARA {WEEKDAY_LABELS[weekday]}
          </Text>
          <Text style={{ fontFamily: F.inter, fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 16 }}>
            Armá las comidas de este día para tu plan semanal
          </Text>
          <PressableScale
            onPress={() => { setAdding(true); setEditingId(null); }}
            style={{ backgroundColor: C.cyan, paddingVertical: 12, paddingHorizontal: 22, alignItems: 'center', alignSelf: 'stretch' }}
          >
            <Text style={{ fontFamily: F.monoXBold, fontSize: 11, letterSpacing: 0.6, color: C.bg, textTransform: 'uppercase' }}>
              + CREAR COMIDA
            </Text>
          </PressableScale>
        </Card>
      )}

      {meals.length > 0 && (
        <>
          <Label style={{ marginBottom: 9 }}>{`COMIDAS DE ${WEEKDAY_LABELS[weekday]}`}</Label>
          {meals.map(m => (
            <PressableScale
              key={m.id}
              onPress={() => { setEditingId(m.id); setAdding(false); }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
                padding: 12, paddingHorizontal: 14, marginBottom: 7,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.textPrimary }}>
                  {m.label}{m.time ? ` · ${m.time}` : ''}
                </Text>
                <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary, marginTop: 2 }} numberOfLines={1}>
                  {m.n} · {m.kcal} kcal
                </Text>
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textSecondary, textTransform: 'uppercase' }}>✎ EDITAR</Text>
            </PressableScale>
          ))}
          {!formOpen && (
            <PressableScale
              onPress={() => { setAdding(true); setEditingId(null); }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#3a3a40', borderStyle: 'dashed', backgroundColor: C.bgEl, padding: 14, marginTop: 3 }}
            >
              <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, color: C.textSecondary, textTransform: 'uppercase' }}>
                + AGREGAR COMIDA
              </Text>
            </PressableScale>
          )}
        </>
      )}
    </>
  );
}

export default function DietaScreen() {
  const { state, setWater, startAddMeal } = useApp();
  const { accent } = usePreferences();
  const { userId } = useSession();
  const C = useColors();
  const insets = useSafeAreaInsets();

  const todayWeekday = weekdayOf(new Date());
  // Day tabs are local to this screen: only today's plan feeds the shared
  // AppState (used by Hoy/Pulso), so browsing another day here can't leak into
  // those dashboards. See OtherDayMealEditor above for the non-today branch.
  const [selectedWeekday, setSelectedWeekday] = useState(todayWeekday);
  const [weekMealCounts, setWeekMealCounts] = useState<Record<number, number>>({});
  const isToday = selectedWeekday === todayWeekday;

  const refreshWeekMealCounts = useCallback(() => {
    if (!userId) return;
    getMealWeekSummary(userId)
      .then(summary => setWeekMealCounts(Object.fromEntries(summary.map(s => [s.weekday, s.mealCount]))))
      .catch(e => console.error('[meal-week-summary]', e));
  }, [userId]);

  // Also re-derives when today's own meal count changes, so the dot under
  // today's tab updates without waiting for a manual refresh.
  useEffect(() => { refreshWeekMealCounts(); }, [refreshWeekMealCounts, state.meals.length]);

  const hasPlan = state.meals.length > 0;
  const isAssigned = state.assignedMealsBy != null;
  const formOpen = state.addingMeal || state.editingMealId != null;

  const consumed = state.meals.reduce((acc, m) => {
    const s = state.mealStatus[m.id];
    if (s === 'cumplido' || s === 'sustituido') {
      return { kcal: acc.kcal + m.kcal, p: acc.p + m.p, c: acc.c + m.c, g: acc.g + m.g };
    }
    return acc;
  }, { kcal: 0, p: 0, c: 0, g: 0 });

  const totalKcal = state.meals.reduce((a, m) => a + m.kcal, 0);
  const totalP    = state.meals.reduce((a, m) => a + m.p, 0);
  const totalC    = state.meals.reduce((a, m) => a + m.c, 0);
  const totalG    = state.meals.reduce((a, m) => a + m.g, 0);

  const macroBars = hasPlan ? [
    { k: 'KCAL',     v: consumed.kcal,    t: totalKcal,    fill: totalKcal > 0 ? Math.min(1, consumed.kcal / totalKcal) : 0, color: accent },
    { k: 'PROTEÍNA', v: `${consumed.p}g`, t: `${totalP}g`, fill: totalP > 0 ? Math.min(1, consumed.p / totalP) : 0,          color: C.cyan },
    { k: 'CARBOS',   v: `${consumed.c}g`, t: `${totalC}g`, fill: totalC > 0 ? Math.min(1, consumed.c / totalC) : 0,          color: C.orange },
    { k: 'GRASAS',   v: `${consumed.g}g`, t: `${totalG}g`, fill: totalG > 0 ? Math.min(1, consumed.g / totalG) : 0,          color: '#A855F7' },
  ] : [];

  const macroPct = totalKcal > 0 ? Math.round((consumed.kcal / totalKcal) * 100) : 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16 }}>
        <Label style={{ marginBottom: 6 }}>{isAssigned ? `PLAN DE ${state.assignedMealsBy?.toUpperCase()}` : 'PLAN NUTRICIONAL'}</Label>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 9, marginBottom: 16 }}>
          <Text style={{ fontFamily: F.grotesk, fontSize: 27, color: C.textPrimary }}>Nutrición</Text>
          {/* Meals differ from one weekday to the next now. Without naming the
              day, a plan that changed overnight reads as a bug. */}
          <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 1, color: C.textTertiary }}>
            {WEEKDAY_LABELS[selectedWeekday]}{isToday ? ' · HOY' : ''}
          </Text>
        </View>

        {/* DAY TABS — one meal plan per day of the week */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
          {WEEKDAY_DISPLAY_ORDER.map(day => {
            const selected = selectedWeekday === day;
            const dayIsToday = day === todayWeekday;
            const hasMeals = (weekMealCounts[day] ?? 0) > 0;
            return (
              <PressableScale
                key={day}
                onPress={() => setSelectedWeekday(day)}
                haptic="light"
                style={{
                  width: 40, height: 44, borderWidth: 1, gap: 4,
                  borderColor: selected ? accent : dayIsToday ? C.textSecondary : C.border,
                  backgroundColor: selected ? withAlpha(accent, 0.12) : C.card,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ fontFamily: F.monoBold, fontSize: 12, color: selected ? accent : dayIsToday ? C.textPrimary : C.textTertiary }}>
                  {WEEKDAY_SHORT_LABELS[day]}
                </Text>
                <View style={{
                  width: 4, height: 4, borderRadius: 2,
                  backgroundColor: hasMeals ? (selected ? accent : C.textTertiary) : 'transparent',
                }} />
              </PressableScale>
            );
          })}
        </View>

        {isToday ? (
        <>
        {/* ASSIGNED PLAN BANNER */}
        {isAssigned && (
          <Animated.View entering={FadeInDown.duration(280)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: C.cyan, backgroundColor: 'rgba(61,220,255,0.06)', padding: 12, marginBottom: 12 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.cyan }}>✚</Text>
            <Text style={{ flex: 1, fontFamily: F.inter, fontSize: 12, color: C.textSecondary, lineHeight: 17 }}>
              Dieta asignada por <Text style={{ color: C.cyan, fontFamily: F.interSemi }}>{state.assignedMealsBy}</Text>. Podés ajustarla; desde el portal solo tu nutricionista puede cambiar la dieta.
            </Text>
          </Animated.View>
        )}

        {/* Keyed by the meal being edited so switching meals (or moving from
            editing to adding) remounts the form and drops the previous meal's
            picked foods, instead of clearing them from an effect. */}
        {formOpen && <TodayMealForm key={state.editingMealId ?? 'new'} />}

        {hasPlan ? (
          <>
            {/* MACROS */}
            <Card index={0} style={{ padding: 14, marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
                <Label>CONSUMIDO vs META</Label>
                <Label>{macroPct}% del día</Label>
              </View>
              {macroBars.map(b => (
                <View key={b.k} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.8, color: C.textMid, textTransform: 'uppercase' }}>{b.k}</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textSecondary }}>
                      {b.v} / <Text style={{ color: b.color }}>{b.t}</Text>
                    </Text>
                  </View>
                  <AnimatedBar fill={b.fill} color={b.color} />
                </View>
              ))}
            </Card>

            {/* MEALS */}
            {state.meals.map((m, i) => (
              <MealCard key={m.id} m={m} index={i + 1} />
            ))}
          </>
        ) : !formOpen && (
          <Card index={0} style={{ padding: 24, marginBottom: 14, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.8, color: C.textTertiary, textTransform: 'uppercase', marginBottom: 10 }}>
              SIN PLAN NUTRICIONAL
            </Text>
            <Text style={{ fontFamily: F.inter, fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 16 }}>
              Armá tu plan de comidas del día: agregá cada comida con sus macros y marcá tu cumplimiento.
            </Text>
            <PressableScale
              onPress={startAddMeal}
              haptic="medium"
              style={{ backgroundColor: C.cyan, paddingVertical: 12, paddingHorizontal: 22 }}
            >
              <Text style={{ fontFamily: F.monoXBold, fontSize: 11, letterSpacing: 0.6, color: C.bg, textTransform: 'uppercase' }}>
                + CREAR MI PLAN
              </Text>
            </PressableScale>
          </Card>
        )}

        {hasPlan && !formOpen && (
          <PressableScale
            onPress={startAddMeal}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#3a3a40', borderStyle: 'dashed', backgroundColor: C.bgEl, padding: 14, marginBottom: 14 }}
          >
            <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, color: C.textSecondary, textTransform: 'uppercase' }}>
              + AGREGAR COMIDA
            </Text>
          </PressableScale>
        )}

        {/* AGUA — tied to today's date, not the day being browsed */}
        <Card index={hasPlan ? 2 : 1} style={{ padding: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.8, color: state.water >= WATER_MAX ? C.orange : C.cyan, textTransform: 'uppercase' }}>
              {state.water >= WATER_MAX ? '⚡ ENERGÍA AL MÁXIMO' : 'HIDRATACIÓN'}
            </Text>
            <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.textPrimary }}>
              <Text style={{ fontFamily: F.monoXBold }}>{(state.water * 0.35).toFixed(2)}</Text>
              <Text style={{ color: C.textTertiary, fontSize: 11 }}> / 3.5 L</Text>
            </Text>
          </View>
          <HydrationBottle level={state.water} max={WATER_MAX} />
          <PressableScale
            onPress={() => setWater(Math.min(WATER_MAX, state.water + 1))}
            haptic="medium"
            disabled={state.water >= WATER_MAX}
            style={{
              marginTop: 12, padding: 12, alignItems: 'center', borderWidth: 1,
              borderColor: state.water >= WATER_MAX ? C.border : C.cyan,
              backgroundColor: state.water >= WATER_MAX ? C.bgEl : 'rgba(61,220,255,0.08)',
            }}
          >
            <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: state.water >= WATER_MAX ? C.textTertiary : C.cyan }}>
              {state.water >= WATER_MAX ? '✓ BOTELLA COMPLETA' : '+ AGREGAR VASO · 0.35 L'}
            </Text>
          </PressableScale>
        </Card>
        </>
        ) : (
          <OtherDayMealEditor weekday={selectedWeekday} onChanged={refreshWeekMealCounts} />
        )}
      </View>
    </ScrollView>
  );
}
