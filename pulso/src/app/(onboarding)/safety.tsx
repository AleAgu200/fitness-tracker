import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { FieldLabel, SectionHeader } from '@/components/onboarding/section-header';
import { WizardShell } from '@/components/onboarding/wizard-shell';
import { ChipSelect } from '@/components/ui/chip-select';
import { PressableScale } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import {
  getGenerationProfile,
  saveGenerationProfileDraft,
  setGenerationConsent,
  setOnboardingStep,
} from '@/db/onboarding';

const YES_NO_OPTIONS = [
  { label: 'No', value: 'no' },
  { label: 'Sí', value: 'yes' },
];

function BooleanQuestion({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (next: boolean) => void;
}) {
  return (
    <View>
      <FieldLabel>{label}</FieldLabel>
      <ChipSelect
        options={YES_NO_OPTIONS}
        selected={value == null ? '' : value ? 'yes' : 'no'}
        onChange={next => onChange(next === 'yes')}
      />
    </View>
  );
}

export default function OnboardingSafetyScreen() {
  const { userId } = useSession();
  const { accent } = usePreferences();
  const C = useColors();

  const [pregnant, setPregnant] = useState<boolean | null>(null);
  const [eatingDisorder, setEatingDisorder] = useState<boolean | null>(null);
  const [medicalCondition, setMedicalCondition] = useState<boolean | null>(null);
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
        setPregnant(draft?.isPregnantOrBreastfeeding ?? null);
        setEatingDisorder(draft?.hasEatingDisorderHistory ?? null);
        setMedicalCondition(draft?.hasUncontrolledMedicalCondition ?? null);
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
    if (!userId || saving || pregnant == null || eatingDisorder == null || medicalCondition == null || !consent) return;
    setSaving(true);
    setError(null);
    try {
      await saveGenerationProfileDraft(userId, {
        isPregnantOrBreastfeeding: pregnant,
        hasEatingDisorderHistory: eatingDisorder,
        hasUncontrolledMedicalCondition: medicalCondition,
      });
      await setGenerationConsent(userId, true);
      router.push('/(onboarding)/review' as never);
    } catch {
      setError('No pudimos guardar esta información. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  const answered = pregnant != null && eatingDisorder != null && medicalCondition != null;

  return (
    <WizardShell
      stepIndex={6}
      title="Tu seguridad va primero"
      subtitle="Estas respuestas solo determinan si el plan puede generarse automáticamente o necesita revisión profesional."
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/(onboarding)/nutrition' as never))}
      onNext={saveAndContinue}
      canProceed={loaded && answered && consent && !consentSaving && Boolean(userId)}
      busy={saving}
    >
      {!loaded && userId ? (
        <View style={{ paddingVertical: 36, alignItems: 'center' }}>
          <ActivityIndicator color={accent} />
        </View>
      ) : loaded ? (
        <>
          <SectionHeader label="REVISIÓN DE SEGURIDAD" />
          <View style={{ gap: 18 }}>
            <BooleanQuestion
              label="¿ESTÁS EN EMBARAZO O LACTANCIA?"
              value={pregnant}
              onChange={setPregnant}
            />
            <BooleanQuestion
              label="¿TENÉS ANTECEDENTES DE UN TRASTORNO DE LA CONDUCTA ALIMENTARIA?"
              value={eatingDisorder}
              onChange={setEatingDisorder}
            />
            <BooleanQuestion
              label="¿TENÉS ALGUNA CONDICIÓN MÉDICA NO CONTROLADA?"
              value={medicalCondition}
              onChange={setMedicalCondition}
            />
          </View>

          <View
            style={{
              marginTop: 22,
              padding: 14,
              borderWidth: 1,
              borderColor: C.orange,
              backgroundColor: withAlpha(C.orange, 0.07),
            }}
          >
            <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary, marginBottom: 5 }}>
              Una respuesta afirmativa no te bloquea
            </Text>
            <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textSecondary }}>
              PULSO detendrá la generación automática y te recomendará revisión profesional. Podrás continuar usando la app.
            </Text>
          </View>

          <View style={{ height: 28 }} />
          <SectionHeader label="CONSENTIMIENTO" />
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
                Al continuar, los datos resumidos de este cuestionario se enviarán al servicio de generación de PULSO. El borrador local se elimina después de aceptar o abandonar el plan.
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
