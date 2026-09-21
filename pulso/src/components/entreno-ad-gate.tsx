import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useRewardedInterstitialAd } from 'react-native-google-mobile-ads';

import { F, useColors, withAlpha } from '@/constants/colors';
import { useEntitlement } from '@/context/entitlement';
import { usePreferences } from '@/context/preferences';
import { adsSupported, ENTRENO_AD_UNIT_ID, initializeAds } from '@/lib/ads';

/** Give up and let the athlete train if no ad has filled by then. */
const LOAD_TIMEOUT_MS = 8000;

/**
 * Module scope, not state: "once per session" means once per app launch, so the
 * flag has to outlive the screen unmounting when the tab is switched away.
 */
let consumedThisSession = false;

/**
 * Rewarded interstitial shown the first time the athlete opens ENTRENO after
 * launching the app.
 *
 * Deliberately fail-open: an ad that errors, never fills, or takes longer than
 * LOAD_TIMEOUT_MS unlocks the screen anyway. Being unable to reach your workout
 * because you are on the subway with no signal would be a far worse bug than a
 * missed impression. Either way the session is marked consumed, so a failed
 * attempt doesn't re-trigger on every tab switch.
 */
export function EntrenoAdGate() {
  const C = useColors();
  const { accent } = usePreferences();
  const { entitled, loading: entitlementLoading } = useEntitlement();

  // Subscribers never see the gate. While entitlement is still resolving we do
  // not gate either: briefly missing an impression is far better than showing
  // an ad to someone who paid to remove them.
  const [gated, setGated] = useState(() => adsSupported && !consumedThisSession);
  const [adReady, setAdReady] = useState(false);
  // Once we've let the athlete through, showing the ad late would yank them out
  // of a set they already started — so a resolved gate is permanently inert.
  const resolved = useRef(false);

  const suppressed = entitled || entitlementLoading;

  const { isLoaded, isClosed, error, load, show } = useRewardedInterstitialAd(
    gated && !suppressed ? ENTRENO_AD_UNIT_ID : null,
  );

  const release = useCallback(() => {
    if (resolved.current) return;
    resolved.current = true;
    consumedThisSession = true;
    setGated(false);
  }, []);

  // Start the SDK, then request the ad. Only runs on the focus that actually
  // gates — later focuses see `gated === false` and skip straight past.
  // An entitlement that resolves while the gate is up releases it immediately.
  useEffect(() => {
    if (entitled) release();
  }, [entitled, release]);

  useFocusEffect(
    useCallback(() => {
      if (!gated || suppressed || resolved.current) return;

      let cancelled = false;
      initializeAds().then(() => {
        if (!cancelled) setAdReady(true);
      });

      const timeout = setTimeout(release, LOAD_TIMEOUT_MS);
      return () => {
        cancelled = true;
        clearTimeout(timeout);
      };
    }, [gated, suppressed, release]),
  );

  useEffect(() => {
    if (adReady && !resolved.current) load();
  }, [adReady, load]);

  useEffect(() => {
    if (isLoaded && !resolved.current) show();
  }, [isLoaded, show]);

  // `isClosed` covers both outcomes we care about — the athlete watched it
  // through (reward earned) or dismissed it early. Neither should keep them out.
  useEffect(() => {
    if (isClosed) release();
  }, [isClosed, release]);

  useEffect(() => {
    if (error) {
      console.warn('[ads] entreno rewarded interstitial', error.message);
      release();
    }
  }, [error, release]);

  if (!gated || suppressed) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(220)}
      pointerEvents="auto"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: C.bg,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        paddingHorizontal: 32,
        zIndex: 100,
      }}
    >
      <View
        style={{
          borderWidth: 1,
          borderColor: withAlpha(accent, 0.35),
          backgroundColor: withAlpha(accent, 0.06),
          paddingHorizontal: 14,
          paddingVertical: 6,
        }}
      >
        <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.4, color: accent }}>
          PATROCINADO
        </Text>
      </View>

      <Text
        style={{
          fontFamily: F.grotesk,
          fontSize: 22,
          lineHeight: 28,
          color: C.textPrimary,
          textAlign: 'center',
        }}
      >
        Preparando tu entreno
      </Text>

      <Text
        style={{
          fontFamily: F.inter,
          fontSize: 13,
          lineHeight: 20,
          color: C.textSecondary,
          textAlign: 'center',
        }}
      >
        Un anuncio corto mantiene PULSO gratis. Empezás a entrenar en cuanto termine.
      </Text>

      <ActivityIndicator color={accent} />
    </Animated.View>
  );
}
