import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Paywall } from '@/components/paywall';
import { GlowPulse, PressableScale } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import { useEntitlement } from '@/context/entitlement';
import { usePreferences } from '@/context/preferences';

/**
 * Permanent entry point to PULSO Plus.
 *
 * The paywall otherwise only surfaces when a generation is refused, which is
 * the worst moment to discover the subscription exists. This gives it a place
 * the athlete can reach deliberately.
 */
export function PlusBanner() {
  const C = useColors();
  const { accent } = usePreferences();
  const { entitled, loading, freeUsed, freeLimit } = useEntitlement();
  const [paywallOpen, setPaywallOpen] = useState(false);

  // Nothing to say until we know which side of the paywall they are on:
  // flashing "activate" at an existing subscriber would be worse than a gap.
  if (loading) return null;

  if (entitled) {
    return (
      <Animated.View
        entering={FadeInDown.duration(280).delay(150)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderWidth: 1,
          borderColor: withAlpha(accent, 0.35),
          backgroundColor: withAlpha(accent, 0.05),
          padding: 15,
          marginTop: 9,
        }}
      >
        <Image
          source={require('../../assets/expo.icon/Assets/1000399110(1).png')}
          style={{ width: 30, height: 30 }}
          contentFit="contain"
          accessibilityLabel="PULSO"
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.3, color: accent }}>
            PULSO PLUS · ACTIVO
          </Text>
          <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 17, color: C.textSecondary, marginTop: 4 }}>
            Sin anuncios y con planes de IA sin límite.
          </Text>
        </View>
      </Animated.View>
    );
  }

  const freeLeft = Math.max(0, freeLimit - freeUsed);

  return (
    <>
      <Animated.View entering={FadeInDown.duration(280).delay(150)} style={{ marginTop: 9 }}>
        <GlowPulse color={accent} intensity={0.13} period={2600}>
          <PressableScale
            onPress={() => setPaywallOpen(true)}
            haptic="medium"
            accessibilityLabel="Eliminar anuncios y activar funciones de inteligencia artificial"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              borderWidth: 1,
              borderColor: withAlpha(accent, 0.5),
              backgroundColor: withAlpha(accent, 0.07),
              padding: 15,
            }}
          >
            <Image
              source={require('../../assets/expo.icon/Assets/1000399110(1).png')}
              style={{ width: 34, height: 34 }}
              contentFit="contain"
              accessibilityLabel=""
            />
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ fontFamily: F.interSemi, fontSize: 15, color: C.textPrimary }}>
                Eliminar anuncios y activar IA
              </Text>
              <Text style={{ fontFamily: F.inter, fontSize: 11, lineHeight: 16, color: C.textTertiary, marginTop: 3 }}>
                {freeLeft > 0
                  ? `Te queda ${freeLeft} plan con IA incluido. Con Plus son ilimitados y sin anuncios.`
                  : 'Planes con IA sin límite, sin anuncios y con tu progreso completo.'}
              </Text>
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: 13, color: accent }}>→</Text>
          </PressableScale>
        </GlowPulse>
      </Animated.View>

      <Paywall visible={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </>
  );
}
