import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { SectionHeader } from '@/components/onboarding/section-header';
import { WizardShell } from '@/components/onboarding/wizard-shell';
import { PressableScale } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import {
  getGenerationProfile,
  setGenerationConsent,
  setOnboardingStep,
} from '@/db/onboarding';

export default function OnboardingSafetyScreen() {
  const { userId } = useSession();
  const { accent } = usePreferences();
  const C = useColors();

  const [consent, setConsent] = useState(false);
  const [consentSaving, setConsentSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!userId) return () => { active = false; };

    Promise.all([
      setOnboardingStep(userId, 'safety'),
      getGenerationProfile(userId),
    ])
      .then(([, draft]) => {
        if (!active) return;
        setConsent(draft?.consentedToExternalProcessing ?? false);
        setLoaded(true);
      })
      .catch(() => {
        if (active) {
          setError('No pudimos cargar tus respuestas guardadas.');
          setLoaded(true);
        }
      });

    return () => { active = false; };
  }, [userId]);

  const shownError = error ?? (!userId ? 'No encontramos una sesión activa.' : null);

  async function toggleConsent() {
    if (!userId || consentSaving) return;
    const next = !consent;
    setConsent(next);
    setConsentSaving(true);
    setError(null);
    try {
      await setGenerationConsent(userId, next);
    } catch {
      setConsent(!next);
      setError('No pudimos guardar tu consentimiento. Intentá de nuevo.');
    } finally {
      setConsentSaving(false);
    }
  }

  async function saveAndContinue() {
    if (!userId || saving || !consent) return;
    setSaving(true);
    setError(null);
    try {
      await setGenerationConsent(userId, true);
      router.push('/(onboarding)/review' as never);
    } catch {
      setError('No pudimos guardar esta información. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <WizardShell
      stepIndex={6}
      title="Listo para crear tu plan"
      subtitle="Solo falta autorizar el uso de tus respuestas para que la IA prepare una rutina y un plan de comidas personalizados."
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/(onboarding)/nutrition' as never))}
      onNext={saveAndContinue}
      canProceed={loaded && consent && !consentSaving && Boolean(userId)}
      busy={saving}
    >
      {!loaded && userId ? (
        <View style={{ paddingVertical: 36, alignItems: 'center' }}>
          <ActivityIndicator color={accent} />
        </View>
      ) : loaded ? (
        <>
          <SectionHeader label="PERMISO PARA CREAR TU PLAN" />
          <PressableScale
            onPress={toggleConsent}
            disabled={consentSaving}
            haptic="medium"
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
              padding: 15,
              borderWidth: 1,
              borderColor: consent ? accent : C.border,
              backgroundColor: consent ? withAlpha(accent, 0.08) : C.card,
            }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: consent ? accent : C.textTertiary,
                backgroundColor: consent ? accent : C.bgEl,
              }}
            >
              <Text style={{ fontFamily: F.monoBold, fontSize: 13, color: consent ? C.bg : C.textTertiary }}>
                {consent ? '✓' : ''}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.interSemi, fontSize: 13, lineHeight: 18, color: C.textPrimary, marginBottom: 5 }}>
                Autorizo el procesamiento externo para generar mi plan
              </Text>
              <Text style={{ fontFamily: F.inter, fontSize: 11, lineHeight: 17, color: C.textSecondary }}>
                Al continuar, un resumen de tus objetivos y preferencias se enviará al servicio de generación de PULSO. El borrador local se elimina después de aceptar o abandonar el plan.
              </Text>
            </View>
          </PressableScale>
        </>
      ) : null}

      {shownError ? (
        <View style={{ marginTop: 16, padding: 12, borderWidth: 1, borderColor: C.red, backgroundColor: withAlpha(C.red, 0.08) }}>
          <Text style={{ fontFamily: F.interMed, fontSize: 12, lineHeight: 18, color: C.red }}>{shownError}</Text>
        </View>
      ) : null}
    </WizardShell>
  );
}
