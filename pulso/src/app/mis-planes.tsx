import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ReactNode, useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Paywall } from '@/components/paywall';
import { Label, PressableScale, SMALL_TARGET_HIT_SLOP } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import { useApp } from '@/context/app-state';
import { useEntitlement } from '@/context/entitlement';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import {
  archiveMealPlan,
  getMealPlanOutline,
  listMealPlans,
  MealPlanOrigin,
  MealPlanSummary,
  renameMealPlan,
} from '@/db/nutrition';
import { archiveProgram, getProgramOutline, listPrograms, ProgramOrigin, ProgramSummary, renameProgram } from '@/db/plan';
import { mondayOf, WEEKDAY_DISPLAY_ORDER, WEEKDAY_LABELS, WEEKDAY_SHORT_LABELS, weekdayOf } from '@/lib/dates';
import { canCreateOwnPlan, lockedPlanIds, nextPlanName, OWN_PLAN_LIMIT_ERROR } from '@/lib/plan-limits';
import { sessionTime } from '@/lib/pulse-engine';

type Tab = 'entreno' | 'dieta';

function trainingOriginLabel(origin: ProgramOrigin, coachName: string | null): string {
  if (origin === 'coach') return coachName ? `COACH · ${coachName.toUpperCase()}` : 'DE TU COACH';
  if (origin === 'ai') return 'PULSO IA';
  return 'PROPIO';
}

function mealOriginLabel(origin: MealPlanOrigin, nutritionistName: string | null): string {
  if (origin === 'nutritionist') return nutritionistName ? `NUTRICIÓN · ${nutritionistName.toUpperCase()}` : 'DE TU NUTRICIONISTA';
  if (origin === 'ai') return 'PULSO IA';
  return 'PROPIO';
}

function activeDays(dayCounts: Record<number, number>): number {
  return Object.values(dayCounts).filter(count => count > 0).length;
}

function daysLabel(days: number): string {
  return `${days} DÍA${days === 1 ? '' : 'S'}`;
}

function weekNumber(startDate: string): number {
  const start = new Date(`${startDate}T00:00:00`);
  return Math.max(1, Math.floor((mondayOf(new Date()).getTime() - mondayOf(start).getTime()) / (7 * 86_400_000)) + 1);
}

/**
 * The athlete chooses how to train and eat without losing a professional plan:
 * every plan stays here, one per discipline is active, and switching is an
 * explicit inline choice. Own plans beyond the first need PULSO Plus; without
 * it the extra ones stay visible but read-only (lib/plan-limits).
 */
export default function MisPlanesScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const C = useColors();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>(params.tab === 'dieta' ? 'dieta' : 'entreno');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <PressableScale
          onPress={() => router.back()}
          accessibilityLabel="Volver"
          style={{ width: 44, height: 44, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontFamily: F.mono, fontSize: 15, color: C.textPrimary }}>←</Text>
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Label>{tab === 'entreno' ? 'ENTRENO' : 'DIETA'}</Label>
          <Text accessibilityRole="header" style={{ fontFamily: F.grotesk, fontSize: 23, color: C.textPrimary, marginTop: 2 }}>Mis planes</Text>
        </View>
      </View>

      <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderWidth: 1, borderColor: C.border, marginBottom: 20 }}>
        {(['entreno', 'dieta'] as const).map(value => (
          <PressableScale
            key={value}
            onPress={() => setTab(value)}
            accessibilityRole="tab"
            selected={tab === value}
            containerStyle={{ flex: 1 }}
            style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: tab === value ? C.card : 'transparent' }}
          >
            <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 1, color: tab === value ? C.textPrimary : C.textTertiary }}>
              {value === 'entreno' ? 'ENTRENO' : 'DIETA'}
            </Text>
          </PressableScale>
        ))}
      </View>

      {tab === 'entreno' ? <TrainingPlans /> : <MealPlans />}
    </ScrollView>
  );
}

// ── training ────────────────────────────────────────────────────────────────

