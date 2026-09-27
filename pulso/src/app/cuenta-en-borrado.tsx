import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Label, PressableScale } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';
import { useApp } from '@/context/app-state';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import { cancelDeletion } from '@/lib/account';

/**
 * Shown when an athlete logs in while their account is scheduled for deletion:
 * they either get their account back or leave it to finish.
 */
export default function CuentaEnBorradoScreen() {
  const { purgeAfter } = useLocalSearchParams<{ purgeAfter?: string }>();
  const { signOut } = useSession();
  const { reloadAll } = useApp();
  const { accent } = usePreferences();
  const C = useColors();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const date = purgeAfter
    ? new Date(Number(purgeAfter)).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  async function restore() {
    setBusy(true);
    try {
      await cancelDeletion();
      await reloadAll();
      router.replace('/');
    } catch (e) {
      console.error('[account-restore]', e);
      Alert.alert('No pudimos cancelar el borrado', 'Revisá tu conexión e intentá de nuevo.');
      setBusy(false);
    }
  }

  function leave() {
    void signOut();
    router.replace('/(auth)/login' as never);
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20, paddingHorizontal: 20, justifyContent: 'space-between' }}>
      <View style={{ gap: 14 }}>
        <Label style={{ color: C.red }}>CUENTA EN BORRADO</Label>
        <Text accessibilityRole="header" style={{ fontFamily: F.grotesk, fontSize: 28, lineHeight: 32, color: C.textPrimary }}>
          Tu cuenta se borra{date ? ` el ${date}` : ' pronto'}.
        </Text>
        <Text style={{ fontFamily: F.inter, fontSize: 14, lineHeight: 21, color: C.textSecondary }}>
          Si cambiaste de idea, podés recuperarla ahora: vuelve tu vínculo con tu equipo y lo que estaba en el servidor. El historial que se borró de tu teléfono al pedir el borrado no se recupera.
        </Text>
      </View>
      <View style={{ gap: 10 }}>
        <PressableScale
          onPress={() => void restore()}
          disabled={busy}
          haptic="success"
          style={{ minHeight: 50, justifyContent: 'center', alignItems: 'center', backgroundColor: accent }}
        >
          <Text style={{ fontFamily: F.monoXBold, fontSize: 12, letterSpacing: 0.8, color: C.onAccent }}>
            {busy ? 'RECUPERANDO…' : 'CANCELAR EL BORRADO'}
          </Text>
        </PressableScale>
        <PressableScale
          onPress={leave}
          disabled={busy}
          style={{ minHeight: 50, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border }}
        >
          <Text style={{ fontFamily: F.monoBold, fontSize: 11, color: C.textPrimary }}>CERRAR SESIÓN</Text>
        </PressableScale>
      </View>
    </View>
  );
}
