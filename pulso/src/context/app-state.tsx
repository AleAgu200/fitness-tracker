import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState as RNAppState } from 'react-native';

import {
  evaluateAchievements,
  getCompletedSessionsCount,
} from '@/db/achievements';
import {
  computeStreak,
  getHeatmap,
  getWeekDays,
  upsertTodayCheckIn,
  WeekDay,
} from '@/db/checkins';
import {
  addPhoto as dbAddPhoto,
  getMetricHistories,
  getPhotos,
  logMeasurement,
  MetricHistories,
  MetricPoint,
  ProgressPhoto,
} from '@/db/measurements';
import {
  addMealSlot,
  deleteMealSlot,
  getMealPlan,
  getTodayMealEntries,
  getTodayWater,
  MealStatusDb,
  setMealEntry,
  setTodayWater,
  updateMealSlot,
} from '@/db/nutrition';
import { ExercisePlanValues } from '@/components/exercise-plan-form';
import {
  addPlanExercise,
  applySuggestedPlan as dbApplySuggestedPlan,
  deletePlanExercise,
  getPlan,
  updatePlanExercise,
} from '@/db/plan';
import { getAthleteProfile, getLatestWeightMeasurement, saveAthleteProfile } from '@/db/profile';
import { weekdayOf } from '@/lib/dates';
import { getInitials } from '@/lib/names';
import {
  finishSession as dbFinishSession,
  getPreviousExerciseSession,
  getPRHistory,
  getTodaySession,
  logSet,
  PreviousExerciseSession,
  PRHistoryItem,
} from '@/db/workout';
import { CLEARED_REST_STATE, loadRestTimerState, RestTimerState, saveRestTimerState } from '@/lib/rest-timer-store';
import { addWidgetRestListener } from '@/modules/pulso-widget';
import { getStoredAssignmentMeta, syncAssignments } from '@/lib/sync';
import { pushAthleteProfile, syncAthleteProfile } from '@/lib/profile-sync';
import { formatWeight } from '@/lib/units';
import { usePreferences } from './preferences';
import { useSession } from './session';

export type MealStatus = 'cumplido' | 'sustituido' | 'pendiente';
export type MetricKey = 'peso' | 'grasa' | 'musculo';
export type { WeekDay, MetricPoint, ProgressPhoto, PreviousExerciseSession, PRHistoryItem, ExercisePlanValues };

const STATUS_TO_DB: Record<MealStatus, MealStatusDb> = {
  cumplido: 'completed',
  sustituido: 'substituted',
  pendiente: 'pending',
};
const STATUS_FROM_DB: Record<MealStatusDb, MealStatus> = {
  completed: 'cumplido',
  substituted: 'sustituido',
  pending: 'pendiente',
};

export interface ExerciseSet {
  reps: number;
  peso: number;
  rpe: number;
  pr: boolean;
}

export interface Exercise {
  id: string;          // plan slot id
  exerciseId: string;  // catalog exercise id
  nombre: string;
  sub: string;
  target: number;
  reps: number;
  peso: number;
  step: number;
  basePR: number;
  muscleGroup: 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'full' | null;
}

export interface Meal {
  id: string;
  label: string;
  time: string;
  n: string;
  kcal: number;
  p: number;
  c: number;
  g: number;
}

export interface MealDraftUI {
  label: string;
  time: string;
  n: string;
  kcal: string;
  p: string;
  c: string;
  g: string;
}

export interface UserProfile {
  name: string;
  initials: string;
  firstName: string;
}

export interface ProfileData {
  fullName: string;
  sex: 'M' | 'F' | 'X' | null;
  dateOfBirth: string | null;
  heightCm: number | null;
  goalWeightKg: number | null;
}

const REST_DEFAULT = 90;

const EMPTY_MEAL_DRAFT: MealDraftUI = { label: '', time: '', n: '', kcal: '', p: '', c: '', g: '' };

export interface AppState {
  ready: boolean;
  profile: UserProfile | null;
  profileData: ProfileData | null;
  goalWeightKg: number | null;

  // supervision — non-null when a professional assigned the plan (attribution only)
  assignedWorkoutBy: string | null;
  assignedMealsBy: string | null;

  // habits / derived
  racha: number;
  weekDays: WeekDay[];
  heatmap: number[][];
  sessionsCount: number;
  earned: Record<string, number>;
  prHistory: PRHistoryItem[];

  // nutrition
  meals: Meal[];
  mealStatus: Record<string, MealStatus>;
  mealNotes: Record<string, string>;
  water: number;
  addingMeal: boolean;
  editingMealId: string | null;
  mealDraft: MealDraftUI;

