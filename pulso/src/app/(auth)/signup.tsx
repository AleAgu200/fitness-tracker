import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PasswordInput } from '@/components/auth/password-input';
import { SocialButtons } from '@/components/auth/social-buttons';
import { BrandMark } from '@/components/brand-mark';
import { LightningBackground } from '@/components/ui/lightning-bg';
import { F, useColors, withAlpha } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import { startOnboarding } from '@/db/onboarding';
import { getLatestWeightMeasurement, saveAthleteProfile, saveInitialWeight } from '@/db/profile';
import { AuthError, getActiveSession, isUserExistsError, resendVerificationEmail, signIn, signUp } from '@/lib/auth';
import { openLegal } from '@/lib/legal';
import { getInitials } from '@/lib/names';
import { pushAthleteProfile } from '@/lib/profile-sync';

type Sexo = 'M' | 'F' | 'X';
const SEX_LABELS: Record<Sexo, string> = { M: 'HOMBRE', F: 'MUJER', X: 'OTRO' };

function SectionHeader({ label, accent }: { label: string; accent: string }) {
  const C = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 2, color: accent, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
    </View>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  const C = useColors();
  return (
    <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1.4, color: C.textTertiary, textTransform: 'uppercase', marginBottom: 7 }}>
      {children}
    </Text>
  );
}

