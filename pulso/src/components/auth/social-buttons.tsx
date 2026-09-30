import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

import { F, useColors } from '@/constants/colors';
import { AuthError, signInWithIdToken } from '@/lib/auth';
import { appleSignInAvailable, getAppleIdToken, getGoogleIdToken, googleSignInConfigured, ProviderToken } from '@/lib/social-auth';

type Provider = 'google' | 'apple';

/**
 * "Continuar con Google / Apple". Shown only where the provider is configured
 * (Apple: iOS only). Cancelling is silent; any other failure is reported with
 * a message the athlete can act on.
 */
export function SocialButtons({ disabled, onSignedIn, onError }: {
  disabled?: boolean;
  onSignedIn: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const C = useColors();
  const [apple, setApple] = useState(false);
  const [busy, setBusy] = useState<Provider | null>(null);
  const google = googleSignInConfigured();

  useEffect(() => {
    let cancelled = false;
    appleSignInAvailable().then(available => { if (!cancelled) setApple(available); });
    return () => { cancelled = true; };
  }, []);

  if (!google && !apple) return null;

  async function run(provider: Provider) {
    if (busy) return;
    setBusy(provider);
    onError(null);
    try {
      const token: ProviderToken | null = provider === 'google' ? await getGoogleIdToken() : await getAppleIdToken();
      if (!token) return;
      await signInWithIdToken(provider, token);
      await onSignedIn();
    } catch (e) {
      const message = e instanceof AuthError ? e.userMessage : 'No pudimos completar la acción. Probá de nuevo.';
      if (message) onError(message);
    } finally {
      setBusy(null);
    }
  }

  const button = (provider: Provider, label: string, mark: string, style: { bg: string; fg: string; border: string }) => (
    <TouchableOpacity
      key={provider}
      onPress={() => void run(provider)}
      disabled={disabled || busy != null}
      accessibilityRole="button"
      accessibilityLabel={label}
      activeOpacity={0.8}
      style={{
        minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        backgroundColor: style.bg, borderWidth: 1, borderColor: style.border,
        opacity: disabled || (busy != null && busy !== provider) ? 0.5 : 1,
      }}
    >
      {busy === provider
        ? <ActivityIndicator color={style.fg} />
        : (
          <>
            <Text style={{ fontFamily: F.interSemi, fontSize: 17, color: style.fg }}>{mark}</Text>
            <Text style={{ fontFamily: F.interSemi, fontSize: 15, color: style.fg }}>{label}</Text>
          </>
        )}
    </TouchableOpacity>
  );

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 6 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
        <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1.4, color: C.textTertiary }}>O</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
      </View>
      {/* Apple's guidelines: black or white button with its mark, at least as prominent as the others. */}
      {apple && button('apple', 'Continuar con Apple', '', { bg: '#000000', fg: '#FFFFFF', border: '#FFFFFF' })}
      {google && button('google', 'Continuar con Google', 'G', { bg: '#FFFFFF', fg: '#1F1F1F', border: '#747775' })}
    </View>
  );
}
