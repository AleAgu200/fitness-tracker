import { WorkoutWidgetData } from '@/widgets/workout-widget-types';

/**
 * Non-iOS stub. The real widget (`entreno-widget-registry.ios.ts`) is only ever
 * bundled into the iOS build — Metro picks this file for every other platform.
 */
export const pulsoEntrenoWidget: { updateSnapshot: (props: WorkoutWidgetData) => void } | null = null;
