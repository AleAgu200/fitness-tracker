import * as Haptics from 'expo-haptics';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { C, F } from '@/constants/colors';

// ── typography ───────────────────────────────────────────────────────────────

export function Label({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1.4, color: C.textTertiary, textTransform: 'uppercase', ...style }}>
      {children}
    </Text>
  );
}

// ── entrance card ────────────────────────────────────────────────────────────

/** Card with a staggered fade-in-down entrance (no bounce). `index` controls the stagger. */
export function Card({ children, style, index = 0 }: {
  children: React.ReactNode;
  style?: ViewStyle;
  index?: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(280).delay(index * 50).easing(Easing.out(Easing.cubic))}
      style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, ...style }}
    >
      {children}
    </Animated.View>
  );
}

// ── pulsing glow overlay ─────────────────────────────────────────────────────

/**
 * Wraps content with a soft looping light pulse in the accent color.
 * The overlay never intercepts touches; set `intensity` (max overlay opacity) to taste.
 */
export function GlowPulse({ children, color, style, active = true, intensity = 0.16, period = 1000 }: {
  children: React.ReactNode;
  color: string;
  style?: ViewStyle;
  active?: boolean;
  intensity?: number;
  period?: number;
}) {
  const glow = useSharedValue(0);

  useEffect(() => {
    if (active) {
      glow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: period, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: period, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      );
    } else {
      cancelAnimation(glow);
      glow.value = withTiming(0, { duration: 200 });
    }
    return () => cancelAnimation(glow);
  }, [active, period, glow]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: glow.value * intensity }));

  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      {children}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: color }, overlayStyle]}
      />
    </View>
  );
}

// ── pressable with scale + haptics ───────────────────────────────────────────

type HapticKind = 'light' | 'medium' | 'success' | 'heavy' | 'none';

function fireHaptic(kind: HapticKind) {
  try {
    if (kind === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (kind === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else if (kind === 'heavy') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    else if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // haptics unavailable (web/simulator) — ignore
  }
}

export function PressableScale({ children, onPress, style, haptic = 'light', disabled }: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  haptic?: HapticKind;
  disabled?: boolean;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPressIn={() => { scale.value = withSpring(0.96, { damping: 20, stiffness: 400 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 16, stiffness: 300 }); }}
      onPress={() => {
        if (disabled) return;
        if (haptic !== 'none') fireHaptic(haptic);
        onPress?.();
      }}
      disabled={disabled}
      style={{ opacity: disabled ? 0.6 : 1 }}
    >
      <Animated.View style={[animStyle, style]}>{children}</Animated.View>
    </Pressable>
  );
}

// ── animated progress bar ────────────────────────────────────────────────────

/** Horizontal bar whose fill animates smoothly to `fill` (0..1). */
export function AnimatedBar({ fill, color, height = 8, duration = 500 }: {
  fill: number;
  color: string;
  height?: number;
  duration?: number;
}) {
  const w = useSharedValue(0);

  useEffect(() => {
    w.value = withTiming(Math.max(0, Math.min(1, fill)), { duration });
  }, [fill, duration, w]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));

  return (
    <View style={{ height, backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
      <Animated.View style={[{ height: '100%', backgroundColor: color }, fillStyle]} />
    </View>
  );
}
