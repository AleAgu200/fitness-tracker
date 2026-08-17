import { HStack, Link, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { background, font, foregroundStyle, padding, progressViewStyle, tint } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { WorkoutWidgetData } from '@/widgets/workout-widget-types';

type WorkoutWidgetConfiguration = {
  presentation: 'control' | 'routine';
};

function EntrenoWidgetLayout(
  data: WorkoutWidgetData,
  environment: WidgetEnvironment<WorkoutWidgetConfiguration>,
) {
  'widget';

  const BG = '#0A0A0B';
  const SURFACE = '#1A1A1D';
  const TEXT_PRIMARY = '#FAFAFA';
  const TEXT_SECONDARY = '#C7C7CE';
  const TEXT_MUTED = '#8A8A93';
  const CYAN = '#3DDCFF';
  const isSmall = environment.widgetFamily === 'systemSmall';
  const isMedium = environment.widgetFamily === 'systemMedium';
  const isRoutine = isMedium && environment.configuration?.presentation === 'routine';
  const accent = environment.widgetRenderingMode === 'fullColor' ? data.accent : TEXT_PRIMARY;
  const weightValue = data.weight == null
    ? null
    : data.weightUnit === 'lb'
      ? data.weight * 2.2046226218
      : data.weight;
  const weightLabel = weightValue == null
    ? null
    : `${weightValue.toFixed(weightValue % 1 === 0 ? 0 : 1)} ${data.weightUnit}`;
  const compactName = data.currentExercise
    ? data.currentExercise.split(' ').filter(Boolean).slice(0, 3).map(part => part.slice(0, 1).toUpperCase()).join('')
    : 'PULSO';
  const setPips = data.targetSets > 0
    ? `${'● '.repeat(Math.min(data.completedSets, data.targetSets))}${'○ '.repeat(Math.max(0, data.targetSets - data.completedSets))}`.trim()
    : 'EN CURSO';
  const setProgress = data.targetSets > 0
    ? Math.min(Math.max(data.completedSets / data.targetSets, 0), 1)
    : 0;
  const timerRange = data.restActive && data.restEndAt
    ? { lower: new Date(), upper: new Date(data.restEndAt) }
    : null;
  const logDestination = data.currentSlotId
    ? `pulso://entreno?action=done&slotId=${encodeURIComponent(data.currentSlotId)}`
    : 'pulso://entreno';

  if (data.sessionDone) {
    return (
      <Link destination="pulso://entreno">
        <VStack alignment="leading" spacing={6} modifiers={[padding({ all: 16 }), background(BG)]}>
          <Text modifiers={[font({ size: 18, weight: 'bold' }), foregroundStyle(accent)]}>¡Buen trabajo!</Text>
          <Text modifiers={[font({ size: 12 }), foregroundStyle(TEXT_SECONDARY)]}>Sesión completada</Text>
          <Spacer />
          <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(CYAN)]}>VER RESUMEN</Text>
        </VStack>
      </Link>
    );
  }

  if (!data.workoutActive || !data.currentExercise) {
    return (
      <Link destination="pulso://entreno">
        <VStack alignment="leading" spacing={6} modifiers={[padding({ all: 16 }), background(BG)]}>
          <Text modifiers={[font({ size: 17, weight: 'bold' }), foregroundStyle(accent)]}>PULSO</Text>
          <Text modifiers={[font({ size: 13 }), foregroundStyle(TEXT_SECONDARY)]}>Tu próxima sesión está lista.</Text>
          <Spacer />
          <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(CYAN)]}>COMENZAR ENTRENO</Text>
        </VStack>
      </Link>
    );
  }

  if (isSmall) {
    return (
      <Link destination="pulso://entreno">
        <VStack alignment="center" spacing={5} modifiers={[padding({ all: 16 }), background(BG)]}>
          <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(TEXT_PRIMARY)]}>{compactName}</Text>
          <Spacer />
          {timerRange ? (
            <Text timerInterval={timerRange} dateStyle="timer" modifiers={[font({ size: 28, weight: 'bold' }), foregroundStyle(CYAN)]} />
          ) : (
            <Text modifiers={[font({ size: 22, weight: 'bold' }), foregroundStyle(accent)]}>LISTO</Text>
          )}
          <Spacer />
          <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(TEXT_MUTED)]}>{setPips}</Text>
        </VStack>
      </Link>
    );
  }

  if (isRoutine) {
    return (
      <Link destination="pulso://entreno">
        <VStack alignment="leading" spacing={7} modifiers={[padding({ all: 16 }), background(BG)]}>
          <HStack>
            <VStack alignment="leading" spacing={3}>
              <Text modifiers={[font({ size: 17, weight: 'bold' }), foregroundStyle(TEXT_PRIMARY)]}>{data.currentExercise}</Text>
              <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(accent)]}>{setPips}</Text>
            </VStack>
            <Spacer />
            {timerRange ? (
              <Text timerInterval={timerRange} dateStyle="timer" modifiers={[font({ size: 26, weight: 'bold' }), foregroundStyle(CYAN)]} />
            ) : (
              <Text modifiers={[font({ size: 16, weight: 'bold' }), foregroundStyle(accent)]}>A LEVANTAR</Text>
            )}
          </HStack>
          {data.targetSets > 0 && (
            <ProgressView value={setProgress} modifiers={[progressViewStyle('linear'), tint(accent)]} />
          )}
          <Spacer />
          <Text modifiers={[font({ size: 11 }), foregroundStyle(TEXT_MUTED)]}>
            {data.nextExercises.length ? `DESPUÉS · ${data.nextExercises.join(' · ')}` : 'ÚLTIMO EJERCICIO'}
          </Text>
          <Link destination={data.restActive ? 'pulso://entreno?action=skip-rest' : logDestination}>
            <Text modifiers={[padding({ all: 12 }), background(accent), font({ size: 11, weight: 'bold' }), foregroundStyle(BG)]}>
              {data.restActive ? 'SALTAR DESCANSO' : 'REGISTRAR SERIE'}
            </Text>
          </Link>
        </VStack>
      </Link>
    );
  }

  if (isMedium) {
    return (
      <Link destination="pulso://entreno">
        <HStack spacing={14} modifiers={[padding({ all: 16 }), background(BG)]}>
          <VStack alignment="leading" spacing={5}>
            <Text modifiers={[font({ size: 17, weight: 'bold' }), foregroundStyle(TEXT_PRIMARY)]}>{data.currentExercise}</Text>
            {weightLabel && data.reps != null && (
              <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(TEXT_SECONDARY)]}>{`${weightLabel} × ${data.reps}`}</Text>
            )}
            <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(accent)]}>{setPips}</Text>
            {data.targetSets > 0 && (
              <ProgressView value={setProgress} modifiers={[progressViewStyle('linear'), tint(accent)]} />
            )}
            <Spacer />
            <Text modifiers={[font({ size: 11 }), foregroundStyle(TEXT_MUTED)]}>{data.nextExercise ? `DESPUÉS · ${data.nextExercise}` : 'ÚLTIMO EJERCICIO'}</Text>
          </VStack>
          <Spacer />
          <VStack alignment="trailing" spacing={8}>
            {timerRange ? (
              <Text timerInterval={timerRange} dateStyle="timer" modifiers={[font({ size: 27, weight: 'bold' }), foregroundStyle(CYAN)]} />
            ) : (
              <Text modifiers={[font({ size: 14, weight: 'bold' }), foregroundStyle(accent)]}>LISTO</Text>
            )}
            <Spacer />
            <Link destination={data.restActive ? 'pulso://entreno?action=skip-rest' : logDestination}>
              <Text modifiers={[padding({ all: 12 }), background(accent), font({ size: 11, weight: 'bold' }), foregroundStyle(BG)]}>
                {data.restActive ? 'SALTAR' : 'REGISTRAR'}
              </Text>
            </Link>
          </VStack>
        </HStack>
      </Link>
    );
  }

  return (
    <Link destination="pulso://entreno">
      <VStack alignment="leading" spacing={9} modifiers={[padding({ all: 18 }), background(BG)]}>
        <HStack>
          <VStack alignment="leading" spacing={4}>
            <Text modifiers={[font({ size: 20, weight: 'bold' }), foregroundStyle(TEXT_PRIMARY)]}>{data.currentExercise}</Text>
            <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(accent)]}>
              {`${weightLabel ?? '—'} × ${data.reps ?? '—'} · ${data.completedSets}/${data.targetSets} SERIES`}
            </Text>
          </VStack>
          <Spacer />
          {timerRange ? (
            <Text timerInterval={timerRange} dateStyle="timer" modifiers={[font({ size: 30, weight: 'bold' }), foregroundStyle(CYAN)]} />
          ) : (
            <Text modifiers={[font({ size: 16, weight: 'bold' }), foregroundStyle(accent)]}>A LEVANTAR</Text>
          )}
        </HStack>

        {data.targetSets > 0 && (
          <ProgressView value={setProgress} modifiers={[progressViewStyle('linear'), tint(accent)]} />
        )}

        <VStack alignment="leading" spacing={6}>
          {data.loggedSets.length === 0 && (
            <Text modifiers={[font({ size: 12 }), foregroundStyle(TEXT_MUTED)]}>Primera serie lista para registrar</Text>
          )}
          {data.loggedSets[0] && (
            <Text modifiers={[font({ size: 12 }), foregroundStyle(TEXT_SECONDARY)]}>{`S1  ${data.loggedSets[0].weight} ${data.weightUnit} × ${data.loggedSets[0].reps} · RPE ${data.loggedSets[0].rpe}`}</Text>
          )}
          {data.loggedSets[1] && (
            <Text modifiers={[font({ size: 12 }), foregroundStyle(TEXT_SECONDARY)]}>{`S2  ${data.loggedSets[1].weight} ${data.weightUnit} × ${data.loggedSets[1].reps} · RPE ${data.loggedSets[1].rpe}`}</Text>
          )}
          {data.loggedSets[2] && (
            <Text modifiers={[font({ size: 12 }), foregroundStyle(TEXT_SECONDARY)]}>{`S3  ${data.loggedSets[2].weight} ${data.weightUnit} × ${data.loggedSets[2].reps} · RPE ${data.loggedSets[2].rpe}`}</Text>
          )}
        </VStack>

        <Text modifiers={[font({ size: 11 }), foregroundStyle(TEXT_MUTED)]}>{`VOLUMEN · ${Math.round(data.sessionVolume)} ${data.weightUnit}`}</Text>
        <Spacer />
        {data.restActive ? (
          <HStack spacing={8}>
            <Link destination="pulso://entreno?action=reduce-rest">
              <Text modifiers={[padding({ all: 12 }), background(SURFACE), font({ size: 11, weight: 'bold' }), foregroundStyle(TEXT_SECONDARY)]}>−30 s</Text>
            </Link>
            <Link destination="pulso://entreno?action=skip-rest">
              <Text modifiers={[padding({ all: 12 }), background(accent), font({ size: 11, weight: 'bold' }), foregroundStyle(BG)]}>SALTAR DESCANSO</Text>
            </Link>
            <Link destination="pulso://entreno?action=add-rest">
              <Text modifiers={[padding({ all: 12 }), background(SURFACE), font({ size: 11, weight: 'bold' }), foregroundStyle(TEXT_SECONDARY)]}>+30 s</Text>
            </Link>
          </HStack>
        ) : (
          <HStack spacing={8}>
            <Link destination={logDestination}>
              <Text modifiers={[padding({ all: 12 }), background(accent), font({ size: 11, weight: 'bold' }), foregroundStyle(BG)]}>REGISTRAR SERIE</Text>
            </Link>
            <Spacer />
            <Link destination="pulso://entreno">
              <Text modifiers={[padding({ all: 12 }), background(SURFACE), font({ size: 11, weight: 'semibold' }), foregroundStyle(TEXT_SECONDARY)]}>FINALIZAR EN APP</Text>
            </Link>
          </HStack>
        )}
      </VStack>
    </Link>
  );
}

export const pulsoEntrenoWidget = createWidget<WorkoutWidgetData, WorkoutWidgetConfiguration>(
  'PulsoEntrenoWidget',
  EntrenoWidgetLayout,
);
