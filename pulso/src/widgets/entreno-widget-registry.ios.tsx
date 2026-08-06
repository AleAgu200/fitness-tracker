import { HStack, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { background, font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget, WidgetEnvironment } from 'expo-widgets';

import { formatWeight } from '@/lib/units';
import { WorkoutWidgetData } from '@/widgets/workout-widget-types';

const BG = '#0A0A0B';
const TEXT_PRIMARY = '#FAFAFA';
const TEXT_SECONDARY = '#8A8A93';
const TEXT_TERTIARY = '#5A5A62';
const CYAN = '#3DDCFF';

function EntrenoWidgetLayout(data: WorkoutWidgetData, environment: WidgetEnvironment) {
  'widget';

  const isSmall = environment.widgetFamily === 'systemSmall';

  // The widget can't write to the app's database itself — "done"/"finish" are plain deep
  // links (like the body tap), and the app performs the action the instant it mounts (see
  // the `action=done|finish` handling in entreno.tsx). No App-Intent/iOS-17-only path.
  if (data.sessionDone) {
    return (
      <Link destination="pulso://entreno">
        <VStack alignment="center" spacing={4} modifiers={[padding({ all: 16 }), background(BG)]}>
          <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(data.accent)]}>⚡ PULSO</Text>
          <Text modifiers={[font({ size: 12 }), foregroundStyle(TEXT_SECONDARY)]}>¡Buen trabajo!</Text>
        </VStack>
      </Link>
    );
  }

  if (!data.workoutActive || !data.currentExercise) {
    return (
      <Link destination="pulso://entreno">
        <VStack alignment="center" spacing={4} modifiers={[padding({ all: 16 }), background(BG)]}>
          <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(data.accent)]}>⚡ PULSO</Text>
          <Text modifiers={[font({ size: 12 }), foregroundStyle(TEXT_TERTIARY)]}>Comenzá tu entreno</Text>
        </VStack>
      </Link>
    );
  }

  const timerRange = data.restActive && data.restEndAt
    ? { lower: new Date(), upper: new Date(data.restEndAt) }
    : null;

  // Whole card deep-links to the app by default; the "■ FIN" / "✓ LISTO" nested Links
  // below take over their own bounds (same nested-tappable-region pattern as a Button
  // inside a List row) — worth a visual/tap check on a real device once built.
  return (
    <Link destination="pulso://entreno">
      <VStack alignment="leading" spacing={isSmall ? 4 : 8} modifiers={[padding({ all: 16 }), background(BG)]}>
        {!isSmall && (
          <HStack>
            <Text modifiers={[font({ size: 10, weight: 'semibold' }), foregroundStyle(data.accent)]}>
              ENTRENO ACTUAL
            </Text>
            <Spacer />
            <Link destination="pulso://entreno?action=finish">
              <Text modifiers={[font({ size: 9, weight: 'semibold' }), foregroundStyle(TEXT_SECONDARY)]}>
                ■ FIN
              </Text>
            </Link>
          </HStack>
        )}
        <Text modifiers={[font({ size: isSmall ? 14 : 20, weight: 'bold' }), foregroundStyle(TEXT_PRIMARY)]}>
          {data.currentExercise}
        </Text>
        {data.weight != null && data.reps != null && (
          <Text modifiers={[font({ size: isSmall ? 11 : 13 }), foregroundStyle(TEXT_SECONDARY)]}>
            {`${formatWeight(data.weight, data.weightUnit)} × ${data.reps}`}
          </Text>
        )}
        {!isSmall && data.nextExercise && (
          <VStack alignment="leading" spacing={2}>
            <Text modifiers={[font({ size: 9 }), foregroundStyle(TEXT_TERTIARY)]}>SIGUIENTE</Text>
            <Text modifiers={[font({ size: 13 }), foregroundStyle(TEXT_SECONDARY)]}>{data.nextExercise}</Text>
          </VStack>
        )}
        <Spacer />
        <HStack modifiers={[padding({ top: 8 })]}>
          {!isSmall && !data.restActive && data.currentSlotId ? (
            <Link destination={`pulso://entreno?action=done&slotId=${encodeURIComponent(data.currentSlotId)}`}>
              <Text modifiers={[font({ size: 10, weight: 'semibold' }), foregroundStyle(CYAN)]}>
                ✓ LISTO
              </Text>
            </Link>
          ) : (
            <Text modifiers={[font({ size: 10, weight: 'semibold' }), foregroundStyle(CYAN)]}>
              {data.restActive ? 'DESCANSO' : 'LISTO'}
            </Text>
          )}
          <Spacer />
          {timerRange ? (
            <Text
              timerInterval={timerRange}
              dateStyle="timer"
              modifiers={[font({ size: isSmall ? 16 : 22, weight: 'bold' }), foregroundStyle(CYAN)]}
            />
          ) : (
            <Text modifiers={[font({ size: isSmall ? 16 : 22, weight: 'bold' }), foregroundStyle(CYAN)]}>—</Text>
          )}
        </HStack>
      </VStack>
    </Link>
  );
}

export const pulsoEntrenoWidget = createWidget<WorkoutWidgetData>('PulsoEntrenoWidget', EntrenoWidgetLayout);
