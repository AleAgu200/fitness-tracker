import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, AppState as RNAppState } from 'react-native';

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
  activateMealPlan as dbActivateMealPlan,
  addMealSlot,
  createOwnMealPlan,
  deleteMealSlot,
  getMealPlan,
  MealPlanOrigin,
  getTodayMealEntries,
  getTodayWater,
  MealStatusDb,
  setMealEntry,
  setTodayWater,
  updateMealSlot,
} from '@/db/nutrition';
import { ExercisePlanValues } from '@/components/exercise-plan-form';
import {
  ActiveProgram,
  activateProgram,
  addPlanExercise,
  createOwnProgram,
  deletePlanExercise,
  getActiveProgram,
  getWeekSummary,
  PlanExercise,
  updatePlanExercise,
} from '@/db/plan';
import { createSessionCard, getTrainingSessions } from '@/db/pulse';
import { getAthleteProfile, getLatestWeightMeasurement, saveAthleteProfile } from '@/db/profile';
import { addDays, weekdayOf } from '@/lib/dates';
import { getInitials } from '@/lib/names';
import { comparePulse, TrainingSession } from '@/lib/pulse-engine';
import {
  discardFreeSession as dbDiscardFreeSession,
  finishSession as dbFinishSession,
  FreeSessionExercise,
  getPreviousExerciseSession,
  getPRHistory,
  getTodayPlan,
  getTodaySession,
  logSet,
  PreviousExerciseSession,
  previousPulseRef,
  PRHistoryItem,
  startFreeSession as dbStartFreeSession,
} from '@/db/workout';
import { CLEARED_REST_STATE, loadRestTimerState, RestTimerState, saveRestTimerState } from '@/lib/rest-timer-store';
import { addWidgetRestListener } from '@/modules/pulso-widget';
import { getStoredAssignmentMeta, syncAssignments, syncMobileData, type ScheduledPlan } from '@/lib/sync';
import { pushAthleteProfile, syncAthleteProfile } from '@/lib/profile-sync';
import { EMPTY_WIDGET_DATA, syncWorkoutWidgets } from '@/lib/widget-bridge';
import { usePreferences } from './preferences';
import { useSession } from './session';

export type MealStatus = 'cumplido' | 'sustituido' | 'pendiente';
export type MetricKey = 'peso' | 'grasa' | 'musculo';
export type { WeekDay, MetricPoint, ProgressPhoto, PreviousExerciseSession, PRHistoryItem, ExercisePlanValues, ActiveProgram };

/** Brief confirmation after saving a set (≤ 1.5 s, never blocks the next one). */
export interface SetFeedback {
  /** Increments on every save so consecutive confirmations re-animate. */
  id: number;
  kind: 'saved' | 'beat' | 'record';
  setNumber: number;
  exercise: string;
  weightKg: number;
}