  // workout — always today's plan (see components/other-day-plan-editor for other days)
  exercises: Exercise[];
  exIndex: number;
  log: Record<string, ExerciseSet[]>;
  previousSessions: Record<string, PreviousExerciseSession>;
  prMap: Record<string, number>;
  sessionDone: boolean;
  curReps: number;
  curPeso: number;
  curRpe: number;
  editingEx: boolean;
  addingEx: boolean;
  restActive: boolean;
  restLeft: number;
  restTotal: number;
  prFlash: { ej: string; val: string } | null;

  // progress
  metric: MetricKey;
  metricVals: Record<MetricKey, number>;
  histories: MetricHistories;
  loggedToday: Record<MetricKey, boolean>;
  photos: ProgressPhoto[];
}

const initialState: AppState = {
  ready: false,
  profile: null,
  profileData: null,
  goalWeightKg: null,
  assignedWorkoutBy: null,
  assignedMealsBy: null,
  racha: 0,
  weekDays: [],
  heatmap: Array.from({ length: 12 }, () => Array.from({ length: 7 }, () => 0)),
  sessionsCount: 0,
  earned: {},
  prHistory: [],
  meals: [],
  mealStatus: {},
  mealNotes: {},
  water: 0,
  addingMeal: false,
  editingMealId: null,
  mealDraft: EMPTY_MEAL_DRAFT,
  exercises: [],
  exIndex: 0,
  log: {},
  previousSessions: {},
  prMap: {},
  sessionDone: false,
  curReps: 8,
  curPeso: 0,
  curRpe: 8,
  editingEx: false,
  addingEx: false,
  restActive: false,
  restLeft: REST_DEFAULT,
  restTotal: REST_DEFAULT,
  prFlash: null,
  metric: 'peso',
  metricVals: { peso: 70, grasa: 20, musculo: 35 },
  histories: { peso: [], grasa: [], musculo: [] },
  loggedToday: { peso: false, grasa: false, musculo: false },
  photos: [],
};