function TrainingPlans() {
  const { state, activatePlan, createTrainingPlan, reloadAll } = useApp();
  const { userId } = useSession();
  const { accent } = usePreferences();
  const C = useColors();
  const [programs, setPrograms] = useState<ProgramSummary[] | null>(null);

  const load = useCallback(() => {
    if (!userId) return;
    listPrograms(userId).then(setPrograms).catch(e => console.error('[plans]', e));
  }, [userId]);
  useFocusEffect(load);

  const loggedToday = Object.values(state.log).some(sets => sets.length > 0);
  const sessionInProgress = loggedToday && !state.sessionDone;
  const todayWeekday = weekdayOf(new Date());
  const weekStart = mondayOf(new Date()).getTime();
  const trainedThisWeek = new Set(state.trainingSessions
    .filter(session => session.status === 'completed' && sessionTime(session) >= weekStart)
    .map(session => weekdayOf(new Date(sessionTime(session)))));

  /** "HOY" or the weekday of the first session the plan would bring. */
  function nextSession(program: ProgramSummary): { label: string; count: number } | null {
    for (let offset = 0; offset < 7; offset++) {
      if (offset === 0 && (state.sessionDone || state.freeSession)) continue;
      const weekday = ((todayWeekday - 1 + offset) % 7) + 1;
      const count = program.dayCounts[weekday] ?? 0;
      if (count > 0) return { label: offset === 0 ? 'hoy' : WEEKDAY_LABELS[weekday].toLowerCase(), count };
    }
    return null;
  }

  const active = programs?.find(program => program.active) ?? null;

  return (
    <PlanLibrary
      noun="entreno"
      items={programs?.map(program => ({
        ...program,
        originLabel: trainingOriginLabel(program.origin, state.assignedWorkoutBy),
        detail: daysLabel(activeDays(program.dayCounts)),
      })) ?? null}
      blockedReason={sessionInProgress ? 'Tenés una sesión en curso. Terminala en Entreno para cambiar o crear un plan.' : null}
      activeCard={active && (
        <>
          <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textSecondary }}>
            {`SEMANA ${weekNumber(active.startDate)} · ${daysLabel(activeDays(active.dayCounts))} CON EJERCICIOS`}
          </Text>
          <View
            accessible
            accessibilityLabel={`Esta semana: ${WEEKDAY_DISPLAY_ORDER.filter(day => trainedThisWeek.has(day)).length} sesiones hechas.`}
            style={{ flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.border, paddingVertical: 10, marginTop: 4 }}
          >
            {WEEKDAY_DISPLAY_ORDER.map(day => {
              const planned = (active.dayCounts[day] ?? 0) > 0;
              const done = trainedThisWeek.has(day);
              const isToday = day === todayWeekday;
              return (
                <View key={day} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
                  <Text style={{ fontFamily: F.monoBold, fontSize: 12, color: done ? C.textPrimary : isToday ? accent : planned ? C.textSecondary : C.textTertiary }}>
                    {done ? '✓' : planned ? active.dayCounts[day] : '—'}
                  </Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 9, color: isToday ? accent : C.textTertiary }}>{WEEKDAY_SHORT_LABELS[day]}</Text>
                </View>
              );
            })}
          </View>
        </>
      )}
      openLabel="ABRIR ENTRENAMIENTO"
      onOpen={() => router.dismissTo('/entreno')}
      switchText={(item, current) => {
        const program = programs?.find(p => p.id === item.id);
        const next = program ? nextSession(program) : null;
        return (next
          ? `Tu próxima sesión (${next.label}) pasa a tener ${next.count} ejercicio${next.count === 1 ? '' : 's'} de “${item.name}”.`
          : `“${item.name}” todavía no tiene ejercicios: Entreno va a quedar vacío hasta que agregues alguno.`)
          + (current ? ` “${current.name}” queda guardado acá y podés volver cuando quieras.` : '')
          + (state.freeSession ? ' Hoy seguís con tu sesión libre.' : '');
      }}
      onActivate={activatePlan}
      onCreate={async (name, sourceId, entitled) => {
        await createTrainingPlan({ name, sourceProgramId: sourceId, entitled });
        router.dismissTo('/entreno');
      }}
      onRename={async (id, name) => {
        if (!userId) return;
        await renameProgram(userId, id, name);
        if (id === active?.id) await reloadAll();
      }}
      onArchive={id => userId ? archiveProgram(userId, id) : Promise.resolve()}
      loadOutline={async id => userId
        ? (await getProgramOutline(userId, id)).map(day => ({
            weekday: day.weekday,
            lines: day.exercises.map(e => `${e.nombre} · ${e.target}×${e.reps}`),
          }))
        : []}
      reload={load}
      footer="Cambiar de plan no borra ninguno. Si tu coach actualiza su plan, lo vas a encontrar acá con los cambios. Si compartís tu entrenamiento, tu coach solo ve si su plan es el activo, nunca el contenido de tus otros planes."
    />
  );
}

// ── nutrition ───────────────────────────────────────────────────────────────