const SET_FEEDBACK_MS = 1500;
/** Training history kept in memory for Hoy/Progreso rules (covers the 90-day range). */
const TRAINING_HISTORY_DAYS = 120;

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
  /** Seconds spent doing the reps, measured from the moment the prior rest ended to this set's save tap. Null when there was no prior rest to measure from (e.g. the exercise's first set). */
  workingSeconds: number | null;
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
  wxId: string | null;
  gifPath: string | null;
  instructions: string | null;
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
  scheduledWorkout: ScheduledPlan | null;
  scheduledMeals: ScheduledPlan | null;

  // plans — the program feeding today's session (see "Mis planes")
  activePlan: ActiveProgram | null;
  /** The meal plan feeding Dieta and today's meals (see "Mis planes"). */
  activeMealPlan: { id: string; name: string; origin: MealPlanOrigin } | null;
  /** Days with exercises in the active plan's week. */
  plannedDaysPerWeek: number;
  /** Non-null while today's session was generated from the body map. */
  freeSession: { label: string } | null;

  // habits / derived
  racha: number;
  weekDays: WeekDay[];
  heatmap: number[][];
  sessionsCount: number;
  earned: Record<string, number>;
  prHistory: PRHistoryItem[];
  /** Recent sessions with their sets — input for the Pulse rules. */
  trainingSessions: TrainingSession[];

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
  setFeedback: SetFeedback | null;

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
  scheduledWorkout: null,
  scheduledMeals: null,
  activePlan: null,
  activeMealPlan: null,
  plannedDaysPerWeek: 0,
  freeSession: null,
  racha: 0,
  weekDays: [],
  heatmap: Array.from({ length: 12 }, () => Array.from({ length: 7 }, () => 0)),
  sessionsCount: 0,
  earned: {},
  prHistory: [],
  trainingSessions: [],
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
  setFeedback: null,
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
  saveMealForm: (override?: MealDraftUI) => void;
  deleteMeal: () => void;
  // workout
  selectEx: (i: number) => void;
  incPeso: () => void;
  decPeso: () => void;
  incReps: () => void;
  decReps: () => void;
  setRpe: (v: number) => void;
  /** `override` logs against a specific plan slot instead of the selected exercise, using
   *  the exercise's plan target weight/reps (RPE defaulted) rather than the live steppers —
   *  used by the widget's "done" quick-log, which auto-advances once the target is hit. */
  guardarSet: (override?: { slotId: string }) => void;
  /** Closes today's session and evaluates its card. Resolves to the session id
   *  (for the result screen), or null if there was nothing to close. */
  finishWorkout: () => Promise<string | null>;
  /** Replaces today's (still empty) session with one generated from the body map. */
  startFreeSession: (label: string, items: FreeSessionExercise[]) => Promise<void>;
  /** Drops today's free session while nothing was logged, back to the plan day. */
  discardFreeSession: () => Promise<void>;
  /** Makes another program the active plan (see "Mis planes"). */
  activatePlan: (programId: string) => Promise<void>;
  /** Creates an own training plan (empty or a copy) and makes it active. The
   *  caller checks PULSO Plus with lib/plan-limits. */
  createTrainingPlan: (options: { name?: string; sourceProgramId?: string | null }) => Promise<void>;
  /** Makes another meal plan the active one (see "Mis planes"). */
  activateMealPlan: (mealPlanId: string) => Promise<void>;
  /** Creates an own meal plan (empty or a copy) and makes it active. */
  createMealPlan: (options: { name?: string; sourceMealPlanId?: string | null }) => Promise<void>;
  startEditEx: () => void;
  startAddEx: () => void;
  cancelExForm: () => void;
  saveEditEx: (values: ExercisePlanValues) => void;
  saveAddEx: (values: ExercisePlanValues) => void;
  deleteEx: () => void;
  addRest: () => void;
  reduceRest: () => void;
  skipRest: () => void;
  addRecommendedExercise: (exercise: {
    name: string;
    sets: number;
    reps: number;
    weight: number;
    step: number;
    gifPath?: string | null;
    instructions?: string | null;
  }) => Promise<void>;
  // progress
  setMetric: (m: MetricKey) => void;
  incWeighIn: () => void;
  decWeighIn: () => void;
  registrarPeso: () => void;
  addProgressPhoto: (uri: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function toExercises(items: PlanExercise[]): Exercise[] {
  return items.map(e => ({
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
    wxId: e.wxId,
    gifPath: e.gifPath,
    instructions: e.instructions,
  }));
}

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
  /** Set the moment rest ends (naturally, skipped, or reduced to zero) — consumed by the next GUARDAR SET tap to measure rep time. */
  const workStartedAtRef = useRef<number | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackSeq = useRef(0);
  const noteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!userId) {
      templateIdRef.current = null;
      mealPlanIdRef.current = null;
      // The rest timer interval and its deadline ref belong to whoever was logged in —
      // left running, they'd keep reasserting the previous account's "resting" state
      // (and repainting the widget with it) on top of whichever account logs in next,
      // in the same app process. The widget/rest-timer native stores are also
      // account-agnostic, so the next login would otherwise see this account's leftovers.
      if (restTimer.current) clearInterval(restTimer.current);
      restTimer.current = null;
      restEndAtRef.current = null;
      workStartedAtRef.current = null;
      saveRestTimerState(CLEARED_REST_STATE).catch(() => {});
      syncWorkoutWidgets(EMPTY_WIDGET_DATA);
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
        // Assignments land in their own plans (applyCoachWorkout,
        // applyNutritionistMealPlan); the first of each becomes the active one.
        let assignedWorkoutBy: string | null = null;
        let assignedMealsBy: string | null = null;
        let scheduledWorkout: ScheduledPlan | null = null;
        let scheduledMeals: ScheduledPlan | null = null;
        try {
          const sync = await syncAssignments(userId);
          assignedWorkoutBy = sync.workoutBy;
          assignedMealsBy = sync.mealsBy;
          scheduledWorkout = sync.scheduledWorkout;
          scheduledMeals = sync.scheduledMeals;
        } catch {
          // Offline — keep last-known assignment authors for attribution banners
          const meta = await getStoredAssignmentMeta(userId);
          assignedWorkoutBy = meta.workoutBy;
          assignedMealsBy = meta.mealsBy;
        }
        await syncMobileData(userId);
        const mealPlan = await getMealPlan(userId, todayWeekday);

        // Sequential on purpose: each may create the default program, and two
        // concurrent creations would leave two active plans.
        const plan = await getTodayPlan(userId);
        const activePlan = await getActiveProgram(userId);
        const weekSummary = await getWeekSummary(userId);
        const session = plan.session;

        const [profile, entries, water, histories, photos] =
          await Promise.all([
            getAthleteProfile(userId),
            getTodayMealEntries(userId),
            getTodayWater(userId),
            getMetricHistories(userId),
            getPhotos(userId),
          ]);
        const [racha, weekDays, heatmap, sessionsCount, earned, prHistory, trainingSessions] =
          await Promise.all([
            computeStreak(userId),
            getWeekDays(userId),
            getHeatmap(userId),
            getCompletedSessionsCount(userId),
            evaluateAchievements(userId),
            getPRHistory(userId),
            getTrainingSessions(userId, addDays(new Date(), -TRAINING_HISTORY_DAYS)),
          ]);
        if (cancelled) return;

        templateIdRef.current = plan.templateId;
        mealPlanIdRef.current = mealPlan.mealPlanId;

        const exercises = toExercises(plan.exercises);
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
          scheduledWorkout,
          scheduledMeals,
          activePlan,
          activeMealPlan: mealPlan.plan,
          plannedDaysPerWeek: weekSummary.filter(day => day.exerciseCount > 0).length,
          freeSession: plan.free,
          racha,
          weekDays,
          heatmap,
          sessionsCount,
          earned,
          prHistory,
          trainingSessions,
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
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    for (const t of Object.values(noteTimers.current)) clearTimeout(t);
  }, []);

  // ── derived refreshers ────────────────────────────────────────────────────

  const refreshDerived = useCallback(async () => {
    const uid = userRef.current;
    if (!uid) return;
    try {
      const [racha, weekDays, heatmap, sessionsCount, earned, prHistory, trainingSessions] = await Promise.all([
        computeStreak(uid),
        getWeekDays(uid),
        getHeatmap(uid),
        getCompletedSessionsCount(uid),
        evaluateAchievements(uid),
        getPRHistory(uid),
        getTrainingSessions(uid, addDays(new Date(), -TRAINING_HISTORY_DAYS)),
      ]);
      setState(s => ({ ...s, racha, weekDays, heatmap, sessionsCount, earned, prHistory, trainingSessions }));
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
    const plan = await getTodayPlan(uid);
    const activePlan = await getActiveProgram(uid);
    const weekSummary = await getWeekSummary(uid);
    templateIdRef.current = plan.templateId;
    const previousPairs = await Promise.all(plan.exercises.map(async exercise => [
      exercise.exerciseId,
      await getPreviousExerciseSession(uid, exercise.exerciseId),
    ] as const));
    setState(s => {
      const exercises = toExercises(plan.exercises);
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
        activePlan,
        plannedDaysPerWeek: weekSummary.filter(day => day.exerciseCount > 0).length,
        // `log` stays as-is: it's optimistic and keyed by slot, and templates are
        // only swapped (free session, plan switch) while nothing is logged today.
        freeSession: plan.free,
      };
    });
  }, []);

  const reloadMeals = useCallback(async () => {
    const uid = userRef.current;
    if (!uid) return;
    // Meal plans now cover the whole week; the diet tab shows the day the
    // athlete is actually logging.
    const mealPlan = await getMealPlan(uid, weekdayOf(new Date()));
    mealPlanIdRef.current = mealPlan.mealPlanId;
    setState(s => ({ ...s, meals: mealPlan.meals, activeMealPlan: mealPlan.plan }));
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

  const saveMealForm = useCallback((override?: MealDraftUI) => {
    const s = stateRef.current;
    const planId = mealPlanIdRef.current;
    if (!planId) return;
    const d = override ?? s.mealDraft;
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
      : addMealSlot(planId, weekdayOf(new Date()), draft).then(() => undefined);
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
        workStartedAtRef.current = Date.now();
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
      if (nextAppState === 'active') {
        reconcile();
        const uid = userRef.current;
        if (uid) syncMobileData(uid).catch(() => {});
      }
    });
    // Covers the case the AppState listener misses: a widget button tapped while the app
    // is alive but backgrounded, so it never transitions back to 'active'.
    const widgetSubscription = addWidgetRestListener(adopt);

    return () => {
      subscription.remove();
      widgetSubscription.remove();
    };
  }, [tickRestTimer]);

  const showSetFeedback = useCallback((feedback: Omit<SetFeedback, 'id'>) => {
    feedbackSeq.current += 1;
    const id = feedbackSeq.current;
    setState(s => ({ ...s, setFeedback: { ...feedback, id } }));
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(
      () => setState(s => (s.setFeedback?.id === id ? { ...s, setFeedback: null } : s)),
      SET_FEEDBACK_MS,
    );
  }, []);

  /** Moves the steppers to the first exercise after the plan behind them changed. */
  const selectFirstExercise = useCallback(() =>
    setState(s => {
      const first = s.exercises[0];
      return { ...s, exIndex: 0, curPeso: first?.peso ?? s.curPeso, curReps: first?.reps ?? s.curReps, curRpe: 8 };
    }), []);

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

  const guardarSet = useCallback((override?: { slotId: string }) => {
    const s = stateRef.current;
    const uid = userRef.current;
    const idx = override ? s.exercises.findIndex(e => e.id === override.slotId) : s.exIndex;
    const ex = idx >= 0 ? s.exercises[idx] : undefined;
    if (!ex || !uid) return;
    // Can't log a set mid-rest — the UI disables the button for this too, so this is
    // just defense in depth (the widget only wires its quick-log action while idle).
    if (s.restActive) return;

    const commit = () => {
      // Widget quick-log has no access to the live steppers, so it logs the plan's target
      // weight/reps instead (RPE defaulted) — fine-tuning still means opening the app.
      const peso = override ? ex.peso : s.curPeso;
      const reps = override ? ex.reps : s.curReps;
      const rpe = override ? 8 : s.curRpe;
      const workStartedAt = workStartedAtRef.current;
      const workingSeconds = workStartedAt != null ? Math.round((Date.now() - workStartedAt) / 1000) : null;
      workStartedAtRef.current = null;
      const set: ExerciseSet = { reps, peso, rpe, pr: false, workingSeconds };

      // Optimistic append; PR flag arrives from the DB write. Auto-advancing past a
      // completed exercise is scoped to the widget quick-log path (`override`) — manual
      // in-app "GUARDAR SET" taps keep staying on the same exercise, as today.
      setState(st => {
        const log = { ...st.log, [ex.id]: [...(st.log[ex.id] || []), set] };
        const advance = override != null && log[ex.id].length >= ex.target && idx < st.exercises.length - 1;
        const nextIndex = advance ? idx + 1 : idx;
        const nextEx = st.exercises[nextIndex];
        return {
          ...st,
          log,
          exIndex: nextIndex,
          curPeso: advance ? nextEx.peso : peso,
          curReps: advance ? nextEx.reps : reps,
          curRpe: advance ? 8 : rpe,
          sessionDone: false,
        };
      });
      startRest(REST_DEFAULT);

      const previous = s.previousSessions[ex.exerciseId];
      const beating = previous != null
        && comparePulse(previousPulseRef(previous), { weightKg: peso, reps, rpe }, Date.now()).beating;
      const setNumber = (s.log[ex.id]?.length ?? 0) + 1;
      showSetFeedback({ kind: beating ? 'beat' : 'saved', setNumber, exercise: ex.nombre, weightKg: peso });

      logSet(uid, templateIdRef.current, { slotId: ex.id, exerciseId: ex.exerciseId }, { peso, reps, rpe, workingSeconds })
        .then(({ isPR }) => {
          if (!isPR) return;
          setState(st => {
            const sets = [...(st.log[ex.id] || [])];
            if (sets.length) sets[sets.length - 1] = { ...sets[sets.length - 1], pr: true };
            return {
              ...st,
              log: { ...st.log, [ex.id]: sets },
              prMap: { ...st.prMap, [ex.id]: Math.max(st.prMap[ex.id] ?? 0, set.peso) },
            };
          });
          showSetFeedback({ kind: 'record', setNumber, exercise: ex.nombre, weightKg: peso });
          return refreshDerived();
        })
        .catch(e => console.error('[set]', e));
    };

    // Confirm before logging past the exercise's planned set count — skipped for the
    // widget's one-tap quick-log path, which has no surface to show a dialog on.
    const priorSets = s.log[ex.id]?.length ?? 0;
    if (!override && priorSets >= ex.target) {
      Alert.alert(
        'Serie extra',
        `Ya completaste las ${ex.target} series de ${ex.nombre}. ¿Querés guardar una serie extra?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Guardar', onPress: commit },
        ],
      );
      return;
    }
    commit();
  }, [startRest, refreshDerived, showSetFeedback]);

  const finishWorkout = useCallback(async (): Promise<string | null> => {
    const uid = userRef.current;
    if (!uid) return null;
    setState(s => ({ ...s, sessionDone: true, restActive: false }));
    if (restTimer.current) clearInterval(restTimer.current);
    restEndAtRef.current = null;
    saveRestTimerState(CLEARED_REST_STATE).catch(() => {});
    try {
      const session = await getTodaySession(uid);
      if (!session) return null;
      await dbFinishSession(session.sessionId);
      try {
        await createSessionCard(uid, session.sessionId);
      } catch (e) {
        // The session is closed either way; the result screen retries the card.
        console.error('[session-card]', e);
      }
      await syncCheckIn({ workoutCompleted: true });
      return session.sessionId;
    } catch (e) {
      console.error('[finish]', e);
      return null;
    }
  }, [syncCheckIn]);

  const startFreeSession = useCallback(async (label: string, items: FreeSessionExercise[]) => {
    const uid = userRef.current;
    if (!uid) return;
    await dbStartFreeSession(uid, label, items);
    setState(s => ({ ...s, log: {}, sessionDone: false }));
    await reloadPlan();
    selectFirstExercise();
  }, [reloadPlan, selectFirstExercise]);

  const discardFreeSession = useCallback(async () => {
    const uid = userRef.current;
    if (!uid) return;
    await dbDiscardFreeSession(uid);
    setState(s => ({ ...s, log: {} }));
    await reloadPlan();
    selectFirstExercise();
  }, [reloadPlan, selectFirstExercise]);

  const activatePlan = useCallback(async (programId: string) => {
    const uid = userRef.current;
    if (!uid) return;
    await activateProgram(uid, programId);
    await reloadPlan();
    selectFirstExercise();
  }, [reloadPlan, selectFirstExercise]);

  const createTrainingPlan = useCallback(async (options: { name?: string; sourceProgramId?: string | null }) => {
    const uid = userRef.current;
    if (!uid) return;
    await createOwnProgram(uid, options);
    await reloadPlan();
    selectFirstExercise();
  }, [reloadPlan, selectFirstExercise]);

  const activateMealPlan = useCallback(async (mealPlanId: string) => {
    const uid = userRef.current;
    if (!uid) return;
    await dbActivateMealPlan(uid, mealPlanId);
    await reloadMeals();
  }, [reloadMeals]);

  const createMealPlan = useCallback(async (options: { name?: string; sourceMealPlanId?: string | null }) => {
    const uid = userRef.current;
    if (!uid) return;
    await createOwnMealPlan(uid, options);
    await reloadMeals();
  }, [reloadMeals]);

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
      wxId: values.wxId,
      gifPath: values.gifPath,
      instructions: values.instructions,
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
      wxId: values.wxId,
      gifPath: values.gifPath,
      instructions: values.instructions,
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
      workStartedAtRef.current = Date.now();
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
    workStartedAtRef.current = Date.now();
    saveRestTimerState(CLEARED_REST_STATE).catch(() => {});
    setState(s => ({ ...s, restActive: false, restLeft: REST_DEFAULT, restTotal: REST_DEFAULT }));
  }, []);

  const addRecommendedExercise = useCallback(async (exercise: {
    name: string;
    sets: number;
    reps: number;
    weight: number;
    step: number;
    gifPath?: string | null;
    instructions?: string | null;
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
      gifPath: exercise.gifPath,
      instructions: exercise.instructions,
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
      finishWorkout, startFreeSession, discardFreeSession, activatePlan,
      createTrainingPlan, activateMealPlan, createMealPlan,
      startEditEx, startAddEx, cancelExForm, saveEditEx, saveAddEx, deleteEx,
      addRest, reduceRest, skipRest,
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
