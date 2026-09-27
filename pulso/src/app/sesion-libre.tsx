import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BodyMapPanel, loadDescription } from '@/components/body-map/body-map-panel';
import { Label, PressableScale, Segmented, SMALL_TARGET_HIT_SLOP } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import { useApp } from '@/context/app-state';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import { getExerciseLibrary } from '@/db/pulse';
import { usePulse } from '@/hooks/use-pulse';
import { loadDiscomfort, toggleDiscomfort } from '@/lib/discomfort';
import { DETAILED_MUSCLE_LABELS, DetailedMuscleKey, EquipmentKind } from '@/lib/muscles';
import { generateFreeSession, LibraryExercise } from '@/lib/pulse-engine';
import { formatWeight } from '@/lib/units';

const EQUIPMENT: { key: EquipmentKind; label: string }[] = [
  { key: 'bodyweight', label: 'PESO CORPORAL' },
  { key: 'dumbbell', label: 'MANCUERNAS' },
  { key: 'barbell', label: 'BARRA' },
  { key: 'machine', label: 'MÁQUINA / POLEA' },
];

function sessionLabel(selected: DetailedMuscleKey[]): string {
  const names = selected.map(key => DETAILED_MUSCLE_LABELS[key]);
  return names.length <= 3 ? names.join(' + ') : `${names.slice(0, 2).join(' + ')} + ${names.length - 2} MÁS`;
}

/**
 * Free session from the body map: pick muscles, see recent load, start. The
 * session is generated deterministically from exercises already on the phone —
 * no AI, no network — and never modifies the athlete's or a coach's plan.
 */
