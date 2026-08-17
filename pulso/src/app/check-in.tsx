import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Label, PressableScale } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';
import {
  CheckinAnswers,
  CheckinQuestion,
  getPendingProfessionalCheckin,
  ProfessionalCheckinRequest,
  submitProfessionalCheckin,
} from '@/db/sync';
import { useSession } from '@/context/session';
import { syncMobileData } from '@/lib/sync';

type PendingRequest = Omit<ProfessionalCheckinRequest, 'questions'> & { questions: CheckinQuestion[] };
type ScaleKey = 'energy' | 'sleep' | 'pain' | 'stress' | 'motivation';

const DEFAULTS: CheckinAnswers = { energy: 5, sleep: 5, pain: 0, stress: 5, motivation: 5, obstacles: '', note: '' };

function ScaleQuestion({ question, value, onChange }: { question: CheckinQuestion; value: number; onChange: (value: number) => void }) {
  const C = useColors();
  const min = question.min ?? 1;
  const max = question.max ?? 10;
  return (
    <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontFamily: F.interSemi, fontSize: 15, color: C.textPrimary }}>{question.label}</Text>
        <Text style={{ fontFamily: F.monoXBold, fontSize: 18, color: C.cyan }}>{value}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {Array.from({ length: max - min + 1 }, (_, index) => min + index).map(option => (
          <PressableScale
            key={option}
            onPress={() => onChange(option)}
            accessibilityLabel={`${question.label}: ${option}`}
            style={{
              width: 31, height: 34, alignItems: 'center', justifyContent: 'center',
              backgroundColor: value === option ? C.cyan : C.bgEl,
              borderWidth: 1, borderColor: value === option ? C.cyan : C.border,
            }}
          >
            <Text style={{ fontFamily: F.monoBold, fontSize: 11, color: value === option ? C.bg : C.textSecondary }}>{option}</Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

export default function ProfessionalCheckinScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const { userId } = useSession();
  const [request, setRequest] = useState<PendingRequest | null | undefined>(undefined);
  const [answers, setAnswers] = useState<CheckinAnswers>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => userId ? getPendingProfessionalCheckin(userId) : null, [userId]);
  useEffect(() => {
    load().then(setRequest).catch(() => setRequest(null));
  }, [load]);

  const scaleQuestions = useMemo(() => request?.questions.filter(question => question.type === 'scale') ?? [], [request]);
  const textQuestions = useMemo(() => request?.questions.filter(question => question.type === 'text') ?? [], [request]);

  async function submit() {
    if (!request || !userId || saving) return;
    setSaving(true);
    setError(null);
    try {
      await submitProfessionalCheckin(userId, request.id, answers);
      setSaved(true);
      // The response is already durable in SQLite. Network failure here leaves
      // it safely queued for the next foreground/manual sync.
      await syncMobileData(userId);
    } catch {
      setError('No se pudo guardar el check-in. Intentá nuevamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <PressableScale onPress={() => router.back()} accessibilityLabel="Volver" style={{ width: 34, height: 34, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: F.mono, fontSize: 15, color: C.textPrimary }}>←</Text>
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Label>SEGUIMIENTO PROFESIONAL</Label>
          <Text style={{ fontFamily: F.grotesk, fontSize: 23, color: C.textPrimary, marginTop: 3 }}>Check-in semanal</Text>
        </View>
      </View>

      {request === undefined ? (
        <ActivityIndicator color={C.cyan} style={{ marginTop: 48 }} />
      ) : saved ? (
        <Card style={{ padding: 22, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.monoXBold, fontSize: 24, color: C.cyan }}>✓</Text>
          <Text style={{ fontFamily: F.grotesk, fontSize: 20, color: C.textPrimary, marginTop: 10 }}>Check-in guardado</Text>
          <Text style={{ fontFamily: F.inter, fontSize: 13, lineHeight: 19, textAlign: 'center', color: C.textSecondary, marginTop: 7 }}>Tu respuesta quedó guardada y se enviará automáticamente, incluso si ahora no tenés conexión.</Text>
        </Card>
      ) : !request ? (
        <Card style={{ padding: 22 }}>
          <Label>TODO AL DÍA</Label>
          <Text style={{ fontFamily: F.grotesk, fontSize: 20, color: C.textPrimary, marginTop: 8 }}>No hay check-ins pendientes</Text>
          <Text style={{ fontFamily: F.inter, fontSize: 13, lineHeight: 19, color: C.textSecondary, marginTop: 7 }}>Cuando tu profesional solicite uno, aparecerá aquí después de sincronizar.</Text>
        </Card>
      ) : (
        <>
          <Card style={{ marginBottom: 14 }}>
            <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <Label>FECHA LÍMITE · {request.dueAt.toLocaleDateString('es', { day: '2-digit', month: 'short' }).toUpperCase()}</Label>
              <Text style={{ fontFamily: F.inter, fontSize: 13, lineHeight: 19, color: C.textSecondary, marginTop: 7 }}>Respondé según cómo te sentiste durante los últimos siete días.</Text>
            </View>
            {scaleQuestions.map(question => (
              <ScaleQuestion
                key={question.id}
                question={question}
                value={answers[question.id as ScaleKey]}
                onChange={value => setAnswers(current => ({ ...current, [question.id]: value }))}
              />
            ))}
          </Card>

          {textQuestions.map(question => (
            <Card key={question.id} style={{ padding: 14, marginBottom: 12 }}>
              <Label>{question.label}</Label>
              <TextInput
                value={String(answers[question.id] ?? '')}
                onChangeText={value => setAnswers(current => ({ ...current, [question.id]: value }))}
                multiline
                maxLength={question.id === 'obstacles' ? 1000 : 2000}
                placeholder={question.id === 'obstacles' ? '¿Qué te dificultó cumplir esta semana?' : 'Algo más que quieras compartir'}
                placeholderTextColor={C.textTertiary}
                style={{ minHeight: 88, marginTop: 10, padding: 12, textAlignVertical: 'top', backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, color: C.textPrimary, fontFamily: F.inter, fontSize: 14, lineHeight: 20 }}
              />
            </Card>
          ))}
          {error && <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.red, marginBottom: 10 }}>{error}</Text>}
          <PressableScale onPress={submit} disabled={saving} haptic="success" style={{ minHeight: 54, backgroundColor: C.yellow, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }}>
            {saving ? <ActivityIndicator color={C.bg} /> : <Text style={{ fontFamily: F.monoXBold, fontSize: 12, letterSpacing: 0.8, color: C.bg }}>GUARDAR CHECK-IN</Text>}
          </PressableScale>
        </>
      )}
    </ScrollView>
  );
}
