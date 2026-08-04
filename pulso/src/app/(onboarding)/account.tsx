import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { WizardShell } from '@/components/onboarding/wizard-shell';
import { Card } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import { setOnboardingStep, startOnboarding } from '@/db/onboarding';

const HIGHLIGHTS = [
  {
    number: '01',
    title: 'Un plan hecho para vos',
    body: 'Vamos a adaptar entrenamientos y comidas a tu objetivo, experiencia y rutina.',
  },
  {
    number: '02',
    title: 'Tus límites primero',
    body: 'Lesiones, alergias y condiciones de salud se consideran antes de generar cualquier recomendación.',
  },
  {
    number: '03',
    title: 'Vos tenés el control',
    body: 'Podrás revisar el resultado antes de aplicarlo y editarlo después cuando lo necesités.',
  },
];

export default function OnboardingAccountScreen() {
  const { userId } = useSession();
  const { accent } = usePreferences();
  const C = useColors();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!userId) return () => { active = false; };

    startOnboarding(userId)
      .then(() => {
        if (active) setReady(true);
      })
      .catch(() => {
        if (active) {
          setError('No pudimos iniciar la configuración. Intentá de nuevo.');
          setReady(true);
        }
      });

    return () => { active = false; };
  }, [userId]);

  const shownError = error ?? (!userId ? 'No encontramos una sesión activa. Volvé a iniciar sesión.' : null);

  async function continueToBody() {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      await setOnboardingStep(userId, 'account');
      router.push('/(onboarding)/body' as never);
    } catch {
      setError('No pudimos guardar tu avance. Intentá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <WizardShell
      stepIndex={1}
      title="Armemos tu punto de partida"
      subtitle="Son siete pasos cortos. Tus respuestas quedan guardadas en este dispositivo hasta que decidas generar el plan."
      onNext={continueToBody}
      canProceed={ready && Boolean(userId)}
      nextLabel="EMPEZAR"
      busy={busy}
    >
      <View style={{ gap: 10 }}>
        {HIGHLIGHTS.map((item, index) => (
          <Card key={item.number} index={index} style={{ padding: 16 }}>
            <View style={{ flexDirection: 'row', gap: 13 }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: accent,
                  backgroundColor: withAlpha(accent, 0.1),
                }}
              >
                <Text style={{ fontFamily: F.monoBold, fontSize: 10, color: accent }}>{item.number}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.interSemi, fontSize: 15, color: C.textPrimary, marginBottom: 5 }}>
                  {item.title}
                </Text>
                <Text style={{ fontFamily: F.inter, fontSize: 13, lineHeight: 19, color: C.textSecondary }}>
                  {item.body}
                </Text>
              </View>
            </View>
          </Card>
        ))}
      </View>

      <View
        style={{
          marginTop: 16,
          padding: 13,
          borderWidth: 1,
          borderColor: C.border,
          backgroundColor: C.bgEl,
        }}
      >
        <Text style={{ fontFamily: F.mono, fontSize: 10, lineHeight: 16, color: C.textTertiary }}>
          PULSO NO REEMPLAZA LA EVALUACIÓN DE UN PROFESIONAL DE SALUD. SI UNA RESPUESTA REQUIERE REVISIÓN, TE LO DIREMOS.
        </Text>
      </View>

      {shownError ? (
        <View style={{ marginTop: 14, padding: 12, borderWidth: 1, borderColor: C.red, backgroundColor: withAlpha(C.red, 0.08) }}>
          <Text style={{ fontFamily: F.interMed, fontSize: 12, lineHeight: 18, color: C.red }}>{shownError}</Text>
        </View>
      ) : null}
    </WizardShell>
  );
}
