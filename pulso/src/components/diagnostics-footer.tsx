import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';
import { crashReportingEnabled, sendTestError, triggerNativeTestCrash } from '@/lib/crash-reporting';

const TAPS_TO_UNLOCK = 7;

/**
 * App version, plus a hidden diagnostics panel (tap the version 7 times) used
 * to verify crash reporting in a distribution build: one handled JS error and
 * one native crash, both with fixed, non-sensitive content.
 */
export function DiagnosticsFooter() {
  const C = useColors();
  const [taps, setTaps] = useState(0);
  const unlocked = taps >= TAPS_TO_UNLOCK;
  const version = Constants.expoConfig?.version ?? '—';

  function confirmNativeCrash() {
    Alert.alert('Cierre de prueba', 'La app se va a cerrar para enviar un reporte nativo. Volvé a abrirla para que se envíe.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar la app', style: 'destructive', onPress: triggerNativeTestCrash },
    ]);
  }

  const buttonStyle = { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border, backgroundColor: C.card } as const;

  return (
    <View style={{ marginTop: 24, alignItems: 'center', gap: 10 }}>
      <Pressable onPress={() => setTaps(count => count + 1)} accessibilityRole="text" hitSlop={8}>
        <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1, color: C.textTertiary }}>PULSO {version}</Text>
      </Pressable>
      {unlocked && (
        <View style={{ alignSelf: 'stretch', gap: 8 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1, color: C.textSecondary, textAlign: 'center' }}>
            DIAGNÓSTICO · REPORTES {crashReportingEnabled() ? 'ACTIVOS' : 'APAGADOS'}
          </Text>
          {crashReportingEnabled() && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PressableScale
                containerStyle={{ flex: 1 }}
                style={buttonStyle}
                onPress={() => { sendTestError(); Alert.alert('Enviado', 'Se envió un error de prueba.'); }}
              >
                <Text style={{ fontFamily: F.monoBold, fontSize: 10, color: C.textPrimary }}>ERROR JS</Text>
              </PressableScale>
              <PressableScale containerStyle={{ flex: 1 }} style={buttonStyle} onPress={confirmNativeCrash}>
                <Text style={{ fontFamily: F.monoBold, fontSize: 10, color: C.red }}>CIERRE NATIVO</Text>
              </PressableScale>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
