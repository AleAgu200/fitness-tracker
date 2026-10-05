import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useInterstitialAd, useRewardedInterstitialAd } from 'react-native-google-mobile-ads';

import { F, useColors, withAlpha } from '@/constants/colors';
import { useEntitlement } from '@/context/entitlement';
import { usePreferences } from '@/context/preferences';
import { adForTabFocus, recordAdShown } from '@/lib/ad-config';
import type { AdPlacement, AdPlacementConfig } from '@/lib/ad-rules';
import { adsSupported, adUnitFor, initializeAds } from '@/lib/ads';

/** Give up and let the athlete through if no ad has filled by then. */
const LOAD_TIMEOUT_MS = 8000;

const COPY: Record<AdPlacement, { title: string; body: string }> = {
  hoy: { title: 'Un momento', body: 'Un anuncio corto mantiene PULSO gratis.' },
  dieta: { title: 'Un momento', body: 'Un anuncio corto mantiene PULSO gratis.' },
  entreno: { title: 'Preparando tu entreno', body: 'Un anuncio corto mantiene PULSO gratis. Empezás a entrenar en cuanto termine.' },
  perfil: { title: 'Un momento', body: 'Un anuncio corto mantiene PULSO gratis.' },
};

/**
 * Full-screen ad when the athlete switches to this tab, as the admin panel
 * configures it (which tabs, how often, which ad unit). Plus subscribers never see
 * it. Deliberately fail-open: an ad that errors or takes longer than
 * LOAD_TIMEOUT_MS lets the athlete through, and leaving the tab cancels it.
 */
export function TabAdGate({ placement }: { placement: AdPlacement }) {
  const { entitled, loading } = useEntitlement();
  const allowed = !entitled && !loading;
  const [pending, setPending] = useState<AdPlacementConfig | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!adsSupported) return;
      let active = true;
      void adForTabFocus(placement, allowed).then(ad => {
        if (active && ad) setPending(ad);
      });
      return () => {
        active = false;
        setPending(null);
      };
    }, [placement, allowed]),
  );

  if (!pending) return null;
  const props = { placement, unitId: adUnitFor(pending.format, pending.adUnitId), onDone: () => setPending(null) };
  return pending.format === 'interstitial'
    ? <InterstitialRunner {...props} />
    : <RewardedInterstitialRunner {...props} />;
}

interface RunnerProps {
  placement: AdPlacement;
  unitId: string;
  onDone: () => void;
}

function InterstitialRunner(props: RunnerProps) {
  const ad = useInterstitialAd(props.unitId);
  return <AdOverlay {...props} ad={ad} skippable={false} />;
}

/** The rewarded format must let the athlete opt out before the ad starts. */
function RewardedInterstitialRunner(props: RunnerProps) {
  const ad = useRewardedInterstitialAd(props.unitId);
  return <AdOverlay {...props} ad={ad} skippable />;
}

function AdOverlay({ placement, onDone, ad, skippable }: RunnerProps & {
  ad: ReturnType<typeof useInterstitialAd>;
  skippable: boolean;
}) {
  const C = useColors();
  const { accent } = usePreferences();
  const { isLoaded, isOpened, isClosed, error, load, show } = ad;
  const finished = useRef(false);
  const counted = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    let cancelled = false;
    initializeAds().then(() => {
      if (!cancelled) load();
    });
    const timeout = setTimeout(() => {
      if (!counted.current) finish();
    }, LOAD_TIMEOUT_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [load, finish]);

  useEffect(() => {
    if (isLoaded && !finished.current) show();
  }, [isLoaded, show]);

  useEffect(() => {
    if (isOpened && !counted.current) {
      counted.current = true;
      void recordAdShown();
    }
  }, [isOpened]);

  useEffect(() => {
    if (isClosed) finish();
  }, [isClosed, finish]);

  useEffect(() => {
    if (error) {
      console.warn(`[ads] ${placement}`, error.message);
      finish();
    }
  }, [error, finish, placement]);

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(220)}
      pointerEvents="auto"
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100,
        backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 32,
      }}
    >
      <View style={{ borderWidth: 1, borderColor: withAlpha(accent, 0.35), backgroundColor: withAlpha(accent, 0.06), paddingHorizontal: 14, paddingVertical: 6 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.4, color: accent }}>PATROCINADO</Text>
      </View>
      <Text style={{ fontFamily: F.grotesk, fontSize: 22, lineHeight: 28, color: C.textPrimary, textAlign: 'center' }}>
        {COPY[placement].title}
      </Text>
      <Text style={{ fontFamily: F.inter, fontSize: 13, lineHeight: 20, color: C.textSecondary, textAlign: 'center' }}>
        {COPY[placement].body}
      </Text>
      <ActivityIndicator color={accent} />
      {skippable && (
        <Pressable onPress={finish} accessibilityRole="button" hitSlop={8} style={{ paddingVertical: 8, paddingHorizontal: 16 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 1, color: C.textSecondary }}>SALTAR</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}
