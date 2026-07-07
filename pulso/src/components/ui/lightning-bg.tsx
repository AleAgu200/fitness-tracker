import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Polyline } from 'react-native-svg';

import { C } from '@/constants/colors';

// Full-screen bolts in a normalized 0–100 space, stretched to the viewport.
// Each crosses the screen from above the top edge to below the bottom edge.
interface BoltSpec {
  points: string;
  color: string;
  delay: number;  // ms before first flash
  rest: number;   // ms of darkness between flashes
  peak: number;   // max opacity
}

const BOLTS: BoltSpec[] = [
  // top-left → bottom-right
  { points: '16,-5 30,20 23,27 44,52 37,59 62,86 55,105', color: C.yellow, delay: 0, rest: 3600, peak: 0.65 },
  // top-right → bottom-left
  { points: '84,-5 68,22 76,30 50,56 58,64 30,90 36,105', color: C.cyan, delay: 1400, rest: 4400, peak: 0.5 },
  // center, near-vertical
  { points: '46,-5 56,24 47,32 60,58 51,66 63,105', color: C.yellow, delay: 2600, rest: 5200, peak: 0.45 },
  // far left, steep
  { points: '4,-5 14,30 8,38 20,70 13,78 22,105', color: C.cyan, delay: 3400, rest: 4800, peak: 0.4 },
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

/** Full-screen background of lightning bolts crossing the viewport. Place behind content. */
export function LightningBackground() {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      {BOLTS.map((b, i) => (
        <Bolt key={i} spec={b} />
      ))}
    </View>
  );
}
