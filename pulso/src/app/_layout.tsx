import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
  JetBrainsMono_800ExtraBold,
} from '@expo-google-fonts/jetbrains-mono';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';
import { Stack, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { NotificationBootstrap } from '@/components/notification-bootstrap';
import { WatchBridge } from '@/components/watch-bridge';
import { AppProvider } from '@/context/app-state';
import { EntitlementProvider } from '@/context/entitlement';
import { OnboardingGenerationProvider } from '@/context/onboarding-generation';
import { PreferencesProvider } from '@/context/preferences';
import { SessionProvider } from '@/context/session';
import { runMigrations } from '@/db/migrate';
import { initializeAds } from '@/lib/ads';
import { initCrashReporting, wrapRoot } from '@/lib/crash-reporting';
import { watchPrivacyRationale } from '@/lib/legal';

// First thing at module load, so a failure during startup is reported too.
initCrashReporting();

SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const [dbReady, setDbReady] = useState(false);

  const [fontsLoaded] = useFonts({
    SpaceGrotesk_700Bold,
    SpaceGrotesk_500Medium,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
    JetBrainsMono_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  useEffect(() => {
    runMigrations()
      .then(() => setDbReady(true))
      .catch((e) => {
        console.error('[migrations]', e);
        setDbReady(true); // let the app render even if migrations fail
      });
  }, []);

  // Warm the ads SDK at launch so the ENTRENO gate has a filled ad waiting
  // instead of burning its load timeout on cold-starting the SDK. Never blocks
  // render — initializeAds swallows its own failures.
  useEffect(() => {
    initializeAds();
  }, []);

  useEffect(() => {
    if (fontsLoaded && dbReady) SplashScreen.hideAsync();
  }, [fontsLoaded, dbReady]);

  // Health Connect's "privacy policy" link opens the app with a rationale action.
  useEffect(() => {
    if (!fontsLoaded || !dbReady) return;
    return watchPrivacyRationale();
  }, [fontsLoaded, dbReady]);

  if (!fontsLoaded || !dbReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PreferencesProvider>
        <SessionProvider>
          <EntitlementProvider>
          <OnboardingGenerationProvider>
            <NotificationBootstrap />
            <AppProvider>
              <WatchBridge />
              <StatusBar style="auto" />
              <Stack screenOptions={{ headerShown: false }} />
            </AppProvider>
          </OnboardingGenerationProvider>
          </EntitlementProvider>
        </SessionProvider>
      </PreferencesProvider>
    </GestureHandlerRootView>
  );
}

export default wrapRoot(RootLayout);
