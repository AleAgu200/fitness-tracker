import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from '@/context/session';
import {
  getOnboardingProgress,
  type OnboardingStep,
  shouldShowOnboarding,
} from '@/db/onboarding';
import { syncAthleteProfile } from '@/lib/profile-sync';

const ONBOARDING_ROUTES: Record<OnboardingStep, string> = {
  account: '/(onboarding)/account',
  body: '/(onboarding)/body',
  goal: '/(onboarding)/goal',
  training: '/(onboarding)/training',
  nutrition: '/(onboarding)/nutrition',
  safety: '/(onboarding)/safety',
  review: '/(onboarding)/review',
  generating: '/(onboarding)/generating',
  results: '/(onboarding)/results',
};

export default function Index() {
  const { userId, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    let cancelled = false;

    async function routeFromSession() {
      if (!userId) {
        router.replace('/(auth)/login' as any);
        return;
      }

      try {
        try {
          await syncAthleteProfile(userId);
        } catch (error) {
          console.warn('[profile-sync] onboarding gate deferred', error);
        }
        if (cancelled) return;

        // Signup saves the athlete profile before starting onboarding. Trust an
        // explicit in-progress state before the legacy-activity skip heuristic,
        // otherwise a brand-new signup would be mistaken for an existing user.
        const progress = await getOnboardingProgress(userId);
        if (cancelled) return;
        if (progress.status === 'in_progress') {
          const step = progress.currentStep ?? 'account';
          router.replace(ONBOARDING_ROUTES[step] as any);
          return;
        }

        const showOnboarding = await shouldShowOnboarding(userId);
        if (cancelled) return;
        router.replace(showOnboarding ? '/(onboarding)/account' as any : '/hoy' as any);
      } catch (error) {
        console.error('[onboarding-gate]', error);
        if (!cancelled) router.replace('/hoy' as any);
      }
    }

    void routeFromSession();
    return () => { cancelled = true; };
  }, [loading, router, userId]);

  return null;
}
