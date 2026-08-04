import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Polyline } from 'react-native-svg';

import { BRAND } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';

// Full-screen bolts in a normalized 0–100 space, stretched to the viewport.
// Each crosses the screen from above the top edge to below the bottom edge.
interface BoltSpec {
  points: string;
  color: string;
  delay: number;  // ms before first flash
  rest: number;   // ms of darkness between flashes
  peak: number;   // max opacity
}

function boltsFor(accent: string): BoltSpec[] {
  return [
    // top-left → bottom-right
    { points: '16,-5 30,20 23,27 44,52 37,59 62,86 55,105', color: accent, delay: 0, rest: 3600, peak: 0.65 },
    // top-right → bottom-left
    { points: '84,-5 68,22 76,30 50,56 58,64 30,90 36,105', color: BRAND.cyan, delay: 1400, rest: 4400, peak: 0.5 },
    // center, near-vertical
    { points: '46,-5 56,24 47,32 60,58 51,66 63,105', color: accent, delay: 2600, rest: 5200, peak: 0.45 },
    // far left, steep
    { points: '4,-5 14,30 8,38 20,70 13,78 22,105', color: BRAND.cyan, delay: 3400, rest: 4800, peak: 0.4 },
  ];
}

// A separate small pool of paths for on-demand transient strikes (typing/charging feedback),
// kept distinct from the ambient bolts above so triggered strikes read as a different, sharper event.
const TRANSIENT_PATHS = [
  '10,-5 26,26 19,33 40,60 33,67 54,94 58,105',
  '90,-5 72,26 80,34 54,60 62,68 40,94 34,105',
  '50,-5 42,30 51,37 34,64 43,71 30,105',
  '70,-5 78,28 69,35 82,62 73,69 86,105',
];

/** One full-screen bolt that flickers like real lightning: two quick flashes, then fades out */
function Bolt({ spec }: { spec: BoltSpec }) {
  const op = useSharedValue(0);

  useEffect(() => {
    op.value = withDelay(
      spec.delay,
      withRepeat(
        withSequence(
          withTiming(spec.peak,       { duration: 80 }),
          withTiming(spec.peak * 0.25,{ duration: 110 }),
          withTiming(spec.peak * 0.8, { duration: 70 }),
          withTiming(0,               { duration: 900, easing: Easing.out(Easing.quad) }),
          withTiming(0,               { duration: spec.rest }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(op);
  }, [spec, op]);

  const style = useAnimatedStyle(() => ({ opacity: op.value }));

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* halo */}
        <Polyline
          points={spec.points}
          stroke={spec.color}
          strokeOpacity={0.2}
          strokeWidth={10}
          vectorEffect="non-scaling-stroke"
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* core */}
        <Polyline
          points={spec.points}
          stroke={spec.color}
          strokeWidth={2.5}
          vectorEffect="non-scaling-stroke"
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}

/** One-shot bolt for on-demand strikes: flickers once then calls back to remove itself. */
function TransientBolt({ points, color, peak, onDone }: {
  points: string;
  color: string;
  peak: number;
  onDone: () => void;
}) {
  const op = useSharedValue(0);

  useEffect(() => {
    op.value = withSequence(
      withTiming(peak,        { duration: 45 }),
      withTiming(peak * 0.2,  { duration: 70 }),
      withTiming(peak * 0.75, { duration: 45 }),
      withTiming(0, { duration: 260, easing: Easing.out(Easing.quad) }, (finished) => {
        if (finished) runOnJS(onDone)();
      }),
    );
    return () => cancelAnimation(op);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: op.value }));

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Polyline
          points={points}
          stroke={color}
          strokeOpacity={0.25}
          strokeWidth={12}
          vectorEffect="non-scaling-stroke"
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Polyline
          points={points}
          stroke={color}
          strokeWidth={3}
          vectorEffect="non-scaling-stroke"
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}

export type LightningHandle = {
  /** Fire one extra, sharper bolt on top of the ambient storm — use for typing/focus/charging feedback. */
  pulse: (color?: string, peak?: number) => void;
  /** Full-screen flash covering the viewport — use for a decisive success/error moment. */
  flashAll: (color?: string, duration?: number) => void;
};

type TransientEntry = { id: number; points: string; color: string; peak: number };

/** Full-screen background of lightning bolts crossing the viewport. Place behind content. */
export const LightningBackground = forwardRef<LightningHandle>(function LightningBackground(_props, ref) {
  const { accent } = usePreferences();
  const bolts = useMemo(() => boltsFor(accent), [accent]);
  const [transients, setTransients] = useState<TransientEntry[]>([]);
  const nextId = useRef(0);
  const flashOpacity = useSharedValue(0);
  const [flashColor, setFlashColor] = useState<string>(accent);

  const removeTransient = useCallback((id: number) => {
    setTransients((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useImperativeHandle(ref, () => ({
    pulse(color = accent, peak = 0.55) {
      const id = nextId.current++;
      const points = TRANSIENT_PATHS[id % TRANSIENT_PATHS.length];
      setTransients((prev) => [...prev, { id, points, color, peak }]);
    },
    flashAll(color = accent, duration = 260) {
      setFlashColor(color);
      flashOpacity.value = withSequence(
        withTiming(0.94, { duration: Math.round(duration * 0.28) }),
        withTiming(0, { duration: Math.round(duration * 0.72), easing: Easing.out(Easing.quad) }),
      );
    },
  }), [flashOpacity, accent]);

  const flashStyle = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      {bolts.map((b, i) => (
        <Bolt key={i} spec={b} />
      ))}
      {transients.map((t) => (
        <TransientBolt
          key={t.id}
          points={t.points}
          color={t.color}
          peak={t.peak}
          onDone={() => removeTransient(t.id)}
        />
      ))}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: flashColor }, flashStyle]} />
    </View>
  );
});