interface AppContextValue {
  state: AppState;
  // profile
  saveProfile: (data: ProfileData) => Promise<void>;
  reloadAll: () => Promise<void>;
  // nutrition
  setMeal: (id: string, st: MealStatus) => void;
  setMealNote: (id: string, txt: string) => void;
  setWater: (n: number) => void;
  startAddMeal: () => void;
  startEditMeal: (id: string) => void;
  cancelMealForm: () => void;
  setMealDraft: (f: keyof MealDraftUI, v: string) => void;
  saveMealForm: () => void;
  deleteMeal: () => void;
  // workout
  selectEx: (i: number) => void;
  incPeso: () => void;
  decPeso: () => void;
  incReps: () => void;
  decReps: () => void;
  setRpe: (v: number) => void;
  guardarSet: () => void;
  finishWorkout: () => void;
  applySuggestedPlan: () => void;
  startEditEx: () => void;
  startAddEx: () => void;
  cancelExForm: () => void;
  saveEditEx: (values: ExercisePlanValues) => void;
  saveAddEx: (values: ExercisePlanValues) => void;
  deleteEx: () => void;
  addRest: () => void;
  reduceRest: () => void;
  skipRest: () => void;
  dismissPrFlash: () => void;
  addRecommendedExercise: (exercise: {
    name: string;
    sets: number;
    reps: number;
    weight: number;
    step: number;
  }) => Promise<void>;
  // progress
  setMetric: (m: MetricKey) => void;
  incWeighIn: () => void;
  decWeighIn: () => void;
  registrarPeso: () => void;
  addProgressPhoto: (uri: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const { userId } = useSession();
  const { weightUnit } = usePreferences();

  const stateRef = useRef(state);
  stateRef.current = state;
  const userRef = useRef<string | null>(null);
  userRef.current = userId;
  const weightUnitRef = useRef(weightUnit);
  weightUnitRef.current = weightUnit;

  const templateIdRef = useRef<string | null>(null);
  const mealPlanIdRef = useRef<string | null>(null);
  const restTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Authoritative rest-timer end timestamp — mirrored to SecureStore so the widget can read/mutate it. */
  const restEndAtRef = useRef<number | null>(null);
  const prTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!userId) {
      templateIdRef.current = null;
      mealPlanIdRef.current = null;
      setState(initialState);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        try {
          await syncAthleteProfile(userId);
        } catch (error) {
          console.warn('[profile-sync] startup deferred', error);
        }
        if (cancelled) return;

        const todayWeekday = weekdayOf(new Date());
        // Plan/meal-plan first: assignments from coach/nutritionist may replace them
        let [plan, mealPlan] = await Promise.all([getPlan(userId, todayWeekday), getMealPlan(userId)]);
        let assignedWorkoutBy: string | null = null;
        let assignedMealsBy: string | null = null;
        try {
          const sync = await syncAssignments(userId, plan.templateId, mealPlan.mealPlanId);
          assignedWorkoutBy = sync.workoutBy;
          assignedMealsBy = sync.mealsBy;
          if (sync.workoutChanged) plan = await getPlan(userId, todayWeekday);
          if (sync.mealsChanged) mealPlan = await getMealPlan(userId);
        } catch {
          // Offline — keep last-known assignment authors for attribution banners
          const meta = await getStoredAssignmentMeta(userId);
          assignedWorkoutBy = meta.workoutBy;
          assignedMealsBy = meta.mealsBy;
        }

        const [profile, session, entries, water, histories, photos] =
          await Promise.all([
            getAthleteProfile(userId),
            getTodaySession(userId),
            getTodayMealEntries(userId),
            getTodayWater(userId),
            getMetricHistories(userId),
            getPhotos(userId),
          ]);
        const [racha, weekDays, heatmap, sessionsCount, earned, prHistory] =
          await Promise.all([
            computeStreak(userId),
            getWeekDays(userId),
            getHeatmap(userId),
            getCompletedSessionsCount(userId),
            evaluateAchievements(userId),
            getPRHistory(userId),
          ]);
        if (cancelled) return;

        templateIdRef.current = plan.templateId;
        mealPlanIdRef.current = mealPlan.mealPlanId;

        const exercises: Exercise[] = plan.exercises.map(e => ({
          id: e.slotId,
          exerciseId: e.exerciseId,
          nombre: e.nombre,
          sub: `${e.target}×${e.reps} · RPE 8`,
          target: e.target,
          reps: e.reps,
          peso: e.peso,
          step: e.step,
          basePR: e.basePR,
          muscleGroup: e.muscleGroup,
        }));
        const prMap: Record<string, number> = {};
        for (const e of exercises) prMap[e.id] = e.basePR;

        const mealStatus: Record<string, MealStatus> = {};
        for (const [slotId, st] of Object.entries(entries.status)) {
          mealStatus[slotId] = STATUS_FROM_DB[st];
        }

        const lastOf = (pts: MetricPoint[], fallback: number) =>
          pts.length ? pts[pts.length - 1].value : fallback;
        const today = new Date();
        const loggedTodayFor = (pts: MetricPoint[]) =>
          pts.length > 0 &&
          pts[pts.length - 1].label ===
            `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`;

        const first = exercises[0];
        const previousPairs = await Promise.all(exercises.map(async exercise => [
          exercise.exerciseId,
          await getPreviousExerciseSession(userId, exercise.exerciseId),
        ] as const));
        if (cancelled) return;
        const previousSessions: Record<string, PreviousExerciseSession> = {};
        for (const [exerciseId, previous] of previousPairs) {
          if (previous) previousSessions[exerciseId] = previous;
        }
        setState({
          ...initialState,
          ready: true,
          profile: profile
            ? { name: profile.fullName, initials: profile.initials, firstName: profile.fullName.split(' ')[0] }
            : null,
          profileData: profile
            ? {
                fullName: profile.fullName,
                sex: profile.sex,
                dateOfBirth: profile.dateOfBirth,
                heightCm: profile.heightCm,
                goalWeightKg: profile.goalWeightKg,
              }
            : null,
          goalWeightKg: profile?.goalWeightKg ?? null,
          assignedWorkoutBy,
          assignedMealsBy,
          racha,
          weekDays,
          heatmap,
          sessionsCount,
          earned,
          prHistory,
          meals: mealPlan.meals,
          mealStatus,
          mealNotes: entries.notes,
          water,
          exercises,
          exIndex: 0,
          log: session?.log ?? {},
          previousSessions,
          prMap,
          sessionDone: session?.completed ?? false,
          curReps: first?.reps ?? 8,
          curPeso: first?.peso ?? 0,
          metricVals: {
            peso: lastOf(histories.peso, 70),
            grasa: lastOf(histories.grasa, 20),
            musculo: lastOf(histories.musculo, 35),
          },
          histories,
          loggedToday: {
            peso: loggedTodayFor(histories.peso),
            grasa: loggedTodayFor(histories.grasa),
            musculo: loggedTodayFor(histories.musculo),
          },
          photos,
        });
      } catch (e) {
        console.error('[app-state] load failed', e);
        if (!cancelled) setState(s => ({ ...s, ready: true }));
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => () => {
    if (restTimer.current) clearInterval(restTimer.current);
    if (prTimer.current) clearTimeout(prTimer.current);
    for (const t of Object.values(noteTimers.current)) clearTimeout(t);
  }, []);

