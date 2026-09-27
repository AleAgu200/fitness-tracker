import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { Label, PressableScale, Segmented } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { DETAILED_MUSCLE_LABELS, DetailedMuscleKey } from '@/lib/muscles';
import type { MuscleLoad, MuscleLoadEntry } from '@/lib/pulse-engine';
import {
  BodyGender,
  BodySide,
  getAvailableMuscles,
  MuscleGroup,
  muscleDetailForSlug,
  PulsoBodyMap,
} from './pulso-body-map';

/** Muscles offered in the list view, head to toe. */
const LISTED_MUSCLES: DetailedMuscleKey[] = [
  'trapezius', 'deltoids', 'chest', 'upper_back', 'lower_back', 'biceps', 'triceps', 'forearms',
  'upper_abs', 'lower_abs', 'obliques', 'gluteals', 'quadriceps', 'hamstrings', 'adductors', 'calves', 'tibialis',
];

const ALL_GROUPS: MuscleGroup[] = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'full'];

/** The map draws a generic "abs" region on some bodies; list and rules use the split keys. */
function normalizeKey(key: string): DetailedMuscleKey | null {
  if (key === 'abs') return 'upper_abs';
  if (key === 'neck') return null;
  return key as DetailedMuscleKey;
}

/** "CARGA MEDIA · 8 SERIES" over the last 7 days. */
export function loadDescription(entry: MuscleLoadEntry | undefined): string {
  if (!entry || entry.sets === 0) return 'SIN CARGA';
  const level = entry.relative >= 0.75 ? 'ALTA' : entry.relative > 0.35 ? 'MEDIA' : 'BAJA';
  return `CARGA ${level} · ${entry.sets} SERIES${entry.recovering ? ' · RECUPERANDO' : ''}`;
}

/**
 * Front/back body map with a full list alternative (screen readers, precise
 * taps). The same muscle catalog drives selection, 7-day load and recovery.
 * Load and recovery are training references, never a medical assessment.
 */
export function BodyMapPanel({ load, selected = [], discomfort = [], onMusclePress, selectable, gender }: {
  load: MuscleLoad;
  selected?: DetailedMuscleKey[];
  discomfort?: DetailedMuscleKey[];
  onMusclePress: (key: DetailedMuscleKey) => void;
  /** Rows behave as checkboxes (free session) instead of buttons (detail). */
  selectable: boolean;
  gender: BodyGender;
}) {
  const C = useColors();
  const { accent } = usePreferences();
  const [side, setSide] = useState<BodySide>('front');
  const [view, setView] = useState<'map' | 'list'>('map');

  const detailedLoads = useMemo(() => Object.fromEntries(
    Object.entries(load.byMuscle).map(([key, entry]) => [key, entry?.relative ?? 0]),
  ), [load]);
  const recovering = useMemo(
    () => Object.entries(load.byMuscle).filter(([, entry]) => entry?.recovering).map(([key]) => key),
    [load],
  );
  const selectedSlugs = useMemo(() => getAvailableMuscles(gender, side)
    .filter(detail => {
      const key = normalizeKey(detail.key);
      return key != null && selected.includes(key);
    })
    .map(detail => detail.slug), [gender, side, selected]);

  const summary = selected.length
    ? `Seleccionado: ${selected.map(key => DETAILED_MUSCLE_LABELS[key].toLowerCase()).join(', ')}.`
    : 'Nada seleccionado.';

  return (
    <View>
      <Segmented
        style={{ marginBottom: 10 }}
        accent={accent}
        value={view === 'list' ? 'list' : side}
        onChange={key => {
          if (key === 'list') setView('list');
          else { setView('map'); setSide(key); }
        }}
        options={[
          { key: 'front' as const, label: 'FRENTE', accessibilityLabel: 'Vista frontal del mapa' },
          { key: 'back' as const, label: 'ESPALDA', accessibilityLabel: 'Vista posterior del mapa' },
          { key: 'list' as const, label: 'LISTA', accessibilityLabel: 'Lista de músculos' },
        ]}
      />

      {view === 'map' ? (
        <View
          accessible
          accessibilityLabel={`Mapa corporal ${side === 'front' ? 'frontal' : 'posterior'}. ${summary}`}
          accessibilityHint="Para elegir músculos con lector de pantalla, abrí la pestaña Lista."
          style={{ minHeight: 300, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 }}
        >
          <PulsoBodyMap
            gender={gender}
            side={side}
            scale={0.72}
            signals={ALL_GROUPS.map(group => ({ group, load: 0 }))}
            detailedLoads={detailedLoads}
            selectedSlugs={selectedSlugs}
            recoveringKeys={recovering}
            discomfortKeys={discomfort}
            onMusclePress={(_, slug) => {
              const detail = muscleDetailForSlug(slug);
              const key = detail ? normalizeKey(detail.key) : null;
              if (key) onMusclePress(key);
            }}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 10 }}>
            {[
              { color: 'rgba(255,166,43,0.46)', label: 'CARGA 7D' },
              { color: C.cyan, label: 'RECUPERANDO' },
              ...(discomfort.length ? [{ color: C.red, label: 'MOLESTIA' }] : []),
              ...(selectable ? [{ color: accent, label: 'ELEGIDO' }] : []),
            ].map(item => (
              <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 9, height: 9, backgroundColor: item.color }} />
                <Label>{item.label}</Label>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View style={{ borderTopWidth: 1, borderTopColor: C.border }}>
          {LISTED_MUSCLES.map(key => {
            const isSelected = selected.includes(key);
            const hurts = discomfort.includes(key);
            const entry = load.byMuscle[key];
            return (
              <PressableScale
                key={key}
                onPress={() => onMusclePress(key)}
                accessibilityRole={selectable ? 'checkbox' : 'button'}
                selected={selectable ? isSelected : undefined}
                accessibilityLabel={`${DETAILED_MUSCLE_LABELS[key].toLowerCase()}. ${loadDescription(entry).toLowerCase()}${hurts ? '. molestia reportada' : ''}`}
                style={{
                  minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: C.border,
                }}
              >
                <View style={{
                  width: 14, height: 14, borderWidth: 1,
                  borderColor: isSelected ? accent : hurts ? C.red : C.border,
                  backgroundColor: isSelected ? accent : 'transparent',
                }} />
                <Text style={{ flex: 1, fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }}>
                  {DETAILED_MUSCLE_LABELS[key]}
                </Text>
                <Text style={{ fontFamily: F.mono, fontSize: 9, color: entry?.recovering ? C.cyan : hurts ? C.red : C.textTertiary }}>
                  {hurts ? 'MOLESTIA' : loadDescription(entry)}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      )}
    </View>
  );
}
