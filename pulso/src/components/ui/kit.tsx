import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { AccessibilityRole, Insets, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { F, useColors } from '@/constants/colors';

// ── typography ───────────────────────────────────────────────────────────────

export function Label({ children, style }: { children: React.ReactNode; style?: object }) {
  const C = useColors();
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
  const C = useColors();
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
 * With "reduce motion" on, the pulse doesn't run at all.
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
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (active && !reduceMotion) {
      glow.set(withRepeat(
        withSequence(
          withTiming(1, { duration: period, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: period, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      ));
    } else {
      cancelAnimation(glow);
      glow.set(withTiming(0, { duration: 200 }));
    }
    return () => cancelAnimation(glow);
  }, [active, period, glow, reduceMotion]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: glow.get() * intensity }));

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

/** Extra hit area for isolated targets drawn smaller than 44 pt. Opt-in:
 *  packed controls (RPE chips, day tabs) would steal each other's taps. */
export const SMALL_TARGET_HIT_SLOP: Insets = { top: 8, bottom: 8, left: 8, right: 8 };

export function PressableScale({
  children, onPress, onLongPress, style, containerStyle, haptic = 'light', disabled, accessibilityLabel, accessibilityHint,
  accessibilityRole = 'button', selected, hitSlop,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: ViewStyle;
  /** Layout of the touch target itself (e.g. `flex: 1` in a row); `style` is the visual box. */
  containerStyle?: ViewStyle;
  haptic?: HapticKind;
  disabled?: boolean;
  /** Needed wherever the label is an icon or glyph ("✕", "✎") that a screen
   *  reader would otherwise announce as meaningless punctuation. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
  /** For tabs, segments and toggles — announced by screen readers. */
  selected?: boolean;
  hitSlop?: Insets;
}) {
  const C = useColors();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const [focused, setFocused] = useState(false);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, selected }}
      hitSlop={hitSlop}
      onPressIn={() => { if (!reduceMotion) scale.set(withSpring(0.96, { damping: 20, stiffness: 400 })); }}
      onPressOut={() => { if (!reduceMotion) scale.set(withSpring(1, { damping: 16, stiffness: 300 })); }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={() => {
        if (disabled) return;
        if (haptic !== 'none') fireHaptic(haptic);
        onPress?.();
      }}
      onLongPress={onLongPress && !disabled ? () => { fireHaptic('medium'); onLongPress(); } : undefined}
      disabled={disabled}
      style={({ pressed }) => ({
        ...containerStyle,
        opacity: disabled ? 0.6 : pressed && reduceMotion ? 0.7 : 1,
        // Keyboard / switch-access focus ring; touch never shows it.
        ...(focused ? { outlineWidth: 2, outlineColor: C.cyan, outlineStyle: 'solid' as const, outlineOffset: 2 } : null),
      })}
    >
      <Animated.View style={[animStyle, style]}>{children}</Animated.View>
    </Pressable>
  );
}

// ── segmented control ────────────────────────────────────────────────────────

/** Underlined segments (tabs, ranges, front/back). `compact` renders small
 *  inline text options, e.g. a 7D · 28D · 90D range next to a heading. */
export function Segmented<K extends string | number>({ options, value, onChange, accent, compact = false, style }: {
  options: { key: K; label: string; accessibilityLabel?: string }[];
  value: K;
  onChange: (key: K) => void;
  accent: string;
  compact?: boolean;
  style?: ViewStyle;
}) {
  const C = useColors();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        { flexDirection: 'row' },
        compact ? { gap: 4 } : { borderBottomWidth: 1, borderBottomColor: C.border },
        style,
      ]}
    >
      {options.map(option => {
        const selected = option.key === value;
        return (
          <PressableScale
            key={String(option.key)}
            accessibilityRole="tab"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            selected={selected}
            haptic={selected ? 'none' : 'light'}
            onPress={() => onChange(option.key)}
            hitSlop={compact ? SMALL_TARGET_HIT_SLOP : undefined}
            containerStyle={compact ? undefined : { flex: 1 }}
            style={compact
              ? { paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 2, borderBottomColor: selected ? accent : 'transparent' }
              : { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6, borderBottomWidth: 3, borderBottomColor: selected ? accent : 'transparent', marginBottom: -1 }}
          >
            <Text style={{
              fontFamily: selected ? F.monoBold : F.mono,
              fontSize: compact ? 10 : 11,
              letterSpacing: 1,
              color: selected ? C.textPrimary : C.textTertiary,
              textAlign: 'center',
            }}>
              {option.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
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
  const C = useColors();
  const w = useSharedValue(0);

  useEffect(() => {
    w.set(withTiming(Math.max(0, Math.min(1, fill)), { duration }));
  }, [fill, duration, w]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${w.get() * 100}%` }));

  return (
    <View style={{ height, backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
      <Animated.View style={[{ height: '100%', backgroundColor: color }, fillStyle]} />
    </View>
  );
}
