import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Label, PressableScale } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';
import { useApp } from '@/context/app-state';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import { markRecoverySettled } from '@/lib/account-recovery';
import { restoreBackup, RestoreStep } from '@/lib/backup';
import { syncDevices } from '@/lib/device-sync';

const STEP_LABELS: Record<RestoreStep, string> = {
  downloading: 'Descargando tu copia…',
  verifying: 'Verificando que esté completa…',
  applying: 'Guardando en este teléfono…',
  finishing: 'Terminando…',
};

/**
 * Shown by the routing gate on a phone without history for this account:
 * either a personal backup exists (offer to restore it) or the server could
 * not be reached (retry). Onboarding starts only after a verified absence or
 * the athlete explicitly choosing to start without restoring.
 */
export default function RecuperarScreen() {
  const params = useLocalSearchParams<{ state?: string; revision?: string; createdAt?: string; totalRows?: string }>();
  const { userId, signOut } = useSession();
  const { reloadAll } = useApp();
  const { accent, setAccent, setWeightUnit, setThemeMode } = usePreferences();
  const C = useColors();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<RestoreStep | null>(null);
  const currentUser = useRef(userId);
  useEffect(() => { currentUser.current = userId; }, [userId]);

  const retryState = params.state === 'retry';
  const syncState = params.state === 'sync';
  const [syncing, setSyncing] = useState(false);

  async function syncNow() {
    const uid = userId;
    if (!uid || syncing) return;
    setSyncing(true);
    const outcome = await syncDevices(uid);
    if (currentUser.current !== uid) return;
    if (outcome.status === 'synced') {
      await markRecoverySettled(uid);
      await reloadAll().catch(e => console.error('[sync-reload]', e));
      router.replace('/');
      return;
    }
    setSyncing(false);
    Alert.alert('No se pudo sincronizar', outcome.status === 'plus_required'
      ? 'La sincronización entre dispositivos es parte de PULSO Plus.'
      : 'Revisá tu conexión e intentá de nuevo. Nada cambió en este teléfono.');
  }
  const createdAt = params.createdAt ? Number(params.createdAt) : null;
  const date = createdAt
    ? new Date(createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  async function restore() {
    const uid = userId;
    if (!uid || step) return;
    const outcome = await restoreBackup(uid, {
      revision: params.revision ? Number(params.revision) : undefined,
      stillCurrent: () => currentUser.current === uid,
      onStep: setStep,
    });
    if (outcome.status === 'account_changed') return;
    if (outcome.status === 'restored') {
      if (outcome.settings.accentColor) setAccent(outcome.settings.accentColor);
      if (outcome.settings.weightUnit) setWeightUnit(outcome.settings.weightUnit);
      if (outcome.settings.themeMode) setThemeMode(outcome.settings.themeMode);
      await markRecoverySettled(uid);
      await reloadAll().catch(e => console.error('[restore-reload]', e));
      router.replace('/');
      return;
    }
    setStep(null);
    const message = outcome.status === 'not_found'
      ? 'Ya no hay una copia en tu cuenta. Podés empezar sin restaurar.'
      : outcome.status === 'corrupt' || outcome.status === 'invalid'
        ? 'La copia no pasó la verificación y no tocamos nada de este teléfono. Podés intentar de nuevo o empezar sin restaurar.'
        : 'No pudimos terminar. Revisá tu conexión: nada se guardó todavía en este teléfono.';
    Alert.alert('No se restauró la copia', message);
  }

  function startWithout() {
    const uid = userId;
    if (!uid) return;
    Alert.alert(
      'Empezar sin restaurar',
      retryState
        ? 'Si tenías una copia en tu cuenta, sigue ahí: podés restaurarla después desde Configuración.'
        : 'Tu copia sigue guardada en tu cuenta: podés restaurarla después desde Configuración.',
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: 'Empezar',
          onPress: () => {
            void markRecoverySettled(uid).then(() => router.replace('/'));
          },
        },
      ],
    );
  }

  function leave() {
    void signOut();
    router.replace('/(auth)/login' as never);
  }

  const busy = step != null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20, paddingHorizontal: 20, justifyContent: 'space-between' }}>
      <View style={{ gap: 14 }}>
        <Label style={{ color: accent }}>{retryState ? 'SIN CONEXIÓN' : syncState ? 'DISPOSITIVOS SINCRONIZADOS' : 'TENÉS UNA COPIA'}</Label>
        <Text accessibilityRole="header" style={{ fontFamily: F.grotesk, fontSize: 28, lineHeight: 32, color: C.textPrimary }}>
          {retryState ? 'No pudimos revisar tu cuenta.' : syncState ? 'Traé tus datos a este teléfono.' : 'Recuperá tus datos en este teléfono.'}
        </Text>
        <Text style={{ fontFamily: F.inter, fontSize: 14, lineHeight: 21, color: C.textSecondary }}>
          {retryState
            ? 'Necesitamos conexión para saber si tenés una copia de respaldo. Así no te hacemos empezar de cero si ya tenías historial.'
            : syncState
              ? 'Tu cuenta sincroniza tus dispositivos. Este teléfono va a tener tus planes, entrenos, comidas y medidas, y desde ahora todo lo que registres en cualquiera se ve en todos.'
            : `Tu copia personal${date ? ` del ${date}` : ''} tiene tu perfil, tus planes y tu historial de entrenos, comidas y medidas. Las fotos de progreso quedan en el teléfono anterior.`}
        </Text>
        {!retryState && !syncState && (
          <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textTertiary }}>
            Al restaurar, este teléfono pasa a ser el que registra tu actividad: el anterior deja de sincronizar. Lo que compartís con tu coach o nutricionista no cambia.
          </Text>
        )}
        {syncing && (
          <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <ActivityIndicator color={accent} />
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textSecondary }}>Sincronizando…</Text>
          </View>
        )}
        {busy && (
          <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <ActivityIndicator color={accent} />
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textSecondary }}>{STEP_LABELS[step]}</Text>
          </View>
        )}
      </View>
      <View style={{ gap: 10 }}>
        <PressableScale
          onPress={() => (retryState ? router.replace('/') : syncState ? void syncNow() : void restore())}
          disabled={busy || syncing}
          haptic="success"
          style={{ minHeight: 50, justifyContent: 'center', alignItems: 'center', backgroundColor: accent }}
        >
          <Text style={{ fontFamily: F.monoXBold, fontSize: 12, letterSpacing: 0.8, color: C.onAccent }}>
            {retryState ? 'REINTENTAR' : syncState ? (syncing ? 'SINCRONIZANDO…' : 'SINCRONIZAR') : busy ? 'RESTAURANDO…' : 'RESTAURAR MI COPIA'}
          </Text>
        </PressableScale>
        <PressableScale
          onPress={startWithout}
          disabled={busy}
          style={{ minHeight: 50, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border }}
        >
          <Text style={{ fontFamily: F.monoBold, fontSize: 11, color: C.textPrimary }}>EMPEZAR SIN RESTAURAR</Text>
        </PressableScale>
        <PressableScale onPress={leave} disabled={busy} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1, color: C.textSecondary }}>CERRAR SESIÓN</Text>
        </PressableScale>
      </View>
    </View>
  );
}
