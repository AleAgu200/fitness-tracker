import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PulseCore } from '@/components/pulse/pulse-core';
import { SignalStrip } from '@/components/pulse/signal-strip';
import { Card, Label, PressableScale, SMALL_TARGET_HIT_SLOP } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';
import { Exercise, useApp } from '@/context/app-state';
import { PlanGenerationJob, useOnboardingGeneration } from '@/context/onboarding-generation';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import { getWeeklySummary } from '@/db/pulse';
import { getSyncSummary } from '@/db/sync';
import { usePulse } from '@/hooks/use-pulse';
import { addDays, dateStr, mondayOf, WEEKDAY_LABELS, weekdayOf } from '@/lib/dates';
import { DETAILED_MUSCLE_LABELS, inferExerciseMuscles } from '@/lib/muscles';
import { sessionTime } from '@/lib/pulse-engine';

const DIAS  = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
/** The weekly story is featured on Hoy for this long after the week closes. */
const WEEKLY_STRIP_HOURS = 72;

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  return `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
}

function generationCopy(job: PlanGenerationJob): { title: string; detail: string; action: string; route: string } {
  if (job.status === 'succeeded') {
    return {
      title: 'Tu plan está listo',
      detail: `Completado en ${formatElapsed(job.durationMs ?? job.elapsedMs)}. Revisalo antes de aplicarlo.`,
      action: 'REVISAR Y APLICAR →',
      route: '/(onboarding)/results',
    };
  }
  if (job.status === 'requires_review') {
    return {
      title: 'Tu caso necesita revisión',
      detail: 'Por seguridad no aplicamos un plan automático. Mirá el detalle y elegí cómo continuar.',
      action: 'VER DETALLE →',
      route: '/(onboarding)/generating',
    };
  }
  if (job.status === 'failed') {
    return {
      title: 'La generación se detuvo',
      detail: 'Tus respuestas siguen guardadas. Podés ver el diagnóstico y reintentar.',
      action: 'VER Y REINTENTAR →',
      route: '/(onboarding)/generating',
    };
  }

  const phase = job.status === 'queued'
    ? 'Esperando turno'
    : job.phase === 'preparing'
      ? 'Preparando datos y catálogos'
      : job.phase === 'generating'
        ? job.attempt > 1
          ? 'La IA está reintentando automáticamente'
          : 'La IA está creando la propuesta'
        : 'Validando el resultado';
  return {
    title: 'Tu plan se está creando',
    detail: phase,
    action: 'VER PROGRESO →',
    route: '/(onboarding)/generating',
  };
}

/** "ESPALDA ALTA + BÍCEPS" — the first two primary muscles of the day. */
function focusMuscles(exercises: Exercise[]): string {
  const seen: string[] = [];
  for (const exercise of exercises) {
    const primary = inferExerciseMuscles(exercise.nombre, exercise.muscleGroup)[0];
    if (primary && !seen.includes(primary)) seen.push(primary);
  }
  return seen.slice(0, 2).map(key => DETAILED_MUSCLE_LABELS[key as keyof typeof DETAILED_MUSCLE_LABELS]).join(' + ');
}

/** ~90 s rest plus ~45 s of work per set, rounded up to 5 minutes. */
function estimatedMinutes(exercises: Exercise[]): number {
  const sets = exercises.reduce((total, exercise) => total + exercise.target, 0);
  return Math.max(5, Math.ceil((sets * 2.25) / 5) * 5);
}

type SyncLine = { text: string; tone: 'muted' | 'warn' } | null;

function useSyncLine(userId: string | null): SyncLine {
  const [line, setLine] = useState<SyncLine>(null);
  useFocusEffect(useCallback(() => {
    if (!userId) return;
    let active = true;
    getSyncSummary(userId)
      .then(summary => {
        if (!active) return;
        // Pending counts aren't shown: categories without sharing consent stay
        // queued by design, so a number would read as a permanent failure.
        if (summary.upgradeRequired) setLine({ text: 'ACTUALIZÁ LA APP PARA SINCRONIZAR', tone: 'warn' });
        else if (summary.lastError === 'network_unavailable') setLine({ text: 'SIN CONEXIÓN · TODO QUEDA EN TU TELÉFONO', tone: 'warn' });
        else if (summary.lastSuccessAt) setLine({ text: 'SINCRONIZADO', tone: 'muted' });
        else setLine(null);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [userId]));
  return line;
}

interface WeeklyStrip { weekStart: string; pages: number; viewed: boolean }

/** Last week's story, while it's fresh (first 72 h of the new week). */
function useWeeklyStrip(userId: string | null, plannedDays: number, now: number): WeeklyStrip | null {
  const [strip, setStrip] = useState<WeeklyStrip | null>(null);
  useFocusEffect(useCallback(() => {
    const thisMonday = mondayOf(new Date(now));
    if (!userId || now - thisMonday.getTime() > WEEKLY_STRIP_HOURS * 3_600_000) {
      setStrip(null);
      return;
    }
    let active = true;
    const lastMonday = addDays(thisMonday, -7);
    getWeeklySummary(userId, lastMonday, plannedDays)
      .then(entry => {
        if (!active) return;
        setStrip(entry ? { weekStart: dateStr(lastMonday), pages: entry.summary.pages.length, viewed: entry.viewedAt != null } : null);
      })
      .catch(e => console.error('[weekly-strip]', e));
    return () => { active = false; };
  }, [userId, plannedDays, now]));
  return strip;
}

export default function HoyScreen() {
  const { state } = useApp();
  const {
    job: generationJob,
    connectionIssue,
    refreshGeneration,
  } = useOnboardingGeneration();
  const { accent } = usePreferences();
  const { userId } = useSession();
  const C = useColors();
  const insets = useSafeAreaInsets();
  const { now, core, load, meals } = usePulse();
  const syncLine = useSyncLine(userId);
  const weekly = useWeeklyStrip(userId, state.plannedDaysPerWeek, now);
  const [generationNow, setGenerationNow] = useState(() => Date.now());

  const generationActive = generationJob?.status === 'queued' || generationJob?.status === 'running';
  useEffect(() => {
    if (!generationActive) return;
    const timer = setInterval(() => setGenerationNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [generationActive]);

  const today = new Date(now);
  const dateHeader = `${DIAS[today.getDay()]} ${today.getDate()} ${MESES[today.getMonth()]}`;
  const firstName = state.profile?.firstName || '';
  const initials  = state.profile?.initials || '?';

  const generationElapsed = generationJob
    ? generationActive
      ? Math.max(generationJob.elapsedMs, generationNow - generationJob.createdAt)
      : (generationJob.durationMs ?? generationJob.elapsedMs)
    : 0;
  const generationStatus = generationJob ? generationCopy(generationJob) : null;

  const loggedSets = Object.values(state.log).reduce((total, sets) => total + sets.length, 0);
  const todaysSession = state.trainingSessions.find(session =>
    session.status === 'completed' && new Date(sessionTime(session)).toDateString() === today.toDateString());

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16 }}>

        {/* Header */}
        <Animated.View entering={FadeIn.duration(250)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 2.4, color: C.textTertiary, textTransform: 'uppercase', marginBottom: 6 }}>
              {dateHeader}
            </Text>
            <Text accessibilityRole="header" style={{ fontFamily: F.grotesk, fontSize: 27, lineHeight: 30, color: C.textPrimary, letterSpacing: -0.3 }}>
              {firstName ? `Hola, ${firstName}` : 'Bienvenido'}
            </Text>
            {syncLine && (
              <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1, marginTop: 6, color: syncLine.tone === 'warn' ? C.orange : C.textTertiary }}>
                {syncLine.tone === 'warn' ? '● ' : '○ '}{syncLine.text}
              </Text>
            )}
          </View>
          <PressableScale
            onPress={() => router.push('/perfil')}
            accessibilityLabel="Abrir perfil"
            style={{ width: 44, height: 44, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: F.monoBold, fontSize: 13, color: accent }}>{initials}</Text>
          </PressableScale>
        </Animated.View>

        {generationJob && generationStatus && (
          <Card index={0} style={{ padding: 16, marginBottom: 14, gap: 9, borderColor: C.cyan }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Label>PLAN CON IA</Label>
              <Text style={{ color: C.cyan, fontFamily: F.monoBold, fontSize: 12 }}>
                {generationActive ? formatElapsed(generationElapsed) : generationJob.id.slice(0, 8).toUpperCase()}
              </Text>
            </View>
            <Text style={{ color: C.textPrimary, fontFamily: F.groteskMed, fontSize: 18 }}>
              {generationStatus.title}
            </Text>
            <Text style={{ color: C.textSecondary, fontFamily: F.inter, fontSize: 12, lineHeight: 18 }}>
              {generationStatus.detail}
            </Text>
            {connectionIssue && generationActive && (
              <Text style={{ color: C.orange, fontFamily: F.interMed, fontSize: 11, lineHeight: 17 }}>
                No pudimos actualizar el estado; reintentamos automáticamente.
              </Text>
            )}
            <PressableScale
              onPress={() => router.push(generationStatus.route as never)}
              style={{ marginTop: 3, borderWidth: 1, borderColor: C.cyan, paddingVertical: 12, alignItems: 'center' }}
            >
              <Text style={{ color: C.cyan, fontFamily: F.monoBold, fontSize: 10, letterSpacing: 0.5 }}>
                {generationStatus.action}
              </Text>
            </PressableScale>
          </Card>
        )}

        {!generationJob && connectionIssue && (
          <Card index={0} style={{ padding: 16, marginBottom: 14, gap: 9, borderColor: C.orange }}>
            <Label>ESTADO DEL PLAN</Label>
            <Text style={{ color: C.textPrimary, fontFamily: F.groteskMed, fontSize: 18 }}>
              No pudimos consultar el servidor
            </Text>
            <Text style={{ color: C.textSecondary, fontFamily: F.inter, fontSize: 12, lineHeight: 18 }}>
              Reintentamos automáticamente. Si ya había un plan generándose, no se perdió ni se canceló.
            </Text>
            <PressableScale
              onPress={() => void refreshGeneration()}
              style={{ borderWidth: 1, borderColor: C.orange, paddingVertical: 12, alignItems: 'center' }}
            >
              <Text style={{ color: C.orange, fontFamily: F.monoBold, fontSize: 10 }}>
                REINTENTAR AHORA
              </Text>
            </PressableScale>
          </Card>
        )}

        {/* NÚCLEO — the one focal point of the screen */}
        <Animated.View entering={FadeIn.duration(250)} style={{ marginBottom: 18 }}>
          <PulseCore core={core} accent={accent} />
        </Animated.View>

        {/* MISIÓN — one decision, one primary action */}
        {state.ready && (
          <Mission
            accent={accent}
            weekdayLabel={WEEKDAY_LABELS[weekdayOf(today)]}
            loggedSets={loggedSets}
            todaysSessionId={todaysSession?.id ?? null}
            recovering={core.state === 'RECUPERANDO'}
          />
        )}

        {/* SEÑALES */}
        <View style={{ marginTop: 14 }}>
          <SignalStrip
            signals={[
              {
                key: 'load',
                label: 'CARGA 7D',
                value: load.totalSets ? load.level : '—',
                accessibilityLabel: load.totalSets ? `Carga de siete días: ${load.level.toLowerCase()}` : 'Carga de siete días: sin registros',
                onPress: () => router.push({ pathname: '/progreso', params: { tab: 'cuerpo' } }),
              },
              {
                key: 'nutrition',
                label: 'NUTRICIÓN',
                value: meals.total ? `${meals.done}/${meals.total}` : '—',
                accessibilityLabel: meals.total ? `Nutrición: ${meals.done} de ${meals.total} comidas` : 'Nutrición: sin plan de comidas',
                onPress: () => router.push('/dieta'),
              },
              {
                key: 'continuity',
                label: 'CONTINUIDAD',
                value: `${state.racha} ${state.racha === 1 ? 'DÍA' : 'DÍAS'}`,
                onPress: () => router.push({ pathname: '/progreso', params: { tab: 'semanas' } }),
              },
            ]}
          />
        </View>

        {/* WRAPPED — editorial strip, only while the week is fresh */}
        {weekly && (
          <PressableScale
            onPress={() => router.push({ pathname: '/resumen-semanal', params: { week: weekly.weekStart } })}
            accessibilityHint="Abre el resumen de la semana pasada"
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, padding: 13,
              borderWidth: 1, borderColor: weekly.viewed ? C.border : accent, backgroundColor: C.card,
            }}
          >
            <View style={{ flex: 1, gap: 3 }}>
              <Label style={weekly.viewed ? undefined : { color: accent }}>
                {weekly.viewed ? 'TU SEMANA PASADA' : 'TU SEMANA YA ESTÁ LISTA'}
              </Label>
              <Text style={{ fontFamily: F.groteskMed, fontSize: 15, color: C.textPrimary }}>
                {weekly.viewed ? 'Volver a verla' : `Ver resumen · ${weekly.pages} páginas`}
              </Text>
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: 16, color: C.textSecondary }}>→</Text>
          </PressableScale>
        )}
      </View>
    </ScrollView>
  );
}

function Mission({ accent, weekdayLabel, loggedSets, todaysSessionId, recovering }: {
  accent: string;
  weekdayLabel: string;
  loggedSets: number;
  todaysSessionId: string | null;
  recovering: boolean;
}) {
  const { state } = useApp();
  const C = useColors();
  const { exercises, sessionDone, freeSession, activePlan } = state;
  const hasPlan = exercises.length > 0;

  let eyebrow: string;
  let title: string;
  let detail: string;
  let action: { label: string; onPress: () => void; primary: boolean } | null;

  if (sessionDone) {
    eyebrow = 'SESIÓN COMPLETADA';
    title = freeSession?.label ?? activePlan?.name ?? 'Entreno de hoy';
    detail = `${loggedSets} series registradas. Lo que sigue es recuperar.`;
    action = todaysSessionId
      ? { label: 'VER RESULTADO', primary: false, onPress: () => router.push({ pathname: '/resultado-sesion', params: { sessionId: todaysSessionId } }) }
      : null;
  } else if (hasPlan) {
    eyebrow = freeSession ? 'SESIÓN LIBRE' : loggedSets > 0 ? 'EN CURSO' : `PRÓXIMO PULSO · ${weekdayLabel}`;
    title = freeSession?.label ?? activePlan?.name ?? 'Entreno de hoy';
    const focus = focusMuscles(exercises);
    detail = `${exercises.length} ejercicio${exercises.length === 1 ? '' : 's'}${focus ? ` · ${focus}` : ''} · ~${estimatedMinutes(exercises)} min`;
    action = { label: loggedSets > 0 ? 'CONTINUAR' : 'EMPEZAR', primary: true, onPress: () => router.push('/entreno') };
  } else if (recovering) {
    eyebrow = 'HOY TOCA RECUPERAR';
    title = 'Día de recuperación';
    detail = 'Movilidad suave o descanso. Si querés entrenar, elegí grupos frescos en el mapa.';
    action = { label: 'SESIÓN LIBRE', primary: false, onPress: () => router.push('/sesion-libre') };
  } else {
    eyebrow = `${weekdayLabel} · SIN PLAN`;
    title = 'Elegí qué mover hoy';
    detail = 'Tocá el mapa y armamos una sesión con tus ejercicios.';
    action = { label: 'SESIÓN LIBRE', primary: true, onPress: () => router.push('/sesion-libre') };
  }

  const secondary = [
    ...(hasPlan && !sessionDone && !freeSession && loggedSets === 0
      ? [{ label: 'SESIÓN LIBRE', onPress: () => router.push('/sesion-libre') }]
      : []),
    { label: 'MIS PLANES', onPress: () => router.push('/mis-planes') },
  ];

  return (
    <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.border, paddingVertical: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Label style={sessionDone ? { color: accent } : undefined}>{eyebrow}</Label>
          <Text style={{ fontFamily: F.grotesk, fontSize: 19, color: C.textPrimary }}>{title}</Text>
          <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 17, color: C.textSecondary }}>{detail}</Text>
        </View>
        {action && (
          <PressableScale
            onPress={action.onPress}
            haptic={action.primary ? 'medium' : 'light'}
            style={{
              minHeight: 44, minWidth: 96, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center',
              backgroundColor: action.primary ? accent : 'transparent',
              borderWidth: 1, borderColor: action.primary ? accent : C.border,
            }}
          >
            <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, color: action.primary ? C.onAccent : C.textPrimary }}>
              {action.label}
            </Text>
          </PressableScale>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 18, marginTop: 12 }}>
        {secondary.map(link => (
          <PressableScale key={link.label} onPress={link.onPress} hitSlop={SMALL_TARGET_HIT_SLOP} haptic="light">
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1, color: C.textSecondary }}>{link.label} →</Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}
