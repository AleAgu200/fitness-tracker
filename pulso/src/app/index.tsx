import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from '@/context/session';
import {
  getOnboardingProgress,
  type OnboardingStep,
  shouldShowOnboarding,
} from '@/db/onboarding';
import { getPendingDeletion } from '@/lib/account';
import { routeRecovery } from '@/lib/account-recovery';
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
        // Logging in during the deletion grace period is how an athlete
        // changes their mind: offer that before anything else loads.
        try {
          const pending = await getPendingDeletion();
          if (cancelled) return;
          if (pending) {
            router.replace({ pathname: '/cuenta-en-borrado', params: { purgeAfter: String(pending.purgeAfter) } });
            return;
          }
        } catch (error) {
          console.warn('[account-deletion] status check deferred', error);
        }

        // A new phone for a returning athlete: offer their personal backup
        // before anything treats them as new. A failed lookup is a retry
        // screen, never onboarding.
        const recovery = await routeRecovery(userId);
        if (cancelled) return;
        if (recovery.kind === 'offer_restore') {
          router.replace({
            pathname: '/recuperar',
            params: { state: 'offer', revision: String(recovery.revision), createdAt: String(recovery.createdAt), totalRows: String(recovery.totalRows) },
          });
          return;
        }
        if (recovery.kind === 'offer_sync') {
          router.replace({ pathname: '/recuperar', params: { state: 'sync', totalRows: String(recovery.records) } });
          return;
        }
        if (recovery.kind === 'retry') {
          router.replace({ pathname: '/recuperar', params: { state: 'retry' } });
          return;
        }

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
        // A first launch opens with the introduction; a resumed wizard skips it.
        router.replace(showOnboarding ? '/(onboarding)/welcome' as any : '/hoy' as any);
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
