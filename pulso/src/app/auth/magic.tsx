import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { F, useColors } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import { AuthError, redeemMagicLink } from '@/lib/auth';

/**
 * Deep link target of a magic link: pulso://auth/magic?token=…
 * Redeems the one-time token, then continues like any sign-in (index routes
 * to onboarding or today).
 */
export default function RedeemMagicLinkScreen() {
  const C = useColors();
  const { accent } = usePreferences();
  const insets = useSafeAreaInsets();
  const { refresh } = useSession();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // A token is single use: never redeem it twice, even if the effect re-runs.
    if (started.current) return;
    started.current = true;
    if (!token) return;
    (async () => {
      try {
        await redeemMagicLink(token);
        await refresh();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace('/' as any);
      } catch (e) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError(e instanceof AuthError ? e.userMessage : 'No pudimos abrir tu sesión. Pedí un enlace nuevo.');
      }
    })();
  }, [refresh, token]);

  const message = token ? error : 'El enlace está incompleto. Pedí uno nuevo.';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingHorizontal: 24, paddingTop: insets.top + 96, gap: 16 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 2.4, color: accent }}>PULSO · ACCESO</Text>
      {message ? (
        <>
          <Text accessibilityRole="header" style={{ fontFamily: F.grotesk, fontSize: 28, color: C.textPrimary }}>No pudimos entrar</Text>
          <Text accessibilityRole="alert" style={{ fontFamily: F.inter, fontSize: 15, lineHeight: 22, color: C.textSecondary }}>{message}</Text>
          <TouchableOpacity onPress={() => router.replace('/(auth)/enlace' as any)} activeOpacity={0.85} style={{ backgroundColor: accent, padding: 16, alignItems: 'center', marginTop: 8 }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: 12, letterSpacing: 0.8, color: C.onAccent }}>PEDIR OTRO ENLACE</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace('/(auth)/login' as any)} activeOpacity={0.7} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontFamily: F.inter, fontSize: 14, color: C.textSecondary }}>Ingresar con contraseña</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text accessibilityRole="header" style={{ fontFamily: F.grotesk, fontSize: 28, color: C.textPrimary }}>Abriendo tu sesión…</Text>
          <ActivityIndicator color={accent} style={{ alignSelf: 'flex-start' }} />
        </>
      )}
    </View>
  );
}
