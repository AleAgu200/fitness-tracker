import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { F, useColors } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { AuthError, requestPasswordReset } from '@/lib/auth';

/**
 * Asks for a recovery link. The confirmation is the same whether or not the
 * address has an account. The link opens a web page, so it works from any
 * device; the new password is then used here to sign in.
 */
export default function RecoverPasswordScreen() {
  const C = useColors();
  const { accent } = usePreferences();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit() {
    const clean = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(clean)) {
      setError('Escribí el correo con el que creaste la cuenta.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await requestPasswordReset(clean);
      setSentTo(clean);
    } catch (e) {
      setError(e instanceof AuthError ? e.userMessage : 'No pudimos enviar el enlace. Probá de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: insets.top + 48, paddingBottom: insets.bottom + 48 }}
    >
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Volver" style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: 16 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.textSecondary }}>← VOLVER</Text>
      </TouchableOpacity>

      <Animated.View entering={FadeInDown.duration(300)} style={{ marginBottom: 28 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 2.4, color: accent, marginBottom: 10 }}>PULSO · CUENTA</Text>
        <Text accessibilityRole="header" style={{ fontFamily: F.grotesk, fontSize: 30, color: C.textPrimary, letterSpacing: -0.5 }}>Recuperar contraseña</Text>
        <Text style={{ fontFamily: F.inter, fontSize: 14, lineHeight: 20, color: C.textSecondary, marginTop: 8 }}>
          Te mandamos un enlace para elegir una nueva. Sirve una vez y vence en una hora.
        </Text>
      </Animated.View>

      {sentTo ? (
        <Animated.View entering={FadeIn.duration(200)} accessibilityLiveRegion="polite" style={{ borderWidth: 1, borderColor: accent, padding: 16, gap: 14 }}>
          <Text style={{ fontFamily: F.inter, fontSize: 14, lineHeight: 21, color: C.textPrimary }}>
            {`Si hay una cuenta PULSO con ${sentTo}, ya te llegó un correo con el enlace. Revisá también la carpeta de spam.`}
          </Text>
          <Text style={{ fontFamily: F.inter, fontSize: 13, lineHeight: 19, color: C.textSecondary }}>
            Si entrás con Google o Apple, no tenés contraseña en PULSO: usá ese botón para ingresar.
          </Text>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.85} style={{ backgroundColor: accent, padding: 16, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: 12, letterSpacing: 0.8, color: C.onAccent }}>VOLVER A INGRESAR</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <View style={{ gap: 12 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1.4, color: C.textTertiary }}>EMAIL</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="tu@email.com"
            placeholderTextColor={C.textTertiary}
            accessibilityLabel="Correo de tu cuenta"
            style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 14, color: C.textPrimary, fontFamily: F.inter, fontSize: 15 }}
          />
          {error && (
            <View accessibilityRole="alert" style={{ backgroundColor: 'rgba(255,61,90,0.1)', borderWidth: 1, borderColor: C.red, padding: 12 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 11, lineHeight: 16, color: C.red }}>{error}</Text>
            </View>
          )}
          <TouchableOpacity onPress={() => void submit()} disabled={loading} activeOpacity={0.85} style={{ backgroundColor: accent, padding: 16, alignItems: 'center', marginTop: 4, opacity: loading ? 0.7 : 1 }}>
            {loading
              ? <ActivityIndicator color={C.onAccent} />
              : <Text style={{ fontFamily: F.monoBold, fontSize: 12, letterSpacing: 0.8, color: C.onAccent }}>ENVIAR ENLACE</Text>}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}
