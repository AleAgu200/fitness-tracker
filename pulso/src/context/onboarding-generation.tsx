import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import type {
  ActivityLevel,
  BudgetLevel,
  CookingTimeBudget,
  DietaryStyle,
  ExperienceLevel,
  Goal,
  Pace,
  TrainingLocation,
} from '@/db/onboarding';
import { apiFetch } from '@/lib/api';
import { useSession } from '@/context/session';

export interface RawGenerationRequest {
  sex: 'M' | 'F' | 'X';
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activityOutsideTraining: ActivityLevel;
  goal: Goal;
  pace: Pace;
  experienceLevel: ExperienceLevel;
  daysPerWeek: number;
  sessionMinutes: number;
  mealsPerDay: number;
  availableEquipment?: string[];
  trainingLocation?: TrainingLocation;
  injuriesAndLimitations?: string[];
  excludedExercises?: string[];
  dietaryStyle?: DietaryStyle;
  allergies?: string[];
  intolerances?: string[];
  dislikedFoods?: string[];
  preferredMealTimes?: string[];
  cookingTimeBudget?: CookingTimeBudget;
  budgetLevel?: BudgetLevel;
}

export interface EligibleFood {
  id: string;
  source: 'pulso' | 'usda';
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface EligibleExercise {
  id: string;
  source: 'pulso' | 'wger' | 'workoutx';
  name: string;
  muscleGroup: string;
  equipment: string;
  gifPath: string;
  instructions: string;
}

export interface GeneratedExercise {
  exerciseId: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  rirMin: number;
  rirMax: number;
  restSeconds: number;
  progressionIncrementKg: number;
}

export interface GeneratedWorkoutDay {
  /** ISO weekday: 1 = Monday, 7 = Sunday. */
  weekday: number;
  order: number;
  name: string;
  exercises: GeneratedExercise[];
}

export interface NutritionTotals {
  kcal: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
}

export interface GeneratedMealItem extends NutritionTotals {
  foodId: string;
  source: 'pulso' | 'usda';
  grams: number;
}

export interface GeneratedMeal {
  label: string;
  time: string;
  items: GeneratedMealItem[];
  totals: NutritionTotals;
}

/** One weekday of meals. Server numbering, 1 = Monday — results.tsx converts to
 *  the app's 1 = Sunday before touching the database. */
export interface GeneratedMealDay {
  weekday: number;
  meals: GeneratedMeal[];
  dailyTotals: NutritionTotals;
}

export interface GeneratedPlan {
  // 2: `meals` (one daily template) became `week` (seven days).
  schemaVersion: 2;
  model: string;
  promptVersion: string;
  assumptions: string[];
  safetyNotes: string[];
  workout: {
    durationWeeks: 4;
    days: GeneratedWorkoutDay[];
  };
  week: GeneratedMealDay[];
}

export interface PrepareGenerationSuccess {
  ok: true;
  plan: GeneratedPlan;
  eligibleFoods: EligibleFood[];
  eligibleExercises: EligibleExercise[];
}

export interface PrepareGenerationReview {
  ok: false;
  reason: 'requires_review';
  reasons: string[];
}

export type PrepareGenerationResponse = PrepareGenerationSuccess | PrepareGenerationReview;

export type PlanGenerationStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'requires_review'
  | 'failed';

export type PlanGenerationPhase =
  | 'queued'
  | 'preparing'
  | 'generating'
  | 'validating'
  | 'completed';

export interface PlanGenerationJob {
  id: string;
  status: PlanGenerationStatus;
  phase: PlanGenerationPhase;
  attempt: number;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  updatedAt?: number;
  elapsedMs: number;
  durationMs: number | null;
  result: PrepareGenerationResponse | null;
  error: { code: string; retryable: boolean } | null;
}

interface OnboardingGenerationValue {
  initialized: boolean;
  job: PlanGenerationJob | null;
  result: PrepareGenerationSuccess | null;
  connectionIssue: boolean;
  lastSyncedAt: number | null;
  startGeneration: (input: RawGenerationRequest) => Promise<PlanGenerationJob>;
  refreshGeneration: () => Promise<RefreshGenerationOutcome>;
  consumeGeneration: () => Promise<void>;
}

interface RefreshGenerationOutcome {
  ok: boolean;
  changed: boolean;
  job: PlanGenerationJob | null;
}

const QUEUED_PREPARING_POLL_DELAYS = [1_000, 2_000, 3_000, 5_000] as const;
const GENERATING_POLL_DELAYS = [3_000, 5_000, 8_000, 10_000] as const;
const VALIDATING_POLL_DELAYS = [1_000, 2_000, 3_000] as const;
const FAILURE_POLL_DELAYS = [5_000, 10_000, 20_000, 30_000, 60_000] as const;

function pollKey(job: PlanGenerationJob | null): string {
  if (!job) return 'none';
  return `${job.id}:${job.status}:${job.phase}:${job.attempt}`;
}

function delaysForJob(job: PlanGenerationJob): readonly number[] {
  if (job.phase === 'generating') return GENERATING_POLL_DELAYS;
  if (job.phase === 'validating') return VALIDATING_POLL_DELAYS;
  return QUEUED_PREPARING_POLL_DELAYS;
}

function delayAt(delays: readonly number[], index: number): number {
  return delays[Math.min(index, delays.length - 1)];
}

const OnboardingGenerationContext = createContext<OnboardingGenerationValue | null>(null);

export function OnboardingGenerationProvider({ children }: { children: ReactNode }) {
  const { userId } = useSession();
  const [initialized, setInitialized] = useState(false);
  const [job, setJob] = useState<PlanGenerationJob | null>(null);
  const [connectionIssue, setConnectionIssue] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
  const jobRef = useRef<PlanGenerationJob | null>(null);
  const epochRef = useRef(0);
  const startRef = useRef<Promise<PlanGenerationJob> | null>(null);
  const refreshRef = useRef<Promise<RefreshGenerationOutcome> | null>(null);
  const appStateRef = useRef(AppState.currentState);

  const commitJob = useCallback((nextJob: PlanGenerationJob | null) => {
    jobRef.current = nextJob;
    setJob(nextJob);
  }, []);

  useEffect(() => {
    const epoch = ++epochRef.current;
    const timer = setTimeout(() => {
      startRef.current = null;
      refreshRef.current = null;
      commitJob(null);
      setConnectionIssue(false);
      setLastSyncedAt(null);

      if (!userId) {
        setInitialized(true);
        return;
      }

      setInitialized(false);
      void apiFetch<{ job: PlanGenerationJob | null }>('/api/plans/generation-jobs')
        .then(response => {
          if (epoch !== epochRef.current) return;
          commitJob(response.job);
          setLastSyncedAt(Date.now());
        })
        .catch(error => {
          if (epoch !== epochRef.current) return;
          console.warn('[plan-generation] restore failed', error);
          setConnectionIssue(true);
        })
        .finally(() => {
          if (epoch === epochRef.current) setInitialized(true);
        });
    }, 0);

    return () => clearTimeout(timer);
  }, [commitJob, userId]);

  const refreshGeneration = useCallback((): Promise<RefreshGenerationOutcome> => {
    if (!userId) {
      return Promise.resolve({ ok: false, changed: false, job: null });
    }
    if (refreshRef.current) return refreshRef.current;
    const epoch = epochRef.current;
    const current = jobRef.current;
    const previousKey = pollKey(current);
    const path = current
      ? `/api/plans/generation-jobs/${encodeURIComponent(current.id)}`
      : '/api/plans/generation-jobs';

    const request = apiFetch<{ job: PlanGenerationJob | null }>(path)
      .then(response => {
        if (epoch !== epochRef.current) {
          return { ok: false, changed: false, job: jobRef.current };
        }
        commitJob(response.job);
        setConnectionIssue(false);
        setLastSyncedAt(Date.now());
        return {
          ok: true,
          changed: pollKey(response.job) !== previousKey,
          job: response.job,
        };
      })
      .catch(error => {
        if (epoch !== epochRef.current) {
          return { ok: false, changed: false, job: jobRef.current };
        }
        console.warn('[plan-generation] poll failed', error);
        setConnectionIssue(true);
        return { ok: false, changed: false, job: jobRef.current };
      });
    refreshRef.current = request;
    void request.finally(() => {
      if (refreshRef.current === request) refreshRef.current = null;
    });
    return request;
  }, [commitJob, userId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      const wasActive = appStateRef.current === 'active';
      const isActive = nextState === 'active';
      appStateRef.current = nextState;
      setAppIsActive(isActive);

      if (!wasActive && isActive) {
        void refreshGeneration();
      }
    });
    return () => subscription.remove();
  }, [refreshGeneration]);

  const activeJob = job && ['queued', 'running'].includes(job.status) ? job : null;
  const activePollKey = activeJob ? pollKey(activeJob) : null;

  useEffect(() => {
    if (!userId || !activePollKey || !appIsActive) return;
    const initialJob = jobRef.current;
    if (!initialJob || !['queued', 'running'].includes(initialJob.status)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let successIndex = 0;
    let failureIndex = 0;

    const schedule = (delayMs: number) => {
      timer = setTimeout(() => { void poll(); }, delayMs);
    };

    const poll = async () => {
      if (appStateRef.current !== 'active') return;
      const outcome = await refreshGeneration();
      if (cancelled || appStateRef.current !== 'active') return;

      if (!outcome.ok) {
        schedule(delayAt(FAILURE_POLL_DELAYS, failureIndex));
        failureIndex += 1;
        return;
      }

      failureIndex = 0;
      const latest = outcome.job;
      if (!latest || !['queued', 'running'].includes(latest.status)) return;

      // A phase/attempt transition creates a new effect with a fresh cadence.
      if (pollKey(latest) !== activePollKey) return;
      successIndex += 1;
      schedule(delayAt(delaysForJob(latest), successIndex));
    };
    schedule(delayAt(delaysForJob(initialJob), successIndex));

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activePollKey, appIsActive, refreshGeneration, userId]);

  useEffect(() => {
    if (!userId || !initialized || job || !connectionIssue || !appIsActive) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failureIndex = 0;
    const retry = async () => {
      if (appStateRef.current !== 'active') return;
      const outcome = await refreshGeneration();
      if (cancelled || outcome.ok || appStateRef.current !== 'active') return;
      timer = setTimeout(() => { void retry(); }, delayAt(FAILURE_POLL_DELAYS, failureIndex));
      failureIndex += 1;
    };

    timer = setTimeout(() => { void retry(); }, delayAt(FAILURE_POLL_DELAYS, failureIndex));
    failureIndex += 1;
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [appIsActive, connectionIssue, initialized, job, refreshGeneration, userId]);

  const startGeneration = useCallback(async (input: RawGenerationRequest) => {
    if (!userId) throw new Error('unauthorized');

    const current = jobRef.current;
    if (current && current.status !== 'failed') return current;
    if (startRef.current) return startRef.current;

    const epoch = epochRef.current;
    const request = apiFetch<{ job: PlanGenerationJob; reused: boolean }>(
      '/api/plans/generation-jobs',
      { method: 'POST', body: input },
    ).then(response => {
      if (epoch === epochRef.current) {
        commitJob(response.job);
        setConnectionIssue(false);
        setLastSyncedAt(Date.now());
      }
      return response.job;
    });
    startRef.current = request;

    try {
      return await request;
    } finally {
      if (startRef.current === request) startRef.current = null;
    }
  }, [commitJob, userId]);

  const consumeGeneration = useCallback(async () => {
    const current = jobRef.current;
    if (!userId || !current) return;
    const epoch = epochRef.current;
    await apiFetch<{ ok: true }>(
      `/api/plans/generation-jobs/${encodeURIComponent(current.id)}/consume`,
      { method: 'POST' },
    );
    if (epoch === epochRef.current) setLastSyncedAt(Date.now());
    if (epoch === epochRef.current && jobRef.current?.id === current.id) {
      commitJob(null);
    }
  }, [commitJob, userId]);

  const result = job?.status === 'succeeded' && job.result?.ok
    ? job.result
    : null;
  const value = useMemo(
    () => ({
      initialized,
      job,
      result,
      connectionIssue,
      lastSyncedAt,
      startGeneration,
      refreshGeneration,
      consumeGeneration,
    }),
    [
      connectionIssue,
      consumeGeneration,
      initialized,
      job,
      lastSyncedAt,
      refreshGeneration,
      result,
      startGeneration,
    ],
  );

  return (
    <OnboardingGenerationContext.Provider value={value}>
      {children}
    </OnboardingGenerationContext.Provider>
  );
}

export function useOnboardingGeneration(): OnboardingGenerationValue {
  const context = useContext(OnboardingGenerationContext);
  if (!context) {
    throw new Error('useOnboardingGeneration must be used within OnboardingGenerationProvider');
  }
  return context;
}