function MealPlans() {
  const { state, activateMealPlan, createMealPlan, reloadAll } = useApp();
  const { userId } = useSession();
  const { accent } = usePreferences();
  const C = useColors();
  const [plans, setPlans] = useState<MealPlanSummary[] | null>(null);

  const load = useCallback(() => {
    if (!userId) return;
    listMealPlans(userId).then(setPlans).catch(e => console.error('[meal-plans]', e));
  }, [userId]);
  useFocusEffect(load);

  const todayWeekday = weekdayOf(new Date());
  const active = plans?.find(plan => plan.active) ?? null;
  const kcalDetail = (plan: MealPlanSummary) => plan.targetKcal > 0 ? ` · ~${plan.targetKcal} KCAL/DÍA` : '';

  return (
    <PlanLibrary
      noun="dieta"
      items={plans?.map(plan => ({
        ...plan,
        originLabel: mealOriginLabel(plan.origin, state.assignedMealsBy),
        detail: `${daysLabel(activeDays(plan.dayCounts))}${kcalDetail(plan)}`,
      })) ?? null}
      blockedReason={null}
      activeCard={active && (
        <>
          <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textSecondary }}>
            {`${daysLabel(activeDays(active.dayCounts))} CON COMIDAS${kcalDetail(active)}`}
          </Text>
          <View
            accessible
            accessibilityLabel={`Comidas por día: ${WEEKDAY_DISPLAY_ORDER.map(day => `${WEEKDAY_LABELS[day].toLowerCase()} ${active.dayCounts[day] ?? 0}`).join(', ')}.`}
            style={{ flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.border, paddingVertical: 10, marginTop: 4 }}
          >
            {WEEKDAY_DISPLAY_ORDER.map(day => {
              const count = active.dayCounts[day] ?? 0;
              const isToday = day === todayWeekday;
              return (
                <View key={day} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
                  <Text style={{ fontFamily: F.monoBold, fontSize: 12, color: isToday ? accent : count ? C.textSecondary : C.textTertiary }}>
                    {count || '—'}
                  </Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 9, color: isToday ? accent : C.textTertiary }}>{WEEKDAY_SHORT_LABELS[day]}</Text>
                </View>
              );
            })}
          </View>
        </>
      )}
      openLabel="ABRIR DIETA"
      onOpen={() => router.dismissTo('/dieta')}
      switchText={(item, current) => {
        const plan = plans?.find(p => p.id === item.id);
        const today = plan?.dayCounts[todayWeekday] ?? 0;
        return (today
          ? `Desde ahora Dieta sigue “${item.name}”: hoy tiene ${today} comida${today === 1 ? '' : 's'}.`
          : `“${item.name}” no tiene comidas para hoy: Dieta va a quedar vacía hasta que agregues alguna.`)
          + ' Lo que ya marcaste hoy queda en tu historial.'
          + (current ? ` “${current.name}” queda guardado acá.` : '');
      }}
      onActivate={activateMealPlan}
      onCreate={async (name, sourceId, entitled) => {
        await createMealPlan({ name, sourceMealPlanId: sourceId, entitled });
        router.dismissTo('/dieta');
      }}
      onRename={async (id, name) => {
        if (!userId) return;
        await renameMealPlan(userId, id, name);
        if (id === active?.id) await reloadAll();
      }}
      onArchive={id => userId ? archiveMealPlan(userId, id) : Promise.resolve()}
      loadOutline={async id => userId
        ? (await getMealPlanOutline(userId, id)).map(day => ({
            weekday: day.weekday,
            lines: day.meals.map(meal => [meal.time, meal.label, meal.kcal ? `${meal.kcal} kcal` : ''].filter(Boolean).join(' · ')),
          }))
        : []}
      reload={load}
      footer="Cambiar de dieta no borra ninguna. Si tu nutricionista actualiza su plan, lo vas a encontrar acá con los cambios. Si compartís tu nutrición, solo ve si su plan es el activo, nunca el contenido de tus otros planes."
    />
  );
}

// ── shared library ──────────────────────────────────────────────────────────

interface PlanItem {
  id: string;
  name: string;
  origin: string;
  active: boolean;
  createdAt: number;
  lastActivatedAt: number | null;
  originLabel: string;
  detail: string;
}

type Panel = 'activate' | 'view' | 'rename' | 'delete';

