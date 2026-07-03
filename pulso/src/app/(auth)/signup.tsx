import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, F } from '@/constants/colors';
import { useSession } from '@/context/session';
import { saveAthleteProfile, saveInitialWeight } from '@/db/profile';
import { getActiveSession, signIn, signUp } from '@/lib/auth';

type Sexo = 'M' | 'F' | 'X';
const SEX_LABELS: Record<Sexo, string> = { M: 'HOMBRE', F: 'MUJER', X: 'OTRO' };

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function SectionHeader({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 2, color: C.yellow, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
    </View>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1.4, color: C.textTertiary, textTransform: 'uppercase', marginBottom: 7 }}>
      {children}
    </Text>
  );
}

export default function SignUpScreen() {
  const { refresh } = useSession();
  const insets = useSafeAreaInsets();

  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [nombre, setNombre]         = useState('');
  const [sexo, setSexo]             = useState<Sexo | null>(null);
  const [dob, setDob]               = useState('');
  const [altura, setAltura]         = useState('');
  const [pesoActual, setPesoActual] = useState('');
  const [pesoMeta, setPesoMeta]     = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

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

    setLoading(true);
    setError(null);

    try {
      await signUp(email, password, nombre.trim());
      await signIn(email, password);

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

      await refresh();
      router.replace('/hoy' as any);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('UNIQUE') || msg.includes('unique')) {
        setError('Ese email ya está registrado');
      } else {
        setError('Error al crear la cuenta. Intentá de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    padding: 14, color: C.textPrimary, fontFamily: F.inter, fontSize: 15,
  } as const;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 64, paddingBottom: insets.bottom + 48 }}
    >
      {/* Brand */}
      <View style={{ marginBottom: 40 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 2.4, color: C.yellow, textTransform: 'uppercase', marginBottom: 10 }}>
          PULSO · APP DEL ATLETA
        </Text>
        <Text style={{ fontFamily: F.grotesk, fontSize: 34, color: C.textPrimary, letterSpacing: -0.5 }}>
          Crear cuenta
        </Text>
        <Text style={{ fontFamily: F.inter, fontSize: 14, color: C.textSecondary, marginTop: 8 }}>
          Completá tu perfil para empezar
        </Text>
      </View>

      {/* ── CUENTA ── */}
      <SectionHeader label="CUENTA" />
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
          <TextInput
            value={password} onChangeText={setPassword}
            secureTextEntry autoComplete="new-password"
            placeholderTextColor={C.textTertiary} placeholder="Mínimo 6 caracteres"
            style={inputStyle}
          />
        </View>
      </View>

      {/* ── PERFIL ── */}
      <SectionHeader label="TU PERFIL" />
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
                    borderColor: sel ? C.yellow : C.border,
                    backgroundColor: sel ? `${C.yellow}22` : C.card,
                    alignItems: 'center',
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 0.4, color: sel ? C.yellow : C.textSecondary }}>
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
      <SectionHeader label="TU CUERPO" />
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
        style={{ backgroundColor: C.yellow, padding: 16, alignItems: 'center', opacity: loading ? 0.7 : 1 }}
        activeOpacity={0.8}
      >
        {loading
          ? <ActivityIndicator color={C.bg} />
          : <Text style={{ fontFamily: F.monoBold, fontSize: 12, letterSpacing: 0.8, color: C.bg, textTransform: 'uppercase' }}>CREAR CUENTA</Text>
        }
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 28, gap: 6 }}>
        <Text style={{ fontFamily: F.inter, fontSize: 14, color: C.textSecondary }}>¿Ya tenés cuenta?</Text>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.yellow }}>Ingresar</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