export default function SignUpScreen() {
  const { refresh } = useSession();
  const { accent } = usePreferences();
  const C = useColors();
  const insets = useSafeAreaInsets();

  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [nombre, setNombre]         = useState('');
  const [sexo, setSexo]             = useState<Sexo | null>(null);
  const [dob, setDob]               = useState('');
  const [altura, setAltura]         = useState('');
  const [pesoActual, setPesoActual] = useState('');
  const [pesoMeta, setPesoMeta]     = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  // Set once the account exists but its email isn't confirmed yet. The form stays
  // in memory so the profile is saved as soon as the athlete can sign in.
  const [awaitingEmail, setAwaitingEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [resent, setResent] = useState(false);
  const checkingRef = useRef(false);

  function formatDob(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    if (digits.length > 4) {
      setDob(digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4));
    } else if (digits.length > 2) {
      setDob(digits.slice(0, 2) + '/' + digits.slice(2));
    } else {
      setDob(digits);
    }
  }

  async function handleSignUp() {
    if (!nombre.trim())      { setError('Ingresá tu nombre completo'); return; }
    if (!email.trim())       { setError('Ingresá tu email'); return; }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    if (password !== confirmacion) { setError('Las contraseñas no coinciden'); return; }

    setLoading(true);
    setError(null);

    try {
      await signUp(email, password, nombre.trim());
      await enterAndFinish();
    } catch (e: unknown) {
      if (isUserExistsError(e)) {
        Alert.alert(
          'Cuenta existente',
          `Ya hay una cuenta registrada con ${email.trim().toLowerCase()}. Iniciá sesión para continuar.`,
          [
            {
              text: 'IR A INICIAR SESIÓN',
              onPress: () => router.replace('/(auth)/login' as any),
            },
          ],
          { cancelable: false },
        );
      } else {
        // What was typed stays in the form so the athlete can fix and retry.
        setError(e instanceof AuthError ? e.userMessage : 'No pudimos crear la cuenta. Probá de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  }

  /**
   * Signs in with the new account and saves the profile from the form. While the
   * email is unconfirmed the server refuses the sign-in: show the waiting state
   * instead, and try again from there.
   */
  async function enterAndFinish(): Promise<boolean> {
    try {
      await signIn(email, password);
    } catch (signInError) {
      if (signInError instanceof AuthError && signInError.kind === 'email_not_verified') {
        setAwaitingEmail(email.trim().toLowerCase());
        return false;
      }
      throw signInError;
    }
    await finishSignUp();
    return true;
  }

  async function finishSignUp() {
    const session = await getActiveSession();
    if (!session?.userId) throw new Error('session_not_found');

    const heightNum = parseFloat(altura) || undefined;
    const pesoNum   = parseFloat(pesoActual) || undefined;
    const metaNum   = parseFloat(pesoMeta) || undefined;

    await saveAthleteProfile(session.userId, {
      fullName:     nombre.trim(),
      initials:     getInitials(nombre),
      sex:          sexo ?? undefined,
      dateOfBirth:  dob.trim() || undefined,
      heightCm:     heightNum,
      goalWeightKg: metaNum,
    });

    if (pesoNum) {
      await saveInitialWeight(session.userId, pesoNum);
    }

    // Authentication already succeeded, so keep signup offline-safe if this
    // opportunistic sync fails; startup sync will retry from local SQLite.
    try {
      const measurement = await getLatestWeightMeasurement(session.userId);
      await pushAthleteProfile({
        fullName: nombre.trim(),
        sex: sexo,
        dateOfBirth: dob.trim() || null,
        heightCm: heightNum ?? null,
        goalWeightKg: metaNum ?? null,
        measurement: measurement
          ? {
              id: measurement.id,
              measuredAt: measurement.measuredAt.getTime(),
              weightKg: measurement.weightKg,
            }
          : undefined,
      });
    } catch (syncError) {
      console.warn('[profile-sync] signup deferred', syncError);
    }

    await startOnboarding(session.userId);
    await refresh();
    router.replace('/' as any);
  }

  async function checkVerified(manual: boolean) {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    setError(null);
    try {
      const entered = await enterAndFinish();
      if (!entered && manual) setError('Todavía no está confirmado. Tocá el enlace del correo y volvé a intentar.');
    } catch (e) {
      setError(e instanceof AuthError ? e.userMessage : 'No pudimos entrar. Probá de nuevo.');
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      await resendVerificationEmail(email);
      setResent(true);
    } catch (e) {
      setError(e instanceof AuthError ? e.userMessage : 'No pudimos reenviar el correo. Probá de nuevo.');
    }
  }

  // Coming back from the mail app is the moment the link was most likely tapped.
  useEffect(() => {
    if (!awaitingEmail) return;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void checkVerified(false);
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingEmail]);

  const inputStyle = {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    padding: 14, color: C.textPrimary, fontFamily: F.inter, fontSize: 15,
  } as const;

  if (awaitingEmail) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <LightningBackground />
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 96, paddingBottom: insets.bottom + 48 }}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeInDown.duration(400)}>
            <View style={{ marginBottom: 14 }}><BrandMark height={36} /></View>
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 2.4, color: accent, textTransform: 'uppercase', marginBottom: 10 }}>
              CONFIRMÁ TU CORREO
            </Text>
            <Text style={{ fontFamily: F.grotesk, fontSize: 30, color: C.textPrimary, letterSpacing: -0.5 }}>
              Revisá tu correo
            </Text>
            <Text style={{ fontFamily: F.inter, fontSize: 15, lineHeight: 22, color: C.textSecondary, marginTop: 12 }}>
              {'Te enviamos un enlace a '}
              <Text style={{ fontFamily: F.interSemi, color: C.textPrimary }}>{awaitingEmail}</Text>
              {'. Tocalo para confirmar tu cuenta y volvé a PULSO: entrás solo. Si no lo ves, revisá spam.'}
            </Text>
          </Animated.View>

          {error && (
            <View style={{ backgroundColor: 'rgba(255,61,90,0.1)', borderWidth: 1, borderColor: C.red, padding: 12, marginTop: 24 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.red }}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            onPress={() => void checkVerified(true)}
            disabled={checking}
            style={{ backgroundColor: accent, padding: 16, alignItems: 'center', marginTop: 28, opacity: checking ? 0.7 : 1 }}
            activeOpacity={0.8}
          >
            {checking
              ? <ActivityIndicator color={C.onAccent} />
              : <Text style={{ fontFamily: F.monoBold, fontSize: 12, letterSpacing: 0.8, color: C.onAccent }}>YA LO CONFIRMÉ</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => void resend()} disabled={resent} activeOpacity={0.7} style={{ alignItems: 'center', paddingVertical: 14, marginTop: 6 }}>
            <Text style={{ fontFamily: F.inter, fontSize: 14, color: resent ? C.textTertiary : C.textSecondary }}>
              {resent ? 'Te enviamos otro enlace' : 'Reenviar el correo'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { setAwaitingEmail(null); setResent(false); setError(null); }}
            activeOpacity={0.7}
            style={{ alignItems: 'center', paddingVertical: 10 }}
          >
            <Text style={{ fontFamily: F.inter, fontSize: 14, color: C.textTertiary }}>Me equivoqué de correo</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
    <LightningBackground />
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 64, paddingBottom: insets.bottom + 48 }}
    >
      {/* Brand */}
      <Animated.View entering={FadeInDown.duration(400)} style={{ marginBottom: 40 }}>
        <View style={{ marginBottom: 14 }}><BrandMark height={36} /></View>
        <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 2.4, color: accent, textTransform: 'uppercase', marginBottom: 10 }}>
          PULSO · APP DEL ATLETA
        </Text>
        <Text style={{ fontFamily: F.grotesk, fontSize: 34, color: C.textPrimary, letterSpacing: -0.5 }}>
          Crear cuenta
        </Text>
        <Text style={{ fontFamily: F.inter, fontSize: 14, color: C.textSecondary, marginTop: 8 }}>
          Completá tu perfil para empezar
        </Text>
      </Animated.View>

      {/* ── CUENTA ── */}
      <SectionHeader label="CUENTA" accent={accent} />
      <View style={{ gap: 12, marginBottom: 32 }}>
        <View>
          <FieldLabel>EMAIL</FieldLabel>
          <TextInput
            value={email} onChangeText={setEmail}
            autoCapitalize="none" keyboardType="email-address" autoComplete="email"
            placeholderTextColor={C.textTertiary} placeholder="tu@email.com"
            style={inputStyle}
          />
        </View>
        <View>
          <FieldLabel>CONTRASEÑA</FieldLabel>
          <PasswordInput
            value={password} onChangeText={setPassword}
            autoComplete="new-password" placeholder="Mínimo 6 caracteres"
          />
        </View>
        <View>
          <FieldLabel>CONFIRMAR CONTRASEÑA</FieldLabel>
          <PasswordInput
            value={confirmacion} onChangeText={setConfirmacion}
            autoComplete="new-password" placeholder="Repetí la contraseña"
          />
          {confirmacion.length > 0 && confirmacion !== password && (
            <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.red, marginTop: 6 }}>Las contraseñas no coinciden</Text>
          )}
        </View>
      </View>

      {/* ── PERFIL ── */}
      <SectionHeader label="TU PERFIL" accent={accent} />
      <View style={{ gap: 12, marginBottom: 32 }}>
        <View>
          <FieldLabel>NOMBRE COMPLETO</FieldLabel>
          <TextInput
            value={nombre} onChangeText={setNombre}
            autoCapitalize="words" autoComplete="name"
            placeholderTextColor={C.textTertiary} placeholder="Kevin Lozano"
            style={inputStyle}
          />
        </View>

        <View>
          <FieldLabel>SEXO</FieldLabel>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['M', 'F', 'X'] as Sexo[]).map(s => {
              const sel = sexo === s;
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => setSexo(sel ? null : s)}
                  style={{
                    flex: 1, padding: 13, borderWidth: 1,
                    borderColor: sel ? accent : C.border,
                    backgroundColor: sel ? withAlpha(accent, 0.13) : C.card,
                    alignItems: 'center',
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 0.4, color: sel ? accent : C.textSecondary }}>
                    {SEX_LABELS[s]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View>
          <FieldLabel>FECHA DE NACIMIENTO</FieldLabel>
          <TextInput
            value={dob} onChangeText={formatDob}
            keyboardType="numeric" maxLength={10}
            placeholderTextColor={C.textTertiary} placeholder="DD/MM/AAAA"
            style={inputStyle}
          />
        </View>
      </View>

      {/* ── CUERPO ── */}
      <SectionHeader label="TU CUERPO" accent={accent} />
      <View style={{ gap: 12, marginBottom: 36 }}>
        <View>
          <FieldLabel>ALTURA (cm)</FieldLabel>
          <TextInput
            value={altura} onChangeText={setAltura}
            keyboardType="numeric"
            placeholderTextColor={C.textTertiary} placeholder="170"
            style={inputStyle}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <FieldLabel>PESO ACTUAL (kg)</FieldLabel>
            <TextInput
              value={pesoActual} onChangeText={setPesoActual}
              keyboardType="decimal-pad"
              placeholderTextColor={C.textTertiary} placeholder="84.0"
              style={inputStyle}
            />
          </View>
          <View style={{ flex: 1 }}>
            <FieldLabel>PESO META (kg)</FieldLabel>
            <TextInput
              value={pesoMeta} onChangeText={setPesoMeta}
              keyboardType="decimal-pad"
              placeholderTextColor={C.textTertiary} placeholder="78.0"
              style={inputStyle}
            />
          </View>
        </View>
      </View>

      {error && (
        <View style={{ backgroundColor: 'rgba(255,61,90,0.1)', borderWidth: 1, borderColor: C.red, padding: 12, marginBottom: 16 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.red }}>{error}</Text>
        </View>
      )}

      <TouchableOpacity
        onPress={handleSignUp}
        disabled={loading}
        style={{ backgroundColor: accent, padding: 16, alignItems: 'center', opacity: loading ? 0.7 : 1 }}
        activeOpacity={0.8}
      >
        {loading
          ? <ActivityIndicator color={C.onAccent} />
          : <Text style={{ fontFamily: F.monoBold, fontSize: 12, letterSpacing: 0.8, color: C.onAccent, textTransform: 'uppercase' }}>CREAR CUENTA</Text>
        }
      </TouchableOpacity>

      <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textTertiary, textAlign: 'center', marginTop: 10 }}>
        {'Al crear tu cuenta aceptás los '}
        <Text accessibilityRole="link" onPress={() => openLegal('terms')} style={{ color: C.textSecondary, textDecorationLine: 'underline' }}>Términos</Text>
        {' y la '}
        <Text accessibilityRole="link" onPress={() => openLegal('privacy')} style={{ color: C.textSecondary, textDecorationLine: 'underline' }}>Política de privacidad</Text>
        {'. PULSO es para mayores de 18 años y no reemplaza el consejo médico.'}
      </Text>

      <View style={{ marginTop: 10 }}>
        <SocialButtons
          disabled={loading}
          onError={setError}
          onSignedIn={async () => {
            // A new social account has no profile yet: the start gate sends it
            // to onboarding, which asks for the same data as this form.
            await refresh();
            router.replace('/' as any);
          }}
        />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 28, gap: 6 }}>
        <Text style={{ fontFamily: F.inter, fontSize: 14, color: C.textSecondary }}>¿Ya tenés cuenta?</Text>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: accent }}>Ingresar</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
    </View>
  );
}
