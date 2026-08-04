import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

import { FieldLabel, SectionHeader, useInputStyle } from '@/components/onboarding/section-header';
import { WizardShell } from '@/components/onboarding/wizard-shell';
import { ChipSelect } from '@/components/ui/chip-select';
import { F, useColors, withAlpha } from '@/constants/colors';
import { useApp } from '@/context/app-state';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import { setOnboardingStep } from '@/db/onboarding';
import { getAthleteProfile, getLatestWeight, saveInitialWeight } from '@/db/profile';
import { displayWeight, toKg } from '@/lib/units';

type Sex = 'M' | 'F' | 'X';

const SEX_OPTIONS = [
  { label: 'Hombre', value: 'M' },
  { label: 'Mujer', value: 'F' },
  { label: 'Otro', value: 'X' },
];

function formatDob(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length > 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
}

function displayDob(value: string | null): string {
  if (!value) return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return formatDob(value);
}

function parseDob(value: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) return null;
  return parsed;
}

function ageOn(dateOfBirth: Date, today = new Date()): number {
  let age = today.getFullYear() - dateOfBirth.getFullYear();
  const beforeBirthday =
    today.getMonth() < dateOfBirth.getMonth() ||
    (today.getMonth() === dateOfBirth.getMonth() && today.getDate() < dateOfBirth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function parseDecimal(value: string): number {
  return Number(value.trim().replace(',', '.'));
}

export default function OnboardingBodyScreen() {
  const { userId } = useSession();
  const { state, saveProfile } = useApp();
  const { accent, weightUnit } = usePreferences();
  const C = useColors();
  const textInputStyle = useInputStyle();
  const initialWeightKg = useRef<number | null>(null);

  const [fullName, setFullName] = useState(state.profileData?.fullName ?? state.profile?.name ?? '');
  const [sex, setSex] = useState<Sex | null>(state.profileData?.sex ?? null);
  const [dob, setDob] = useState(displayDob(state.profileData?.dateOfBirth ?? null));
  const [height, setHeight] = useState(state.profileData?.heightCm != null ? String(state.profileData.heightCm) : '');
  const [weight, setWeight] = useState('');
  const [goalWeight, setGoalWeight] = useState(
    state.profileData?.goalWeightKg != null
      ? String(displayWeight(state.profileData.goalWeightKg, weightUnit))
      : '',
  );
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!userId) return () => { active = false; };

    Promise.all([
      setOnboardingStep(userId, 'body'),
      getAthleteProfile(userId),
      getLatestWeight(userId),
    ])
      .then(([, profile, latestWeight]) => {
        if (!active) return;
        if (profile) {
          setFullName(profile.fullName);
          setSex(profile.sex);
          setDob(displayDob(profile.dateOfBirth));
          setHeight(profile.heightCm != null ? String(profile.heightCm) : '');
          setGoalWeight(profile.goalWeightKg != null ? String(displayWeight(profile.goalWeightKg, weightUnit)) : '');
        }
        initialWeightKg.current = latestWeight;
        setWeight(latestWeight != null ? String(displayWeight(latestWeight, weightUnit)) : '');
        setLoaded(true);
      })
      .catch(() => {
        if (active) {
          setError('No pudimos cargar tus datos guardados.');
          setLoaded(true);
        }
      });

    return () => { active = false; };
  }, [userId, weightUnit]);

  const shownError = error ?? (!userId ? 'No encontramos una sesión activa.' : null);

  async function saveAndContinue() {
    if (!userId || saving) return;
    setError(null);

    const birthDate = parseDob(dob);
    const heightCm = parseDecimal(height);
    const enteredWeight = parseDecimal(weight);
    const enteredGoalWeight = parseDecimal(goalWeight);
    const weightKg = toKg(enteredWeight, weightUnit);
    const goalWeightKg = toKg(enteredGoalWeight, weightUnit);

    if (!fullName.trim()) {
      setError('Ingresá tu nombre completo.');
      return;
    }
    if (!sex) {
      setError('Seleccioná tu sexo para calcular estimaciones metabólicas.');
      return;
    }
    if (!birthDate) {
      setError('Ingresá una fecha válida en formato DD/MM/AAAA.');
      return;
    }
    const age = ageOn(birthDate);
    if (birthDate > new Date() || age < 1 || age >= 120) {
      setError('Revisá tu fecha de nacimiento.');
      return;
    }
    if (!Number.isFinite(heightCm) || heightCm < 100 || heightCm > 250) {
      setError('Ingresá una altura válida entre 100 y 250 cm.');
      return;
    }
    if (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 350) {
      setError(`Ingresá un peso actual válido en ${weightUnit}.`);
      return;
    }
    if (!Number.isFinite(goalWeightKg) || goalWeightKg < 25 || goalWeightKg > 350) {
      setError(`Ingresá un peso meta válido en ${weightUnit}.`);
      return;
    }

    const profileData = {
      fullName: fullName.trim(),
      sex,
      dateOfBirth: dob,
      heightCm: Math.round(heightCm * 10) / 10,
      goalWeightKg: Math.round(goalWeightKg * 100) / 100,
    };

    setSaving(true);
    try {
      if (initialWeightKg.current == null || Math.abs(initialWeightKg.current - weightKg) >= 0.05) {
        await saveInitialWeight(userId, Math.round(weightKg * 100) / 100);
        initialWeightKg.current = weightKg;
      }
      await saveProfile(profileData);
      router.push('/(onboarding)/goal' as never);
    } catch {
      setError('No pudimos guardar tus datos. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <WizardShell
      stepIndex={2}
      title="Conozcamos tu cuerpo"
      subtitle="Estos datos se usan para estimar energía y detectar cuándo una recomendación necesita revisión profesional."
      onBack={() => router.back()}
      onNext={saveAndContinue}
      canProceed={loaded && Boolean(userId)}
      busy={saving}
    >
      {!loaded && userId ? (
        <View style={{ paddingVertical: 36, alignItems: 'center' }}>
          <ActivityIndicator color={accent} />
        </View>
      ) : loaded ? (
        <>
          <SectionHeader label="PERFIL" />
          <View style={{ gap: 14, marginBottom: 26 }}>
            <View>
              <FieldLabel>NOMBRE COMPLETO</FieldLabel>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                autoComplete="name"
                placeholder="Tu nombre"
                placeholderTextColor={C.textTertiary}
                style={textInputStyle}
              />
            </View>
            <View>
              <FieldLabel>SEXO</FieldLabel>
              <ChipSelect
                options={SEX_OPTIONS}
                selected={sex ?? ''}
                onChange={next => setSex(typeof next === 'string' ? next as Sex : null)}
              />
            </View>
            <View>
              <FieldLabel>FECHA DE NACIMIENTO</FieldLabel>
              <TextInput
                value={dob}
                onChangeText={value => setDob(formatDob(value))}
                keyboardType="numeric"
                maxLength={10}
                placeholder="DD/MM/AAAA"
                placeholderTextColor={C.textTertiary}
                style={textInputStyle}
              />
            </View>
          </View>

          <SectionHeader label="MEDIDAS" />
          <View style={{ gap: 14 }}>
            <View>
              <FieldLabel>ALTURA (CM)</FieldLabel>
              <TextInput
                value={height}
                onChangeText={setHeight}
                keyboardType="decimal-pad"
                placeholder="170"
                placeholderTextColor={C.textTertiary}
                style={textInputStyle}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <FieldLabel>{`PESO ACTUAL (${weightUnit})`}</FieldLabel>
                <TextInput
                  value={weight}
                  onChangeText={setWeight}
                  keyboardType="decimal-pad"
                  placeholder={weightUnit === 'kg' ? '75.0' : '165.3'}
                  placeholderTextColor={C.textTertiary}
                  style={textInputStyle}
                />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel>{`PESO META (${weightUnit})`}</FieldLabel>
                <TextInput
                  value={goalWeight}
                  onChangeText={setGoalWeight}
                  keyboardType="decimal-pad"
                  placeholder={weightUnit === 'kg' ? '70.0' : '154.3'}
                  placeholderTextColor={C.textTertiary}
                  style={textInputStyle}
                />
              </View>
            </View>
          </View>
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
