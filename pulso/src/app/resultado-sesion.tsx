import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SessionResultCard } from '@/components/pulse/session-result-card';
import { Label, PressableScale } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import {
  canShareTrainingWithTeam,
  createSessionCard,
  getSessionCard,
  getTrainingSession,
  SessionCard,
  shareSessionCard,
  unshareSessionCard,
} from '@/db/pulse';
import { DETAILED_MUSCLE_LABELS } from '@/lib/muscles';
import { sessionMuscles, TrainingSession } from '@/lib/pulse-engine';
import { syncMobileData } from '@/lib/sync';
import { displayWeight } from '@/lib/units';

type Loaded = { session: TrainingSession; card: SessionCard | null };

/**
 * Close of a session: reveals the single most meaningful result, or — when
 * nothing notable happened — a plain summary with a recovery note. Never
 * invents an achievement. Opened from history (`origin=history`) it's a viewer.
 */
export default function ResultadoSesionScreen() {
  const { sessionId, origin } = useLocalSearchParams<{ sessionId?: string; origin?: string }>();
  const { userId } = useSession();
  const { accent, weightUnit } = usePreferences();
  const C = useColors();
  const insets = useSafeAreaInsets();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [missing, setMissing] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [sharing, setSharing] = useState(false);
  const fromHistory = origin === 'history';

  async function toggleShare() {
    if (!userId || !loaded?.card || sharing) return;
    setSharing(true);
    try {
      const card = loaded.card.sharedWithTeamAt
        ? await unshareSessionCard(userId, loaded.card.id)
        : await shareSessionCard(userId, loaded.card.id);
      setLoaded(current => (current ? { ...current, card } : current));
      syncMobileData(userId).catch(() => {});
    } catch (e) {
      console.error('[card-share]', e);
    } finally {
      setSharing(false);
    }
  }

  useEffect(() => {
    if (!sessionId || !userId) return;
    let active = true;
    (async () => {
      const session = await getTrainingSession(sessionId);
      if (!session) { if (active) setMissing(true); return; }
      // Normally created when the session closed; retried here if that failed.
      const card = await getSessionCard(sessionId) ?? await createSessionCard(userId, sessionId);
      const shareable = await canShareTrainingWithTeam(userId);
      if (!active) return;
      setCanShare(shareable);
      setLoaded({ session, card });
      if (card && !fromHistory) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    })().catch(e => {
      console.error('[session-result]', e);
      if (active) setMissing(true);
    });
    return () => { active = false; };
  }, [sessionId, userId, fromHistory]);

  const close = () => (fromHistory ? router.back() : router.dismissTo('/hoy'));

  if (missing) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
        <Text style={{ fontFamily: F.inter, fontSize: 14, color: C.textSecondary, textAlign: 'center' }}>
          No encontramos esta sesión en el teléfono.
        </Text>
        <PressableScale onPress={close} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 20, borderWidth: 1, borderColor: C.border }}>
          <Text style={{ fontFamily: F.monoBold, fontSize: 11, color: C.textPrimary }}>VOLVER</Text>
        </PressableScale>
      </View>
    );
  }

  if (!loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.textTertiary} accessibilityLabel="Cargando resultado" />
      </View>
    );
  }

  const { session, card } = loaded;
  const sets = session.exercises.flatMap(exercise => exercise.sets);
  const volume = sets.reduce((total, set) => total + set.weightKg * set.reps, 0);
  const rated = sets.filter(set => set.rpe != null);
  const avgRpe = rated.length ? rated.reduce((total, set) => total + (set.rpe ?? 0), 0) / rated.length : null;
  const minutes = session.finishedAt != null ? Math.max(1, Math.round((session.finishedAt - session.startedAt) / 60_000)) : null;
  const worked = sessionMuscles(session, 2).map(key => DETAILED_MUSCLE_LABELS[key].toLowerCase());

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: 16, paddingBottom: 24 }}>
        <View style={{ alignItems: 'center', marginBottom: 18 }}>
          <Label>{`SESIÓN COMPLETADA${minutes ? ` · ${minutes} MIN` : ''}`}</Label>
          <Text accessibilityRole="header" style={{ fontFamily: F.grotesk, fontSize: 24, color: C.textPrimary, textAlign: 'center', marginTop: 6, maxWidth: 300 }}>
            {card ? 'Un resultado que vale guardar' : 'Sesión registrada'}
          </Text>
        </View>

        {card ? (
          <Animated.View entering={FadeIn.duration(250)} style={{ alignItems: 'center', marginBottom: 18 }}>
            <SessionResultCard card={card} weightUnit={weightUnit} accent={accent} style={{ width: '82%', maxWidth: 340 }} />
          </Animated.View>
        ) : (
          <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.border, paddingVertical: 14, marginBottom: 18, gap: 6 }}>
            <Label style={{ color: C.cyan }}>RECUPERACIÓN</Label>
            <Text style={{ fontFamily: F.inter, fontSize: 13, lineHeight: 19, color: C.textSecondary }}>
              {worked.length
                ? `Trabajaste ${worked.join(' y ')}. Como referencia de entrenamiento, dales unas 48 h antes de volver a cargarlos fuerte.`
                : 'Buen trabajo. Hoy no hubo un hito nuevo; la constancia también se construye así.'}
            </Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: C.border, marginBottom: 20 }}>
          {[
            { label: 'VOLUMEN', value: `${Math.round(displayWeight(volume, weightUnit)).toLocaleString()} ${weightUnit}` },
            { label: 'SERIES', value: String(sets.length) },
            { label: 'RPE MEDIO', value: avgRpe != null ? avgRpe.toFixed(1) : '—' },
          ].map((item, index) => (
            <View
              key={item.label}
              accessible
              accessibilityLabel={`${item.label.toLowerCase()}: ${item.value}`}
              style={{ flex: 1, padding: 10, gap: 4, borderLeftWidth: index ? 1 : 0, borderLeftColor: C.border }}
            >
              <Label>{item.label}</Label>
              <Text style={{ fontFamily: F.monoBold, fontSize: 15, color: C.textPrimary }}>{item.value}</Text>
            </View>
          ))}
        </View>

        <View style={{ gap: 8 }}>
          <PressableScale
            onPress={close}
            haptic="medium"
            accessibilityHint={fromHistory ? undefined : 'La tarjeta ya quedó guardada en tu teléfono. Vuelve a Hoy.'}
            style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: accent }}
          >
            <Text style={{ fontFamily: F.monoXBold, fontSize: 12, letterSpacing: 0.8, color: C.onAccent }}>
              {fromHistory ? 'VOLVER' : 'GUARDAR'}
            </Text>
          </PressableScale>
          {card && (
            <View>
              <PressableScale
                onPress={() => void toggleShare()}
                disabled={!canShare || sharing}
                accessibilityHint={canShare
                  ? card.sharedWithTeamAt ? 'Tu equipo deja de ver esta tarjeta' : 'Tu equipo va a ver esta tarjeta'
                  : 'Requiere compartir entrenamiento con tu equipo'}
                style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: card.sharedWithTeamAt ? C.cyan : C.border }}
              >
                <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, color: card.sharedWithTeamAt ? C.cyan : canShare ? C.textPrimary : C.textSecondary }}>
                  {card.sharedWithTeamAt ? '✓ COMPARTIDA · DEJAR DE COMPARTIR' : 'COMPARTIR CON MI EQUIPO'}
                </Text>
              </PressableScale>
              <Text style={{ fontFamily: F.inter, fontSize: 11, lineHeight: 16, color: C.textTertiary, marginTop: 5, textAlign: 'center' }}>
                {!canShare
                  ? 'Para compartirla, activá “Entrenamiento” en Perfil → Equipo. Mientras tanto queda solo en tu teléfono.'
                  : card.sharedWithTeamAt
                    ? 'Tu equipo la ve junto a tu progreso. Podés dejar de compartirla cuando quieras.'
                    : 'Solo se comparte si lo elegís. Se envía con tu próxima sincronización.'}
              </Text>
            </View>
          )}
          {!fromHistory && (
            <PressableScale
              onPress={() => router.replace({ pathname: '/progreso', params: { tab: 'fuerza' } })}
              style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border }}
            >
              <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, color: C.textPrimary }}>VER EN PROGRESO</Text>
            </PressableScale>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