export default function SesionLibreScreen() {
  const { state, startFreeSession } = useApp();
  const { userId } = useSession();
  const { accent, weightUnit } = usePreferences();
  const { load } = usePulse();
  const C = useColors();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<'select' | 'discomfort'>('select');
  const [selected, setSelected] = useState<DetailedMuscleKey[]>([]);
  const [equipment, setEquipment] = useState<EquipmentKind[]>([]);
  const [discomfort, setDiscomfort] = useState<DetailedMuscleKey[]>([]);
  const [library, setLibrary] = useState<LibraryExercise[] | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    Promise.all([getExerciseLibrary(userId), loadDiscomfort(userId)])
      .then(([items, hurts]) => {
        if (!active) return;
        setLibrary(items);
        setDiscomfort(hurts);
      })
      .catch(e => console.error('[free-session-library]', e));
    return () => { active = false; };
  }, [userId]);

  const items = useMemo(
    () => (library ? generateFreeSession({ selected, library, equipment }) : []),
    [library, selected, equipment],
  );

  function select(key: DetailedMuscleKey) {
    if (selected.includes(key)) {
      setSelected(current => current.filter(item => item !== key));
      return;
    }
    if (discomfort.includes(key)) {
      Alert.alert(
        `Molestia en ${DETAILED_MUSCLE_LABELS[key].toLowerCase()}`,
        'Marcaste molestia en esta zona. Esto no es una evaluación médica: si el dolor sigue, consultá a un profesional. ¿Querés incluirla igual?',
        [
          { text: 'No incluir', style: 'cancel' },
          { text: 'Incluir', onPress: () => setSelected(current => [...current, key]) },
        ],
      );
      return;
    }
    setSelected(current => [...current, key]);
  }

  async function markDiscomfort(key: DetailedMuscleKey) {
    if (!userId) return;
    try {
      const next = await toggleDiscomfort(userId, key);
      setDiscomfort(next);
      // Marking discomfort takes the zone out of today's selection.
      if (next.includes(key)) setSelected(current => current.filter(item => item !== key));
    } catch (e) {
      console.error('[discomfort]', e);
    }
  }

  async function start() {
    if (!items.length || starting) return;
    setStarting(true);
    try {
      await startFreeSession(sessionLabel(selected), items.map(item => ({
        nombre: item.name,
        target: item.sets,
        reps: item.reps,
        peso: item.weightKg,
        step: item.stepKg,
      })));
      router.dismissTo('/entreno');
    } catch (e) {
      const inProgress = e instanceof Error && e.message === 'session_in_progress';
      Alert.alert(
        'No pudimos empezar',
        inProgress
          ? 'Ya registraste series hoy. Terminá esa sesión desde Entreno antes de empezar una libre.'
          : 'Algo falló al guardar la sesión en el teléfono. Probá de nuevo.',
      );
    } finally {
      setStarting(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <PressableScale
            onPress={() => router.back()}
            accessibilityLabel="Volver"
            style={{ width: 44, height: 44, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: F.mono, fontSize: 15, color: C.textPrimary }}>←</Text>
          </PressableScale>
          <View style={{ flex: 1 }}>
            <Label>SESIÓN LIBRE</Label>
            <Text accessibilityRole="header" style={{ fontFamily: F.grotesk, fontSize: 22, color: C.textPrimary, marginTop: 2 }}>
              ¿Qué querés mover?
            </Text>
          </View>
        </View>

        <Segmented
          accent={mode === 'discomfort' ? C.red : accent}
          value={mode}
          onChange={setMode}
          style={{ marginBottom: 6 }}
          options={[
            { key: 'select' as const, label: 'ELEGIR MÚSCULOS' },
            { key: 'discomfort' as const, label: 'MARCAR MOLESTIA' },
          ]}
        />
        {mode === 'discomfort' && (
          <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 17, color: C.textSecondary, marginVertical: 6 }}>
            Tocá donde sentís molestia. Se borra sola en 7 días y no se comparte. No es una evaluación médica.
          </Text>
        )}

        <BodyMapPanel
          load={load}
          selected={selected}
          discomfort={discomfort}
          selectable={mode === 'select'}
          gender={state.profileData?.sex === 'F' ? 'female' : 'male'}
          onMusclePress={key => (mode === 'select' ? select(key) : void markDiscomfort(key))}
        />

        {selected.length > 0 && (
          <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12, marginTop: 8, gap: 8 }}>
            <Label>SELECCIONADO</Label>
            {selected.map(key => (
              <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }}>{DETAILED_MUSCLE_LABELS[key]}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 9, color: load.byMuscle[key]?.recovering ? C.cyan : C.textTertiary, marginTop: 2 }}>
                    {loadDescription(load.byMuscle[key])} · 7D
                  </Text>
                </View>
                <PressableScale
                  onPress={() => select(key)}
                  hitSlop={SMALL_TARGET_HIT_SLOP}
                  accessibilityLabel={`Quitar ${DETAILED_MUSCLE_LABELS[key].toLowerCase()}`}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: C.border }}
                >
                  <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textSecondary }}>✕</Text>
                </PressableScale>
              </View>
            ))}
          </View>
        )}

        <Label style={{ marginTop: 18, marginBottom: 8 }}>EQUIPO DISPONIBLE</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {EQUIPMENT.map(option => {
            const on = equipment.includes(option.key);
            return (
              <PressableScale
                key={option.key}
                accessibilityRole="checkbox"
                selected={on}
                onPress={() => setEquipment(current => on ? current.filter(item => item !== option.key) : [...current, option.key])}
                style={{
                  minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1,
                  borderColor: on ? accent : C.border, backgroundColor: on ? withAlpha(accent, 0.1) : 'transparent',
                }}
              >
                <Text style={{ fontFamily: F.mono, fontSize: 10, color: on ? C.textPrimary : C.textSecondary }}>{option.label}</Text>
              </PressableScale>
            );
          })}
        </View>
        <Text style={{ fontFamily: F.inter, fontSize: 11, color: C.textTertiary, marginTop: 6 }}>
          {equipment.length ? 'Solo ejercicios con ese equipo.' : 'Sin filtro: cualquier equipo.'}
        </Text>

        {selected.length > 0 && (
          <View style={{ marginTop: 18 }}>
            <Label style={{ marginBottom: 6 }}>{`TU SESIÓN · ${items.length} EJERCICIO${items.length === 1 ? '' : 'S'}`}</Label>
            {items.length === 0 && library && (
              <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textSecondary }}>
                No hay ejercicios para esa combinación. Probá sin filtro de equipo o con otro músculo.
              </Text>
            )}
            {items.map((item, index) => (
              <View key={item.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderTopColor: C.border }}>
                <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary, width: 20 }}>{String(index + 1).padStart(2, '0')}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }}>{item.name}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary, marginTop: 2 }}>
                    {DETAILED_MUSCLE_LABELS[item.muscle]}
                  </Text>
                </View>
                <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textSecondary }}>
                  {item.sets}×{item.reps}{item.weightKg > 0 ? ` · ${formatWeight(item.weightKg, weightUnit)}` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg }}>
        <PressableScale
          onPress={() => void start()}
          disabled={!items.length || starting}
          haptic="medium"
          style={{ minHeight: 50, justifyContent: 'center', alignItems: 'center', backgroundColor: accent }}
        >
          <Text style={{ fontFamily: F.monoXBold, fontSize: 12, letterSpacing: 0.8, color: C.onAccent }}>
            {starting ? 'PREPARANDO…' : items.length ? `EMPEZAR SESIÓN · ${items.length} EJERCICIO${items.length === 1 ? '' : 'S'}` : 'ELEGÍ AL MENOS UN MÚSCULO'}
          </Text>
        </PressableScale>
        <Text style={{ fontFamily: F.inter, fontSize: 10, color: C.textTertiary, textAlign: 'center', marginTop: 7 }}>
          La carga es una referencia de entrenamiento, no una evaluación médica.
        </Text>
      </View>
    </View>
  );
}