  // ── derived refreshers ────────────────────────────────────────────────────

  const refreshDerived = useCallback(async () => {
    const uid = userRef.current;
    if (!uid) return;
    try {
      const [racha, weekDays, heatmap, sessionsCount, earned, prHistory] = await Promise.all([
        computeStreak(uid),
        getWeekDays(uid),
        getHeatmap(uid),
        getCompletedSessionsCount(uid),
        evaluateAchievements(uid),
        getPRHistory(uid),
      ]);
      setState(s => ({ ...s, racha, weekDays, heatmap, sessionsCount, earned, prHistory }));
    } catch (e) {
      console.error('[app-state] refresh failed', e);
    }
  }, []);

  /** Persist today's check-in from the freshest state, then refresh streak/heatmap */
  const syncCheckIn = useCallback(async (overrides?: { workoutCompleted?: boolean }) => {
    const uid = userRef.current;
    if (!uid) return;
    const s = stateRef.current;
    const nutritionCompleted =
      s.meals.length > 0 &&
      s.meals.every(m => ['cumplido', 'sustituido'].includes(s.mealStatus[m.id] ?? ''));
    try {
      await upsertTodayCheckIn(uid, {
        workoutCompleted: overrides?.workoutCompleted ?? s.sessionDone,
        nutritionCompleted,
        hydrationCompleted: s.water >= 10,
      });
      await refreshDerived();
    } catch (e) {
      console.error('[app-state] check-in failed', e);
    }
  }, [refreshDerived]);

  const reloadPlan = useCallback(async () => {
    const uid = userRef.current;
    if (!uid) return;
    const plan = await getPlan(uid, weekdayOf(new Date()));
    templateIdRef.current = plan.templateId;
    const previousPairs = await Promise.all(plan.exercises.map(async exercise => [
      exercise.exerciseId,
      await getPreviousExerciseSession(uid, exercise.exerciseId),
    ] as const));
    setState(s => {
      const exercises: Exercise[] = plan.exercises.map(e => ({
        id: e.slotId,
        exerciseId: e.exerciseId,
        nombre: e.nombre,
        sub: `${e.target}×${e.reps} · RPE 8`,
        target: e.target,
        reps: e.reps,
        peso: e.peso,
        step: e.step,
        basePR: e.basePR,
        muscleGroup: e.muscleGroup,
      }));
      const prMap: Record<string, number> = {};
      for (const e of exercises) prMap[e.id] = Math.max(e.basePR, s.prMap[e.id] ?? 0);
      const exIndex = Math.min(s.exIndex, Math.max(0, exercises.length - 1));
      const cur = exercises[exIndex];
      const previousSessions: Record<string, PreviousExerciseSession> = {};
      for (const [exerciseId, previous] of previousPairs) {
        if (previous) previousSessions[exerciseId] = previous;
      }
      return {
        ...s,
        exercises,
        previousSessions,
        prMap,
        exIndex,
        curReps: cur?.reps ?? s.curReps,
        curPeso: cur?.peso ?? s.curPeso,
      };
    });
  }, []);

  const reloadMeals = useCallback(async () => {
    const uid = userRef.current;
    if (!uid) return;
    const mealPlan = await getMealPlan(uid);
    mealPlanIdRef.current = mealPlan.mealPlanId;
    setState(s => ({ ...s, meals: mealPlan.meals }));
  }, []);

  const reloadProfile = useCallback(async () => {
    const uid = userRef.current;
    if (!uid) return;
    const profile = await getAthleteProfile(uid);
    setState(s => ({
      ...s,
      profile: profile
        ? {
            name: profile.fullName,
            initials: profile.initials,
            firstName: profile.fullName.split(' ')[0],
          }
        : null,
      profileData: profile
        ? {
            fullName: profile.fullName,
            sex: profile.sex,
            dateOfBirth: profile.dateOfBirth,
            heightCm: profile.heightCm,
            goalWeightKg: profile.goalWeightKg,
          }
        : null,
      goalWeightKg: profile?.goalWeightKg ?? null,
    }));
  }, []);

  const reloadAll = useCallback(async () => {
    await Promise.all([
      reloadPlan(),
      reloadMeals(),
      refreshDerived(),
      reloadProfile(),
    ]);
  }, [refreshDerived, reloadMeals, reloadPlan, reloadProfile]);

  // ── profile actions ───────────────────────────────────────────────────────

