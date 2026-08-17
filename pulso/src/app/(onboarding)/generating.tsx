import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, GlowPulse, Label, PressableScale } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import {
  PlanGenerationJob,
  RawGenerationRequest,
  useOnboardingGeneration,
} from '@/context/onboarding-generation';
import { useSession } from '@/context/session';
import {
  clearGenerationProfile,
  completeOnboarding,
  getGenerationProfile,
  setOnboardingStepIfInProgress,
} from '@/db/onboarding';
import { getAthleteProfile, getLatestWeight } from '@/db/profile';

function ageFromDateOfBirth(value: string | null): number | null {
  if (!value) return null;

  let year: number;
  let month: number;
  let day: number;
  const slashMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (slashMatch) {
    day = Number(slashMatch[1]);
    month = Number(slashMatch[2]);
    year = Number(slashMatch[3]);
  } else if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else {
    return null;
  }

  const birth = new Date(year, month - 1, day);
  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day
  ) return null;

  const now = new Date();
  let age = now.getFullYear() - year;
  const birthdayHasPassed =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!birthdayHasPassed) age -= 1;
  return age > 0 && age < 120 ? age : null;
}

function errorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'profile_incomplete') {
    return 'Faltan datos del perfil o del cuestionario. Volvé a revisar tus respuestas antes de generar el plan.';
  }
  if (code === 'consent_required') {
    return 'Necesitamos tu consentimiento para enviar estos datos al proveedor de IA.';
  }
  if (code === 'generation_unavailable') {
    return 'La generación de planes no está disponible en este momento.';
  }
  if (code === 'generation_invalid') {
    return 'El plan generado no pasó nuestras validaciones. Podés intentarlo nuevamente.';
  }
  if (code === 'generation_timeout' || code === 'openrouter_timeout') {
    return 'El proveedor gratuito agotó su tiempo de respuesta. Tu información sigue guardada y podés reintentar.';
  }
  if (code === 'generation_upstream_error') {
    return 'El proveedor gratuito no pudo responder. Podés reintentar sin volver a completar el cuestionario.';
  }
  if (code === 'generation_rate_limited') {
    return 'El proveedor gratuito alcanzó su límite temporal. Esperá unos minutos antes de reintentar.';
  }
  if (code === 'catalog_unavailable') {
    return 'No pudimos cargar el catálogo de ejercicios. Es un error temporal y podés reintentar.';
  }
  if (code === 'generation_interrupted') {
    return 'El servidor se reinició durante la generación. Tus respuestas siguen guardadas y podés reintentar.';
  }
  if (code === 'generation_request_invalid') {
    return 'El job guardado ya no es válido. Volvé a revisar tus respuestas antes de crear otro plan.';
  }
  return 'No pudimos generar tu plan. Revisá tu conexión e intentá nuevamente.';
}

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatSyncAge(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m`;
}

function phaseLabel(job: PlanGenerationJob | null): string {
  if (!job || job.status === 'queued') return 'Esperando turno';
  if (job.phase === 'preparing') return 'Preparando datos y catálogos';
  if (job.phase === 'generating') {
    return job.attempt > 1 ? 'Reintentando automáticamente' : 'Creando la propuesta';
  }
  if (job.phase === 'validating') {
    return job.attempt > 1 ? 'Validando el nuevo intento' : 'Validando entrenamiento y comidas';
  }
  return 'Finalizando tu plan';
}

function phaseRank(job: PlanGenerationJob | null): number {
  if (!job || job.status === 'queued') return 0;
  if (job.phase === 'preparing') return 0;
  if (job.phase === 'generating') return 2;
  if (job.phase === 'validating') return 3;
  return 4;
}

export default function GeneratingScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId } = useSession();
  const {
    initialized,
    job,
    connectionIssue,
    lastSyncedAt,
    startGeneration,
    consumeGeneration,
  } = useOnboardingGeneration();
  const [starting, setStarting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const active = job?.status === 'queued' || job?.status === 'running';

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (!userId) return;
    void setOnboardingStepIfInProgress(userId, 'generating').catch(error => {
      console.warn('[onboarding] generation step save failed', error);
    });
  }, [userId]);

  const generate = useCallback(async () => {
    if (!userId || starting) return;
    setStarting(true);
    setLocalError(null);

    try {
      const [profile, generationProfile, weightKg] = await Promise.all([
        getAthleteProfile(userId),
        getGenerationProfile(userId),
        getLatestWeight(userId),
      ]);

      if (!generationProfile?.consentedToExternalProcessing) {
        throw new Error('consent_required');
      }

      const ageYears = ageFromDateOfBirth(profile?.dateOfBirth ?? null);
      if (
        !profile?.sex ||
        !profile.heightCm ||
        !weightKg ||
        !ageYears ||
        !generationProfile.goal ||
        !generationProfile.pace ||
        !generationProfile.experienceLevel ||
        !generationProfile.daysPerWeek ||
        !generationProfile.sessionMinutes ||
        !generationProfile.activityOutsideTraining ||
        !generationProfile.mealsPerDay
      ) {
        throw new Error('profile_incomplete');
      }

      const body: RawGenerationRequest = {
        sex: profile.sex,
        ageYears,
        heightCm: profile.heightCm,
        weightKg,
        activityOutsideTraining: generationProfile.activityOutsideTraining,
        goal: generationProfile.goal,
        pace: generationProfile.pace,
        experienceLevel: generationProfile.experienceLevel,
        daysPerWeek: generationProfile.daysPerWeek,
        sessionMinutes: generationProfile.sessionMinutes,
        mealsPerDay: generationProfile.mealsPerDay,
        availableEquipment: generationProfile.availableEquipment,
        trainingLocation: generationProfile.trainingLocation,
        injuriesAndLimitations: generationProfile.injuriesAndLimitations,
        excludedExercises: generationProfile.excludedExercises,
        dietaryStyle: generationProfile.dietaryStyle,
        allergies: generationProfile.allergies,
        intolerances: generationProfile.intolerances,
        dislikedFoods: generationProfile.dislikedFoods,
        preferredMealTimes: generationProfile.preferredMealTimes,
        cookingTimeBudget: generationProfile.cookingTimeBudget,
        budgetLevel: generationProfile.budgetLevel,
      };

      await startGeneration(body);
    } catch (error) {
      setLocalError(errorMessage(error));
    } finally {
      setStarting(false);
    }
  }, [startGeneration, starting, userId]);

  useEffect(() => {
    if (!initialized || job || localError || starting) return;
    const timer = setTimeout(() => { void generate(); }, 0);
    return () => clearTimeout(timer);
  }, [generate, initialized, job, localError, starting]);

  useEffect(() => {
    if (job?.status === 'succeeded' && job.result?.ok) {
      router.replace('/(onboarding)/results' as never);
    }
  }, [job, router]);

  const continueInBackground = useCallback(async () => {
    if (!userId || leaving) return;
    setLeaving(true);
    try {
      // Keep the generation draft and server job. Completing the wizard only
      // changes the startup gate so the user can keep using the app.
      await completeOnboarding(userId);
      router.replace('/hoy' as never);
    } finally {
      setLeaving(false);
    }
  }, [leaving, router, userId]);

  const skipGeneration = useCallback(async () => {
    if (!userId || skipping) return;
    setSkipping(true);
    try {
      if (job && !active) await consumeGeneration();
      await clearGenerationProfile(userId);
      await completeOnboarding(userId);
      router.replace('/hoy' as never);
    } finally {
      setSkipping(false);
    }
  }, [active, consumeGeneration, job, router, skipping, userId]);

  const review = job?.status === 'requires_review' && job.result && !job.result.ok
    ? job.result
    : null;
  const failureMessage = job?.status === 'failed'
    ? job.error?.retryable === false && job.error.code === 'generation_upstream_error'
      ? 'El modelo configurado no admite esta solicitud. Revisá la configuración del servidor antes de crear otro job.'
      : errorMessage(new Error(job.error?.code ?? 'generation_failed'))
    : null;
  const shownError = localError ?? failureMessage;
  const retryAllowed = job?.status !== 'failed' || job.error?.retryable !== false;
  const loading = !initialized || starting || active || (!job && !shownError);
  const elapsedMs = job
    ? (active
      ? Math.max(job.elapsedMs, now - job.createdAt)
      : (job.durationMs ?? job.elapsedMs))
    : 0;
  const rank = phaseRank(job);
  const lastSyncAge = lastSyncedAt == null ? null : formatSyncAge(now - lastSyncedAt);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + 28,
        paddingBottom: insets.bottom + 28,
        paddingHorizontal: 20,
        justifyContent: 'center',
      }}
    >
      {loading ? (
        <View style={{ gap: 22 }}>
          <View style={{ gap: 20, alignItems: 'center' }}>
            <GlowPulse
              color={C.yellow}
              intensity={0.18}
              period={900}
              style={{
                width: 112,
                height: 112,
                borderRadius: 56,
                borderWidth: 1,
                borderColor: withAlpha(C.yellow, 0.55),
                backgroundColor: C.card,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: C.cyan, fontFamily: F.monoXBold, fontSize: 34 }}>P</Text>
            </GlowPulse>
            <View style={{ gap: 8, alignItems: 'center' }}>
              <Label>GENERACIÓN EN SEGUNDO PLANO</Label>
              <Text style={{ color: C.textPrimary, fontFamily: F.grotesk, fontSize: 29, textAlign: 'center' }}>
                {phaseLabel(job)}
              </Text>
              <Text style={{ color: C.cyan, fontFamily: F.monoXBold, fontSize: 25 }}>
                {formatElapsed(elapsedMs)}
              </Text>
              <Text style={{ color: C.textSecondary, fontFamily: F.inter, fontSize: 13, lineHeight: 20, textAlign: 'center' }}>
                Normalmente tarda entre 1 y 3 minutos. La IA puede pasar más de un minuto sin mostrar cambios; podés seguir usando PULSO mientras el servidor trabaja.
              </Text>
            </View>
          </View>

          <Card style={{ padding: 15, gap: 10 }}>
            {[
              'Preparar perfil y catálogos',
              'Calcular objetivos seguros',
              'Crear propuesta con IA',
              'Validar ejercicios y nutrición',
            ].map((label, index) => {
              const done = index < rank;
              const current = index === rank;
              return (
                <View key={label} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <Text style={{ color: done || current ? C.cyan : C.textTertiary, fontFamily: F.monoBold }}>
                    {done ? '✓' : current ? '●' : '○'}
                  </Text>
                  <Text style={{ flex: 1, color: current ? C.textPrimary : C.textSecondary, fontFamily: F.inter, fontSize: 12 }}>
                    {label}
                  </Text>
                </View>
              );
            })}
            {job && (
              <Text style={{ color: C.textTertiary, fontFamily: F.mono, fontSize: 9, marginTop: 2 }}>
                JOB {job.id.slice(0, 8).toUpperCase()}
                {lastSyncAge ? ` · ACTUALIZADO HACE ${lastSyncAge}` : ''}
              </Text>
            )}
            {connectionIssue && (
              <Text style={{ color: C.orange, fontFamily: F.interMed, fontSize: 11, lineHeight: 17 }}>
                No pudimos actualizar el estado. Reintentamos automáticamente; el job del servidor no se canceló.
              </Text>
            )}
          </Card>

          {job && active && (
            <PressableScale
              disabled={leaving}
              onPress={() => void continueInBackground()}
              style={{ paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: C.cyan }}
            >
              <Text style={{ color: C.cyan, fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.7 }}>
                {leaving ? 'ABRIENDO PULSO…' : 'SEGUIR USANDO PULSO'}
              </Text>
            </PressableScale>
          )}
        </View>
      ) : (
        <View style={{ gap: 18 }}>
          <View style={{ gap: 8 }}>
            <Label>{review ? 'REVISIÓN RECOMENDADA' : 'NO PUDIMOS TERMINAR'}</Label>
            <Text style={{ color: C.textPrimary, fontFamily: F.grotesk, fontSize: 30 }}>
              {review ? 'Tu caso necesita acompañamiento' : 'La generación se detuvo'}
            </Text>
            <Text style={{ color: C.textSecondary, fontFamily: F.inter, fontSize: 14, lineHeight: 21 }}>
              {review
                ? 'Por seguridad no creamos un plan automático. Podés seguir usando PULSO y configurar tu plan manualmente.'
                : shownError}
            </Text>
            {job && (
              <Text style={{ color: C.textTertiary, fontFamily: F.mono, fontSize: 9 }}>
                JOB {job.id.slice(0, 8).toUpperCase()} · {formatElapsed(elapsedMs)}
              </Text>
            )}
          </View>

          {review && (
            <Card style={{ padding: 16, gap: 10 }}>
              {review.reasons.map(reason => (
                <View key={reason} style={{ flexDirection: 'row', gap: 10 }}>
                  <Text style={{ color: C.orange, fontFamily: F.monoBold }}>!</Text>
                  <Text style={{ flex: 1, color: C.textMid, fontFamily: F.inter, fontSize: 13, lineHeight: 19 }}>
                    {reason}
                  </Text>
                </View>
              ))}
            </Card>
          )}

          <View style={{ gap: 10 }}>
            {!review && retryAllowed && (
              <PressableScale
                haptic="medium"
                disabled={starting}
                onPress={() => void generate()}
                style={{ paddingVertical: 15, alignItems: 'center', backgroundColor: C.yellow }}
              >
                <Text style={{ color: C.bg, fontFamily: F.monoBold, fontSize: 12, letterSpacing: 0.8 }}>
                  {starting ? 'CREANDO JOB…' : 'INTENTAR DE NUEVO'}
                </Text>
              </PressableScale>
            )}
            <PressableScale
              disabled={skipping}
              onPress={() => void skipGeneration()}
              style={{ paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: C.border }}
            >
              <Text style={{ color: C.textMid, fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.7 }}>
                {skipping ? 'GUARDANDO…' : 'CONTINUAR SIN IA'}
              </Text>
            </PressableScale>
            {!review && (
              <PressableScale
                haptic="none"
                onPress={() => router.replace('/(onboarding)/review' as never)}
                style={{ paddingVertical: 10, alignItems: 'center' }}
              >
                <Text style={{ color: C.textSecondary, fontFamily: F.interMed, fontSize: 13 }}>
                  Volver a revisar respuestas
                </Text>
              </PressableScale>
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
}
