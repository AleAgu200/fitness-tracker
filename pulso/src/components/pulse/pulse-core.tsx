import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { AnimatedBar, Label, PressableScale } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import type { PulseCore as PulseCoreModel } from '@/lib/pulse-engine';
import { CORE_COMPONENT_LABELS, CORE_MESSAGES, toneColor } from './labels';

const OUTER = 164;
const MIDDLE = 124;
const INNER = 80;

/**
 * The Núcleo PULSO: state and continuity, not a score. The centre shows a
 * concrete count (sessions this week); momentum lives in the detail, opened by
 * tapping. Only activity states glow, and never with "reduce motion" on.
 */
export function PulseCore({ core, accent }: { core: PulseCoreModel; accent: string }) {
  const C = useColors();
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const color = toneColor(core.tone, accent, C);
  const idle = core.tone === 'idle';

  const halo = useSharedValue(0);
  useEffect(() => {
    if (core.halo && !reduceMotion) {
      halo.set(withRepeat(
        withSequence(
          withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      ));
    } else {
      cancelAnimation(halo);
      halo.set(0);
    }
    return () => cancelAnimation(halo);
  }, [core.halo, reduceMotion, halo]);
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + halo.get() * 0.45,
    transform: [{ scale: 1 + halo.get() * 0.025 }],
  }));

  const center = core.weekTarget != null ? `${core.weekSessions}/${core.weekTarget}` : String(core.weekSessions);
  const summary = core.weekTarget != null
    ? `${core.weekSessions} de ${core.weekTarget} sesiones esta semana`
    : `${core.weekSessions} sesiones esta semana`;

  return (
    <View style={{ alignItems: 'center' }}>
      <PressableScale
        onPress={() => setExpanded(open => !open)}
        haptic="light"
        accessibilityLabel={`Núcleo PULSO: ${core.state.toLowerCase()}. ${summary}.`}
        accessibilityHint={expanded ? 'Oculta el detalle del núcleo' : 'Muestra el detalle del núcleo'}
        style={{ alignItems: 'center', paddingTop: 4 }}
      >
        <Label style={{ color, marginBottom: 12 }}>{`ESTADO · ${core.state}`}</Label>
        <View style={{ width: OUTER, height: OUTER, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            style={[{
              position: 'absolute', width: OUTER, height: OUTER, borderRadius: OUTER / 2,
              borderWidth: 1, borderColor: color, backgroundColor: withAlpha(idle ? C.textTertiary : color, 0.07),
            }, haloStyle]}
          />
          <View style={{
            width: MIDDLE, height: MIDDLE, borderRadius: MIDDLE / 2, borderWidth: 2,
            borderColor: idle ? C.border : color, alignItems: 'center', justifyContent: 'center',
          }}>
            <View style={{
              width: INNER, height: INNER, borderRadius: INNER / 2,
              backgroundColor: idle ? C.bgEl : color, alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontFamily: F.monoXBold, fontSize: 22, color: idle ? C.textSecondary : C.onAccent }}>
                {center}
              </Text>
              <Text style={{ fontFamily: F.mono, fontSize: 8, letterSpacing: 1.2, color: idle ? C.textTertiary : C.onAccent }}>
                SEMANA
              </Text>
            </View>
          </View>
        </View>
      </PressableScale>
      <Text style={{ fontFamily: F.inter, fontSize: 13, lineHeight: 19, color: C.textSecondary, textAlign: 'center', maxWidth: 290, marginTop: 12 }}>
        {CORE_MESSAGES[core.state]}
      </Text>

      {expanded && (
        <Animated.View entering={FadeIn.duration(180)} style={{ alignSelf: 'stretch', marginTop: 14, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <Label>MOMENTUM · 7 DÍAS</Label>
            <Text style={{ fontFamily: F.monoXBold, fontSize: 20, color }}>{core.momentum}</Text>
          </View>
          {core.components.map(component => (
            <View key={component.key} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Label>{CORE_COMPONENT_LABELS[component.key]}</Label>
                <Label>{`${component.value}%`}</Label>
              </View>
              <AnimatedBar fill={component.value / 100} color={idle ? C.textTertiary : color} height={5} />
            </View>
          ))}
          <Text style={{ fontFamily: F.inter, fontSize: 11, lineHeight: 16, color: C.textTertiary, marginTop: 2 }}>
            Es una lectura de tu constancia reciente, no una nota. Se recalcula con cada registro.
          </Text>
        </Animated.View>
      )}
    </View>
  );
}