  const saveProfile = useCallback(async (data: ProfileData): Promise<void> => {
    const uid = userRef.current;
    if (!uid || !data.fullName.trim()) return;
    const fullName = data.fullName.trim();
    const initials = getInitials(fullName);
    setState(s => ({
      ...s,
      profile: { name: fullName, initials, firstName: fullName.split(' ')[0] },
      profileData: { ...data, fullName },
      goalWeightKg: data.goalWeightKg,
    }));
    await saveAthleteProfile(uid, {
      fullName,
      initials,
      sex: data.sex ?? undefined,
      dateOfBirth: data.dateOfBirth ?? undefined,
      heightCm: data.heightCm ?? undefined,
      goalWeightKg: data.goalWeightKg ?? undefined,
    });
    try {
      const measurement = await getLatestWeightMeasurement(uid);
      await pushAthleteProfile({
        fullName,
        sex: data.sex,
        dateOfBirth: data.dateOfBirth,
        heightCm: data.heightCm,
        goalWeightKg: data.goalWeightKg,
        measurement: measurement
          ? {
              id: measurement.id,
              measuredAt: measurement.measuredAt.getTime(),
              weightKg: measurement.weightKg,
            }
          : undefined,
      });
    } catch (error) {
      // Local SQLite remains authoritative while offline; startup sync retries.
      console.warn('[profile-sync] save deferred', error);
    }
  }, []);

  // ── nutrition actions ─────────────────────────────────────────────────────

  const setMeal = useCallback((id: string, st: MealStatus) => {
    setState(s => ({ ...s, mealStatus: { ...s.mealStatus, [id]: st } }));
    const uid = userRef.current;
    const planId = mealPlanIdRef.current;
    if (!uid || !planId) return;
    setMealEntry(uid, planId, id, { status: STATUS_TO_DB[st] })
      .then(() => syncCheckIn())
      .catch(e => console.error('[meal]', e));
  }, [syncCheckIn]);

  const setMealNote = useCallback((id: string, txt: string) => {
    setState(s => ({ ...s, mealNotes: { ...s.mealNotes, [id]: txt } }));
    const uid = userRef.current;
    const planId = mealPlanIdRef.current;
    if (!uid || !planId) return;
    // Debounce — persists after the user stops typing
    if (noteTimers.current[id]) clearTimeout(noteTimers.current[id]);
    noteTimers.current[id] = setTimeout(() => {
      setMealEntry(uid, planId, id, { note: txt }).catch(e => console.error('[meal-note]', e));
    }, 400);
  }, []);

  const setWater = useCallback((n: number) => {
    // Tapping the top filled glass lowers the level by one
    const next = stateRef.current.water === n ? n - 1 : n;
    setState(s => ({ ...s, water: next }));
    const uid = userRef.current;
    if (!uid) return;
    setTodayWater(uid, next)
      .then(() => syncCheckIn())
      .catch(e => console.error('[water]', e));
  }, [syncCheckIn]);

  const startAddMeal = useCallback(() =>
    setState(s => ({ ...s, addingMeal: true, editingMealId: null, mealDraft: EMPTY_MEAL_DRAFT })), []);

  const startEditMeal = useCallback((id: string) =>
    setState(s => {
      const m = s.meals.find(x => x.id === id);
      if (!m) return s;
      return {
        ...s,
        addingMeal: false,
        editingMealId: id,
        mealDraft: {
          label: m.label, time: m.time, n: m.n,
          kcal: m.kcal ? String(m.kcal) : '',
          p: m.p ? String(m.p) : '',
          c: m.c ? String(m.c) : '',
          g: m.g ? String(m.g) : '',
        },
      };
    }), []);

  const cancelMealForm = useCallback(() =>
    setState(s => ({ ...s, addingMeal: false, editingMealId: null })), []);

  const setMealDraft = useCallback((f: keyof MealDraftUI, v: string) =>
    setState(s => ({ ...s, mealDraft: { ...s.mealDraft, [f]: v } })), []);

  const saveMealForm = useCallback(() => {
    const s = stateRef.current;
    const planId = mealPlanIdRef.current;
    if (!planId) return;
    const d = s.mealDraft;
    if (!d.label.trim() || !d.n.trim()) return;
    const draft = {
      label: d.label.trim().toUpperCase(),
      time: d.time.trim(),
      n: d.n.trim(),
      kcal: Math.max(0, parseInt(d.kcal, 10) || 0),
      p: Math.max(0, parseInt(d.p, 10) || 0),
      c: Math.max(0, parseInt(d.c, 10) || 0),
      g: Math.max(0, parseInt(d.g, 10) || 0),
    };
    setState(st => ({ ...st, addingMeal: false, editingMealId: null }));
    const op = s.editingMealId
      ? updateMealSlot(planId, s.editingMealId, draft)
      : addMealSlot(planId, draft).then(() => undefined);
    op.then(() => reloadMeals())
      .then(() => syncCheckIn())
      .catch(e => console.error('[meal-save]', e));
  }, [reloadMeals, syncCheckIn]);

