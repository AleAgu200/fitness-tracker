import { memo, useMemo } from 'react';
import { Path } from 'react-native-svg';

import { C } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';

import { bodyBack } from './vendor/body-back';
import { bodyFemaleBack } from './vendor/body-female-back';
import { bodyFemaleFront } from './vendor/body-female-front';
import { bodyFront } from './vendor/body-front';
import { SvgFemaleWrapper } from './vendor/svg-female-wrapper';
import { SvgMaleWrapper } from './vendor/svg-male-wrapper';
import { BodyPartPath } from './vendor/types';

export type BodyGender = 'male' | 'female';
export type BodySide = 'front' | 'back';
export type MuscleGroup = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'full';

export interface MuscleSignal {
  group: MuscleGroup;
  /** Current relative workload, from 0 to 1. */
  load: number;
  selected?: boolean;
  recovery?: boolean;
  discomfort?: boolean;
}

interface PulsoBodyMapProps {
  gender?: BodyGender;
  side?: BodySide;
  scale?: number;
  signals?: MuscleSignal[];
  selectedSlugs?: string[];
  detailedLoads?: Record<string, number>;
  onMusclePress?: (group: MuscleGroup, slug: string) => void;
}

export interface MuscleDetail {
  slug: string;
  key: string;
  label: string;
  group: MuscleGroup;
  side: 'left' | 'right' | null;
  view: BodySide | null;
}

const MUSCLE_DEFINITIONS: {
  match: string;
  key: string;
  label: string;
  group: MuscleGroup;
}[] = [
  { match: 'upper-back', key: 'upper_back', label: 'ESPALDA ALTA', group: 'back' },
  { match: 'lower-back', key: 'lower_back', label: 'LUMBARES', group: 'back' },
  { match: 'quadriceps', key: 'quadriceps', label: 'CUÁDRICEPS', group: 'legs' },
  { match: 'hamstring', key: 'hamstrings', label: 'ISQUIOTIBIALES', group: 'legs' },
  { match: 'trapezius', key: 'trapezius', label: 'TRAPECIO', group: 'back' },
  { match: 'deltoids', key: 'deltoids', label: 'DELTOIDES', group: 'shoulders' },
  { match: 'adductors', key: 'adductors', label: 'ADUCTORES', group: 'legs' },
  { match: 'gluteal', key: 'gluteals', label: 'GLÚTEOS', group: 'legs' },
  { match: 'tibialis', key: 'tibialis', label: 'TIBIAL ANTERIOR', group: 'legs' },
  { match: 'calves', key: 'calves', label: 'GEMELOS', group: 'legs' },
  { match: 'forearm', key: 'forearms', label: 'ANTEBRAZOS', group: 'arms' },
  { match: 'biceps', key: 'biceps', label: 'BÍCEPS', group: 'arms' },
  { match: 'triceps', key: 'triceps', label: 'TRÍCEPS', group: 'arms' },
  { match: 'chest', key: 'chest', label: 'PECTORALES', group: 'chest' },
  { match: 'obliques', key: 'obliques', label: 'OBLICUOS', group: 'core' },
  { match: 'abs-upper', key: 'upper_abs', label: 'ABDOMINAL SUPERIOR', group: 'core' },
  { match: 'abs-lower', key: 'lower_abs', label: 'ABDOMINAL INFERIOR', group: 'core' },
  { match: 'abs', key: 'abs', label: 'ABDOMINALES', group: 'core' },
  { match: 'neck', key: 'neck', label: 'CUELLO', group: 'shoulders' },
];

export function muscleDetailForSlug(slug: string): MuscleDetail | null {
  const definition = MUSCLE_DEFINITIONS.find(item => slug.includes(item.match));
  if (!definition) return null;
  return {
    slug,
    key: definition.key,
    label: definition.label,
    group: definition.group,
    side: slug.includes('left') ? 'left' : slug.includes('right') ? 'right' : null,
    view: slug.includes('front') ? 'front' : slug.includes('back') ? 'back' : null,
  };
}

export function muscleGroupForSlug(slug: string): MuscleGroup | null {
  return muscleDetailForSlug(slug)?.group ?? null;
}

function sourceFor(gender: BodyGender, side: BodySide): BodyPartPath[] {
  return gender === 'female'
    ? side === 'front' ? bodyFemaleFront : bodyFemaleBack
    : side === 'front' ? bodyFront : bodyBack;
}

export function getAvailableMuscles(gender: BodyGender, side: BodySide): MuscleDetail[] {
  const seen = new Set<string>();
  return sourceFor(gender, side)
    .flatMap(part => {
      const detail = muscleDetailForSlug(part.slug);
      if (!detail || seen.has(detail.slug)) return [];
      seen.add(detail.slug);
      return [{ ...detail, view: detail.view ?? side }];
    });
}

function fillForSignal(signal: MuscleSignal | undefined, selected: boolean, accent: string): string {
  if (selected) return accent;
  if (!signal) return C.border;
  if (signal.discomfort) return C.red;
  if (signal.selected) return accent;
  if (signal.recovery) return C.cyan;
  if (signal.load >= 0.75) return C.orange;
  if (signal.load > 0) return 'rgba(255,166,43,0.46)';
  return C.border;
}

function PulsoBodyMapComponent({
  gender = 'male',
  side = 'front',
  scale = 0.7,
  signals = [],
  selectedSlugs = [],
  detailedLoads = {},
  onMusclePress,
}: PulsoBodyMapProps) {
  const { accent } = usePreferences();
  const source = sourceFor(gender, side);
  const Wrapper = gender === 'female' ? SvgFemaleWrapper : SvgMaleWrapper;

  const byGroup = useMemo(
    () => new Map(signals.map(signal => [signal.group, signal])),
    [signals],
  );

  return (
    <Wrapper gender={gender} side={side} scale={scale}>
      {source.flatMap(part => {
        const detail = muscleDetailForSlug(part.slug);
        const group = detail?.group ?? null;
        const selected = selectedSlugs.includes(part.slug);
        const broadSignal = group ? byGroup.get(group) : undefined;
        const detailedLoad = detail ? detailedLoads[detail.key] : undefined;
        const signal = broadSignal && detailedLoad != null
          ? { ...broadSignal, load: detailedLoad, selected: false }
          : broadSignal;
        const fill = fillForSignal(signal, selected, accent);
        return (part.pathArray ?? []).map((path, index) => (
          <Path
            key={`${part.slug}-${index}`}
            id={part.slug}
            d={path}
            fill={fill}
            stroke={selected ? accent : C.bg}
            strokeWidth={selected ? 2.4 : 0.8}
            onPress={() => {
              if (group) onMusclePress?.(group, part.slug);
            }}
          />
        ));
      })}
    </Wrapper>
  );
}

export const PulsoBodyMap = memo(PulsoBodyMapComponent);
