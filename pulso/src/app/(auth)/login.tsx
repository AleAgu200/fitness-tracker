import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { LightningBackground, LightningHandle } from '@/components/ui/lightning-bg';
import { C, F } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import { signIn } from '@/lib/auth';

export default function LoginScreen() {
  const { refresh } = useSession();
  const { accent } = usePreferences();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const lightningRef = useRef<LightningHandle>(null);
  const wasArmed = useRef(false);
  const charge = useSharedValue(1);   // 0..1 capacitor fullness — 1 (bright, resting) when idle
  const flicker = useSharedValue(1);  // 1 = steady, oscillates once fully charged
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    cancelAnimation(charge);
    cancelAnimation(flicker);
  }, [charge, flicker]);

  // Escalate the storm as the form goes from empty to ready — armed once both fields have content.
  useEffect(() => {
    const armed = email.trim().length > 0 && password.length > 0;
    if (armed && !wasArmed.current) {
      lightningRef.current?.pulse(accent, 0.6);
    }
    wasArmed.current = armed;
  }, [email, password]);

  function handleFieldFocus() {
    lightningRef.current?.pulse(C.cyan, 0.4);
  }

  async function handleSignIn() {
    if (!email.trim() || !password) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      lightningRef.current?.pulse(C.textTertiary, 0.25);
      return;
    }
    setLoading(true);
    setError(null);

    // Discharge then climb back up like a capacitor while the request is in flight,
    // syncing the storm to the same tension. Capped below full so it never lies about completion.
    charge.value = withTiming(0.35, { duration: 160, easing: Easing.in(Easing.cubic) }, (dipped) => {
      if (!dipped) return;
      charge.value = withTiming(0.92, { duration: 740, easing: Easing.out(Easing.cubic) }, (climbed) => {
        if (!climbed) return;
        flicker.value = withRepeat(
          withSequence(
            withTiming(0.75, { duration: 220, easing: Easing.inOut(Easing.sin) }),
            withTiming(1,    { duration: 220, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
        );
      });
    });
    timers.current.push(setTimeout(() => lightningRef.current?.pulse(accent, 0.7), 280));
    timers.current.push(setTimeout(() => lightningRef.current?.pulse(C.cyan, 0.55), 620));

    try {
      await signIn(email, password);
      await refresh();

      cancelAnimation(flicker);
      flicker.value = 1;
      charge.value = withTiming(1, { duration: 120 });
      lightningRef.current?.flashAll(accent, 300);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      timers.current.push(setTimeout(() => router.replace('/hoy' as any), 260));
    } catch (e: unknown) {
      cancelAnimation(flicker);
      flicker.value = 1;
      charge.value = withTiming(1, { duration: 260 });
      lightningRef.current?.pulse(C.red, 0.6);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      const msg = e instanceof Error ? e.message : 'error';
      setError(msg === 'invalid_credentials' ? 'Email o contraseña incorrectos' : 'Error al iniciar sesión');
      setLoading(false);
    }
  }

  // Dark "uncharged" mask over a bright button — it recedes from the right as charge builds,
  // so full charge reads as a fully lit capacitor rather than a spinner.
  const drainStyle = useAnimatedStyle(() => ({
    width: `${(1 - charge.value) * 100}%`,
    opacity: 0.4 * flicker.value,
  }));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
    <LightningBackground ref={lightningRef} />
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 64, paddingBottom: 48 }}
    >
      {/* Brand */}
      <Animated.View entering={FadeInDown.duration(400)} style={{ marginBottom: 48 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 2.4, color: accent, textTransform: 'uppercase', marginBottom: 10 }}>
          PULSO · APP DEL ATLETA
        </Text>
        <Text style={{ fontFamily: F.grotesk, fontSize: 34, color: C.textPrimary, letterSpacing: -0.5 }}>
          Bienvenido
        </Text>
        <Text style={{ fontFamily: F.inter, fontSize: 14, color: C.textSecondary, marginTop: 8 }}>
          Ingresá para ver tu plan de hoy
        </Text>
      </Animated.View>

      {/* Form */}
      <Animated.View entering={FadeInDown.duration(400).delay(120)} style={{ gap: 12 }}>
        <View>
          <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1.4, color: C.textTertiary, textTransform: 'uppercase', marginBottom: 7 }}>
            EMAIL
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            onFocus={handleFieldFocus}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholderTextColor={C.textTertiary}
            placeholder="kevin@example.com"
            style={{
              backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
              padding: 14, color: C.textPrimary, fontFamily: F.inter, fontSize: 15,
            }}
          />
        </View>

        <View>
          <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1.4, color: C.textTertiary, textTransform: 'uppercase', marginBottom: 7 }}>
            CONTRASEÑA
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            onFocus={handleFieldFocus}
            secureTextEntry
            autoComplete="password"
            placeholderTextColor={C.textTertiary}
            placeholder="••••••••"
            style={{
              backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
              padding: 14, color: C.textPrimary, fontFamily: F.inter, fontSize: 15,
            }}
          />
        </View>

        {error && (
          <View style={{ backgroundColor: 'rgba(255,61,90,0.1)', borderWidth: 1, borderColor: C.red, padding: 12 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.red }}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          onPress={handleSignIn}
          disabled={loading}
          style={{ backgroundColor: accent, marginTop: 8, overflow: 'hidden' }}
          activeOpacity={0.85}
        >
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, backgroundColor: C.bg }, drainStyle]} />
          <View style={{ padding: 16, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: 12, letterSpacing: 0.8, color: C.bg, textTransform: 'uppercase' }}>
              {loading ? 'INGRESANDO…' : 'INGRESAR'}
            </Text>
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* Switch to sign up */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 32, gap: 6 }}>
        <Text style={{ fontFamily: F.inter, fontSize: 14, color: C.textSecondary }}>¿Primera vez?</Text>
        <TouchableOpacity onPress={() => router.push('/(auth)/signup' as any)} activeOpacity={0.7}>
          <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: accent }}>Crear cuenta</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
    </View>
  );
}