  const deleteMeal = useCallback(() => {
    const s = stateRef.current;
    const planId = mealPlanIdRef.current;
    const id = s.editingMealId;
    if (!planId || !id) return;
    setState(st => ({ ...st, editingMealId: null, addingMeal: false }));
    deleteMealSlot(planId, id)
      .then(() => reloadMeals())
      .then(() => syncCheckIn())
      .catch(e => console.error('[meal-delete]', e));
  }, [reloadMeals, syncCheckIn]);

  // ── workout actions ───────────────────────────────────────────────────────

  // Ticks off restEndAtRef (not a decrementing counter) so the displayed time is always
  // correct even after the JS thread was paused/backgrounded, or the widget changed it.
  const tickRestTimer = useCallback(() => {
    if (restTimer.current) clearInterval(restTimer.current);
    restTimer.current = setInterval(() => {
      const endAt = restEndAtRef.current;
      if (endAt == null) {
        if (restTimer.current) clearInterval(restTimer.current);
        return;
      }
      const left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      if (left <= 0) {
        if (restTimer.current) clearInterval(restTimer.current);
        restEndAtRef.current = null;
        saveRestTimerState(CLEARED_REST_STATE).catch(() => {});
        setState(s => ({ ...s, restLeft: 0, restActive: false }));
        return;
      }
      setState(s => ({ ...s, restLeft: left, restActive: true }));
    }, 1000);
  }, []);

  const startRest = useCallback((duration: number) => {
    const endAt = Date.now() + duration * 1000;
    restEndAtRef.current = endAt;
    saveRestTimerState({ restEndAt: endAt, restTotal: duration }).catch(() => {});
    setState(s => ({ ...s, restActive: true, restLeft: duration, restTotal: duration }));
    tickRestTimer();
  }, [tickRestTimer]);

  // Reconciles with the persisted rest-timer snapshot on mount and whenever the app
  // returns to the foreground, adopting any change made by the widget while backgrounded.
  useEffect(() => {
    function adopt(persisted: RestTimerState) {
      if (persisted.restEndAt === restEndAtRef.current) return;
      restEndAtRef.current = persisted.restEndAt;

      if (persisted.restEndAt == null) {
        if (restTimer.current) clearInterval(restTimer.current);
        setState(s => ({ ...s, restActive: false, restLeft: 0 }));
        return;
      }

      const left = Math.max(0, Math.round((persisted.restEndAt - Date.now()) / 1000));
      if (left <= 0) {
        restEndAtRef.current = null;
        if (restTimer.current) clearInterval(restTimer.current);
        setState(s => ({ ...s, restActive: false, restLeft: 0 }));
        return;
      }

      setState(s => ({ ...s, restActive: true, restLeft: left, restTotal: persisted.restTotal }));
      tickRestTimer();
    }

    function reconcile() {
      loadRestTimerState().then(adopt).catch(() => {});
    }

    reconcile();
    const subscription = RNAppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') reconcile();
    });
    // Covers the case the AppState listener misses: a widget button tapped while the app
    // is alive but backgrounded, so it never transitions back to 'active'.
    const widgetSubscription = addWidgetRestListener(adopt);

