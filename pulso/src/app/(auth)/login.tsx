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

import { C, F } from '@/constants/colors';
import { useSession } from '@/context/session';
import { signIn } from '@/lib/auth';

export default function LoginScreen() {
  const { refresh } = useSession();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleSignIn() {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      await signIn(email, password);
      await refresh();
      router.replace('/hoy' as any);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'error';
      setError(msg === 'invalid_credentials' ? 'Email o contraseña incorrectos' : 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 64, paddingBottom: 48 }}
    >
      {/* Brand */}
      <View style={{ marginBottom: 48 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 2.4, color: C.yellow, textTransform: 'uppercase', marginBottom: 10 }}>
          PULSO · APP DEL ATLETA
        </Text>
        <Text style={{ fontFamily: F.grotesk, fontSize: 34, color: C.textPrimary, letterSpacing: -0.5 }}>
          Bienvenido
        </Text>
        <Text style={{ fontFamily: F.inter, fontSize: 14, color: C.textSecondary, marginTop: 8 }}>
          Ingresá para ver tu plan de hoy
        </Text>
      </View>

      {/* Form */}
      <View style={{ gap: 12 }}>
        <View>
          <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1.4, color: C.textTertiary, textTransform: 'uppercase', marginBottom: 7 }}>
            EMAIL
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
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
          style={{ backgroundColor: C.yellow, padding: 16, alignItems: 'center', marginTop: 8, opacity: loading ? 0.7 : 1 }}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator color={C.bg} />
            : <Text style={{ fontFamily: F.monoBold, fontSize: 12, letterSpacing: 0.8, color: C.bg, textTransform: 'uppercase' }}>INGRESAR</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Switch to sign up */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 32, gap: 6 }}>
        <Text style={{ fontFamily: F.inter, fontSize: 14, color: C.textSecondary }}>¿Primera vez?</Text>
        <TouchableOpacity onPress={() => router.push('/(auth)/signup' as any)} activeOpacity={0.7}>
          <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.yellow }}>Crear cuenta</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