function PlanLibrary({
  noun, items, blockedReason, activeCard, openLabel, onOpen, switchText,
  onActivate, onCreate, onRename, onArchive, loadOutline, reload, footer,
}: {
  noun: Tab;
  items: PlanItem[] | null;
  /** Non-null while switching or creating isn't possible right now. */
  blockedReason: string | null;
  activeCard: ReactNode;
  openLabel: string;
  onOpen: () => void;
  switchText: (item: PlanItem, current: PlanItem | null) => string;
  onActivate: (id: string) => Promise<void>;
  onCreate: (name: string | undefined, sourceId: string | null, entitled: boolean) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  loadOutline: (id: string) => Promise<{ weekday: number; lines: string[] }[]>;
  reload: () => void;
  footer: string;
}) {
  const C = useColors();
  const { accent } = usePreferences();
  const { entitled, loading: entitlementLoading } = useEntitlement();
  const [open, setOpen] = useState<{ id: string; panel: Panel } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [outline, setOutline] = useState<{ weekday: number; lines: string[] }[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [paywall, setPaywall] = useState(false);

  if (!items) return <ActivityIndicator color={C.textTertiary} style={{ marginTop: 40 }} accessibilityLabel="Cargando planes" />;

  // While the subscription is still resolving nothing is locked or unlocked.
  const locked = entitlementLoading ? new Set<string>() : lockedPlanIds(items, entitled);
  const canCreate = !entitlementLoading && canCreateOwnPlan(items, entitled);
  const active = items.find(item => item.active) ?? null;
  const others = items.filter(item => !item.active);
  const blocked = blockedReason != null;

  function toggle(id: string, panel: Panel) {
    setError(null);
    if (open?.id === id && open.panel === panel) { setOpen(null); return; }
    setOpen({ id, panel });
    if (panel === 'rename') setDraftName(items?.find(item => item.id === id)?.name ?? '');
    if (panel === 'view') {
      setOutline(null);
      loadOutline(id).then(setOutline).catch(e => { console.error('[plan-outline]', e); setOutline([]); });
    }
  }

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setOpen(null);
      reload();
    } catch (e) {
      console.error('[plan-library]', e);
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await onCreate(newName.trim() || undefined, sourceId, entitled);
      setCreating(false);
      setNewName('');
      setSourceId(null);
    } catch (e) {
      if (e instanceof Error && e.message === OWN_PLAN_LIMIT_ERROR) {
        setCreating(false);
        setPaywall(true);
        return;
      }
      console.error('[plan-create]', e);
      setError('No se pudo crear el plan. Intentá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  const button = (label: string, onPress: () => void, options: { primary?: boolean; disabled?: boolean; hint?: string } = {}) => (
    <PressableScale
      onPress={onPress}
      disabled={options.disabled || busy}
      accessibilityHint={options.hint}
      haptic={options.primary ? 'success' : 'light'}
      containerStyle={{ flex: 1 }}
      style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: options.primary ? C.textSecondary : C.border, opacity: options.disabled ? 0.5 : 1 }}
    >
      <Text style={{ fontFamily: F.monoBold, fontSize: 10, color: options.primary ? C.textPrimary : C.textSecondary }}>{label}</Text>
    </PressableScale>
  );

  const link = (label: string, onPress: () => void, selected = false) => (
    <PressableScale onPress={onPress} hitSlop={SMALL_TARGET_HIT_SLOP} selected={selected} disabled={busy}>
      <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.8, color: selected ? C.textPrimary : C.textTertiary }}>{label}</Text>
    </PressableScale>
  );

  const renamePanel = (item: PlanItem) => (
    <Animated.View entering={FadeIn.duration(160)} style={{ marginTop: 10, padding: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, gap: 10 }}>
      <TextInput
        value={draftName}
        onChangeText={setDraftName}
        maxLength={40}
        autoFocus
        accessibilityLabel="Nombre del plan"
        placeholderTextColor={C.textTertiary}
        style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 10, color: C.textPrimary, fontFamily: F.inter, fontSize: 14 }}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {button('GUARDAR', () => void run(() => onRename(item.id, draftName), 'No se pudo renombrar.'), { primary: true, disabled: !draftName.trim() })}
        {button('CANCELAR', () => setOpen(null))}
      </View>
    </Animated.View>
  );

  return (
    <>
      {active && (
        <Animated.View entering={FadeIn.duration(200)} style={{ borderWidth: 1, borderColor: accent, backgroundColor: C.card, padding: 14, gap: 8, marginBottom: 22 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <View style={{ borderWidth: 1, borderColor: accent, backgroundColor: withAlpha(accent, 0.1), paddingHorizontal: 7, paddingVertical: 3 }}>
              <Text style={{ fontFamily: F.monoBold, fontSize: 9, letterSpacing: 1, color: C.textPrimary }}>ACTIVO</Text>
            </View>
            <Label>{active.originLabel}</Label>
          </View>
          <Text style={{ fontFamily: F.grotesk, fontSize: 24, color: C.textPrimary }}>{active.name}</Text>
          {activeCard}
          {active.origin === 'own' && !locked.has(active.id) && (
            <View style={{ flexDirection: 'row', gap: 18, marginTop: 2 }}>
              {link('RENOMBRAR', () => toggle(active.id, 'rename'), open?.id === active.id)}
            </View>
          )}
          {open?.id === active.id && open.panel === 'rename' && renamePanel(active)}
          <PressableScale
            onPress={onOpen}
            haptic="medium"
            style={{ minHeight: 46, justifyContent: 'center', alignItems: 'center', backgroundColor: accent, marginTop: 4 }}
          >
            <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, color: C.onAccent }}>{openLabel}</Text>
          </PressableScale>
        </Animated.View>
      )}

      {others.length > 0 && (
        <>
          <Label style={{ marginBottom: 6 }}>OTROS PLANES</Label>
          {others.map(item => {
            const isLocked = locked.has(item.id);
            const panel = open?.id === item.id ? open.panel : null;
            return (
              <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: isLocked ? C.textSecondary : C.textPrimary }}>{item.name}</Text>
                    <Label>{`${item.originLabel} · ${item.detail}${isLocked ? ' · SOLO LECTURA' : ''}`}</Label>
                  </View>
                  {panel !== 'activate' && (
                    <PressableScale
                      onPress={() => isLocked ? setPaywall(true) : toggle(item.id, 'activate')}
                      disabled={!isLocked && blocked}
                      accessibilityHint={isLocked ? 'Este plan necesita PULSO Plus para activarse' : 'Muestra qué cambia antes de confirmar'}
                      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1, borderColor: isLocked ? withAlpha(accent, 0.5) : C.border, opacity: !isLocked && blocked ? 0.5 : 1 }}
                    >
                      <Text style={{ fontFamily: F.monoBold, fontSize: 10, color: isLocked ? accent : C.textPrimary }}>{isLocked ? 'PLUS' : 'ACTIVAR'}</Text>
                    </PressableScale>
                  )}
                </View>

                <View style={{ flexDirection: 'row', gap: 18, marginTop: 8 }}>
                  {link('VER', () => toggle(item.id, 'view'), panel === 'view')}
                  {item.origin === 'own' && !isLocked && link('RENOMBRAR', () => toggle(item.id, 'rename'), panel === 'rename')}
                  {item.origin === 'own' && link('BORRAR', () => toggle(item.id, 'delete'), panel === 'delete')}
                </View>

                {panel === 'activate' && (
                  <Animated.View entering={FadeIn.duration(160)} style={{ marginTop: 10, padding: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, gap: 10 }}>
                    <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textSecondary }}>{switchText(item, active)}</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {button(busy ? 'CAMBIANDO…' : 'CAMBIAR DE PLAN', () => void run(() => onActivate(item.id), 'No se pudo cambiar de plan.'), { primary: true })}
                      {button('CANCELAR', () => setOpen(null))}
                    </View>
                  </Animated.View>
                )}

                {panel === 'view' && (
                  <Animated.View entering={FadeIn.duration(160)} style={{ marginTop: 10, padding: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, gap: 10 }}>
                    {!outline && <ActivityIndicator color={C.textTertiary} accessibilityLabel="Cargando plan" />}
                    {outline && outline.every(day => !day.lines.length) && (
                      <Text style={{ fontFamily: F.inter, fontSize: 12, color: C.textSecondary }}>Este plan todavía está vacío.</Text>
                    )}
                    {outline && WEEKDAY_DISPLAY_ORDER.map(weekday => {
                      const day = outline.find(d => d.weekday === weekday);
                      if (!day?.lines.length) return null;
                      return (
                        <View key={weekday} style={{ gap: 3 }}>
                          <Label>{WEEKDAY_LABELS[weekday]}</Label>
                          {day.lines.map((line, i) => (
                            <Text key={i} style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 17, color: C.textSecondary }}>{line}</Text>
                          ))}
                        </View>
                      );
                    })}
                  </Animated.View>
                )}

                {panel === 'rename' && renamePanel(item)}

                {panel === 'delete' && (
                  <Animated.View entering={FadeIn.duration(160)} style={{ marginTop: 10, padding: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, gap: 10 }}>
                    <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textSecondary }}>
                      {`“${item.name}” deja de aparecer en tus planes. ${noun === 'entreno' ? 'Las sesiones' : 'Las comidas'} que ya registraste con él quedan en tu historial.`}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {button('BORRAR PLAN', () => void run(() => onArchive(item.id), 'No se pudo borrar el plan.'), { primary: true })}
                      {button('CANCELAR', () => setOpen(null))}
                    </View>
                  </Animated.View>
                )}
              </View>
            );
          })}
        </>
      )}

      {blockedReason && (
        <Text style={{ fontFamily: F.inter, fontSize: 11, lineHeight: 16, color: C.orange, marginTop: 4 }}>{blockedReason}</Text>
      )}
      {error && (
        <Text accessibilityRole="alert" style={{ fontFamily: F.inter, fontSize: 11, lineHeight: 16, color: C.red, marginTop: 4 }}>{error}</Text>
      )}

      {/* NEW PLAN — empty or a copy of any plan, becomes the active one */}
      <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 14, marginTop: 10 }}>
        {!creating ? (
          <PressableScale
            onPress={() => canCreate ? setCreating(true) : setPaywall(true)}
            disabled={blocked || entitlementLoading}
            accessibilityHint={canCreate ? 'Crea un plan propio vacío o copiando otro' : 'Más de un plan propio necesita PULSO Plus'}
            style={{ minHeight: 46, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: canCreate ? C.textSecondary : withAlpha(accent, 0.5), opacity: blocked ? 0.5 : 1 }}
          >
            <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, color: canCreate ? C.textPrimary : accent }}>
              {canCreate ? '+ NUEVO PLAN' : '+ NUEVO PLAN · PLUS'}
            </Text>
          </PressableScale>
        ) : (
          <Animated.View entering={FadeIn.duration(160)} style={{ padding: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, gap: 10 }}>
            <Label>NOMBRE</Label>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              maxLength={40}
              accessibilityLabel="Nombre del plan nuevo"
              placeholder={sourceId
                ? `${items.find(item => item.id === sourceId)?.name ?? ''} (copia)`
                : nextPlanName('Plan personal', items.map(item => item.name))}
              placeholderTextColor={C.textTertiary}
              style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 10, color: C.textPrimary, fontFamily: F.inter, fontSize: 14 }}
            />
            <Label>EMPEZAR DESDE</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[{ id: null, name: 'En blanco' }, ...items].map(option => {
                const selected = sourceId === option.id;
                return (
                  <PressableScale
                    key={option.id ?? 'blank'}
                    onPress={() => setSourceId(option.id)}
                    selected={selected}
                    accessibilityRole="radio"
                    style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: selected ? accent : C.border, backgroundColor: selected ? withAlpha(accent, 0.1) : 'transparent' }}
                  >
                    <Text style={{ fontFamily: F.mono, fontSize: 10, color: selected ? C.textPrimary : C.textSecondary }}>
                      {option.id ? `COPIAR ${option.name.toUpperCase()}` : 'EN BLANCO'}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
            <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textSecondary }}>
              {`Pasa a ser tu plan activo para que lo armes en ${noun === 'entreno' ? 'Entreno' : 'Dieta'}.`}
              {active ? ` “${active.name}” queda guardado acá.` : ''}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {button(busy ? 'CREANDO…' : 'CREAR PLAN', () => void create(), { primary: true, disabled: blocked })}
              {button('CANCELAR', () => { setCreating(false); setSourceId(null); setNewName(''); })}
            </View>
          </Animated.View>
        )}
        {!entitled && !entitlementLoading && (
          <Text style={{ fontFamily: F.inter, fontSize: 11, lineHeight: 16, color: C.textTertiary, marginTop: 8 }}>
            {locked.size > 0
              ? 'Sin PULSO Plus seguís usando tu plan propio más reciente; los demás quedan en solo lectura hasta que renueves.'
              : 'Sin PULSO Plus podés tener un plan propio. Los de tu equipo y el de PULSO IA no cuentan.'}
          </Text>
        )}
      </View>

      <View style={{ borderWidth: 1, borderColor: C.border, padding: 12, marginTop: 22, gap: 4 }}>
        <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }}>Tu elección, tus datos</Text>
        <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textSecondary }}>{footer}</Text>
      </View>

      <Paywall visible={paywall} onClose={() => setPaywall(false)} reason="plan_limit" />
    </>
  );
}