    return () => {
      subscription.remove();
      widgetSubscription.remove();
    };
  }, [tickRestTimer]);

  const selectEx = useCallback((i: number) =>
    setState(s => {
      const e = s.exercises[i];
      if (!e) return s;
      return { ...s, exIndex: i, curReps: e.reps, curPeso: e.peso, curRpe: 8, editingEx: false, addingEx: false };
    }), []);

  const incPeso = useCallback(() =>
    setState(s => {
      const e = s.exercises[s.exIndex];
      if (!e) return s;
      return { ...s, curPeso: +(s.curPeso + e.step).toFixed(1) };
    }), []);

  const decPeso = useCallback(() =>
    setState(s => {
      const e = s.exercises[s.exIndex];
      if (!e) return s;
      return { ...s, curPeso: Math.max(0, +(s.curPeso - e.step).toFixed(1)) };
    }), []);

  const incReps = useCallback(() =>
    setState(s => ({ ...s, curReps: s.curReps + 1 })), []);

  const decReps = useCallback(() =>
    setState(s => ({ ...s, curReps: Math.max(1, s.curReps - 1) })), []);

  const setRpe = useCallback((v: number) =>
    setState(s => ({ ...s, curRpe: v })), []);

  const guardarSet = useCallback(() => {
    const s = stateRef.current;
    const uid = userRef.current;
    const ex = s.exercises[s.exIndex];
    if (!ex || !uid) return;
    const set: ExerciseSet = { reps: s.curReps, peso: s.curPeso, rpe: s.curRpe, pr: false };

    // Optimistic append; PR flag arrives from the DB write
    setState(st => ({
      ...st,
      log: { ...st.log, [ex.id]: [...(st.log[ex.id] || []), set] },
      sessionDone: false,
    }));
    startRest(REST_DEFAULT);

    logSet(uid, templateIdRef.current, { slotId: ex.id, exerciseId: ex.exerciseId }, set)
      .then(({ isPR }) => {
        if (!isPR) return;
        setState(st => {
          const sets = [...(st.log[ex.id] || [])];
          if (sets.length) sets[sets.length - 1] = { ...sets[sets.length - 1], pr: true };
          return {
            ...st,
            log: { ...st.log, [ex.id]: sets },
            prMap: { ...st.prMap, [ex.id]: Math.max(st.prMap[ex.id] ?? 0, set.peso) },
            prFlash: { ej: ex.nombre, val: formatWeight(set.peso, weightUnitRef.current) },
          };
        });
        if (prTimer.current) clearTimeout(prTimer.current);
        prTimer.current = setTimeout(() => setState(st => ({ ...st, prFlash: null })), 4000);
        return refreshDerived();
      })
      .catch(e => console.error('[set]', e));
  }, [startRest, refreshDerived]);

  const finishWorkout = useCallback(() => {
    const uid = userRef.current;
    if (!uid) return;
    setState(s => ({ ...s, sessionDone: true, restActive: false }));
    if (restTimer.current) clearInterval(restTimer.current);
    restEndAtRef.current = null;
    saveRestTimerState(CLEARED_REST_STATE).catch(() => {});
    getTodaySession(uid)
      .then(session => (session ? dbFinishSession(session.sessionId) : undefined))
      .then(() => syncCheckIn({ workoutCompleted: true }))
      .catch(e => console.error('[finish]', e));
  }, [syncCheckIn]);

  const applySuggestedPlan = useCallback(() => {
    const templateId = templateIdRef.current;
    if (!templateId) return;
    dbApplySuggestedPlan(templateId)
      .then(() => reloadPlan())
      .catch(e => console.error('[plan]', e));
  }, [reloadPlan]);

  const startEditEx = useCallback(() =>
    setState(s => ({ ...s, editingEx: true, addingEx: false })), []);

  const startAddEx = useCallback(() =>
    setState(s => ({ ...s, addingEx: true, editingEx: false })), []);

  const cancelExForm = useCallback(() =>
    setState(s => ({ ...s, editingEx: false, addingEx: false })), []);

  const saveEditEx = useCallback((values: ExercisePlanValues) => {
    const s = stateRef.current;
    const uid = userRef.current;
    const cur = s.exercises[s.exIndex];
    if (!cur || !uid) return;
    const data = {
      nombre: values.nombre.trim() || cur.nombre,
      target: Math.max(1, values.target || 1),
      reps: Math.max(1, values.reps || 1),
      peso: Math.max(0, values.peso || 0),
      step: values.step || 2.5,
    };
    setState(st => ({ ...st, editingEx: false }));
    updatePlanExercise(uid, cur.id, data)
      .then(() => reloadPlan())
      .catch(e => console.error('[plan-edit]', e));
  }, [reloadPlan]);

  const saveAddEx = useCallback((values: ExercisePlanValues) => {
    const uid = userRef.current;
    const templateId = templateIdRef.current;
    if (!uid || !templateId) return;
    if (!values.nombre.trim()) {
      setState(st => ({ ...st, addingEx: false }));
      return;
    }
    const data = {
      nombre: values.nombre.trim(),
      target: Math.max(1, values.target || 1),
      reps: Math.max(1, values.reps || 1),
      peso: Math.max(0, values.peso || 0),
      step: values.step || 2.5,
    };
    setState(st => ({ ...st, addingEx: false }));
    addPlanExercise(uid, templateId, data)
      .then(() => reloadPlan())
      .then(() =>
        // Select the exercise that was just appended
        setState(st => {
          const i = Math.max(0, st.exercises.length - 1);
          const e = st.exercises[i];
          return { ...st, exIndex: i, curReps: e?.reps ?? st.curReps, curPeso: e?.peso ?? st.curPeso, curRpe: 8 };
        }),
      )
      .catch(e => console.error('[plan-add]', e));
  }, [reloadPlan]);

  const deleteEx = useCallback(() => {
    const s = stateRef.current;
    const cur = s.exercises[s.exIndex];
    if (!cur) return;
    setState(st => ({ ...st, editingEx: false, exIndex: Math.max(0, st.exIndex - 1) }));
    deletePlanExercise(cur.id)
      .then(() => reloadPlan())
      .catch(e => console.error('[plan-delete]', e));
  }, [reloadPlan]);

  const addRest = useCallback(() => {
    const endAt = (restEndAtRef.current ?? Date.now()) + 30_000;
    const left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
    const restTotal = Math.max(stateRef.current.restTotal, left);
    restEndAtRef.current = endAt;
    saveRestTimerState({ restEndAt: endAt, restTotal }).catch(() => {});
    setState(s => ({ ...s, restLeft: left, restTotal, restActive: true }));
    if (!restTimer.current) tickRestTimer();
  }, [tickRestTimer]);

  const reduceRest = useCallback(() => {
    const endAt = Math.max(Date.now(), (restEndAtRef.current ?? Date.now()) - 30_000);
    const left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
    if (left <= 0) {
      restEndAtRef.current = null;
      if (restTimer.current) clearInterval(restTimer.current);
      saveRestTimerState(CLEARED_REST_STATE).catch(() => {});
      setState(s => ({ ...s, restLeft: 0, restActive: false }));
      return;
    }
    restEndAtRef.current = endAt;
    saveRestTimerState({ restEndAt: endAt, restTotal: stateRef.current.restTotal }).catch(() => {});
    setState(s => ({ ...s, restLeft: left, restActive: true }));
  }, []);

  const skipRest = useCallback(() => {
    if (restTimer.current) clearInterval(restTimer.current);
    restEndAtRef.current = null;
    saveRestTimerState(CLEARED_REST_STATE).catch(() => {});
    setState(s => ({ ...s, restActive: false, restLeft: REST_DEFAULT, restTotal: REST_DEFAULT }));
  }, []);

  const dismissPrFlash = useCallback(() =>
    setState(s => ({ ...s, prFlash: null })), []);

  const addRecommendedExercise = useCallback(async (exercise: {
    name: string;
    sets: number;
    reps: number;
    weight: number;
    step: number;
  }) => {
    const uid = userRef.current;
    const templateId = templateIdRef.current;
    if (!uid || !templateId) return;
    if (stateRef.current.exercises.some(item =>
      item.nombre.trim().toLocaleLowerCase('es') === exercise.name.trim().toLocaleLowerCase('es'))) return;
    await addPlanExercise(uid, templateId, {
      nombre: exercise.name,
      target: exercise.sets,
      reps: exercise.reps,
      peso: exercise.weight,
      step: exercise.step,
    });
    await reloadPlan();
  }, [reloadPlan]);

  // ── progress actions ──────────────────────────────────────────────────────

  const setMetric = useCallback((m: MetricKey) =>
    setState(s => ({ ...s, metric: m })), []);

  const incWeighIn = useCallback(() =>
    setState(s => ({
      ...s,
      metricVals: { ...s.metricVals, [s.metric]: +(s.metricVals[s.metric] + 0.1).toFixed(1) },
    })), []);

  const decWeighIn = useCallback(() =>
    setState(s => ({
      ...s,
      metricVals: { ...s.metricVals, [s.metric]: Math.max(0, +(s.metricVals[s.metric] - 0.1).toFixed(1)) },
    })), []);

  const registrarPeso = useCallback(() => {
    const s = stateRef.current;
    const uid = userRef.current;
    if (!uid) return;
    const metric = s.metric;
    const value = s.metricVals[metric];
    setState(st => ({ ...st, loggedToday: { ...st.loggedToday, [metric]: true } }));
    logMeasurement(uid, metric, value, s.metricVals.peso)
      .then(() => getMetricHistories(uid))
      .then(histories => setState(st => ({ ...st, histories })))
      .then(() => refreshDerived())
      .catch(e => console.error('[measure]', e));
  }, [refreshDerived]);

  const addProgressPhoto = useCallback((uri: string) => {
    const uid = userRef.current;
    if (!uid) return;
    dbAddPhoto(uid, uri)
      .then(() => getPhotos(uid))
      .then(photos => setState(st => ({ ...st, photos })))
      .catch(e => console.error('[photo]', e));
  }, []);

  return (
    <AppContext.Provider value={{
      state,
      saveProfile, reloadAll,
      setMeal, setMealNote, setWater,
      startAddMeal, startEditMeal, cancelMealForm, setMealDraft, saveMealForm, deleteMeal,
      selectEx, incPeso, decPeso, incReps, decReps, setRpe, guardarSet,
      finishWorkout, applySuggestedPlan,
      startEditEx, startAddEx, cancelExForm, saveEditEx, saveAddEx, deleteEx,
      addRest, reduceRest, skipRest, dismissPrFlash,
      addRecommendedExercise,
      setMetric, incWeighIn, decWeighIn, registrarPeso, addProgressPhoto,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
