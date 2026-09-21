import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PurchasesPackage } from 'react-native-purchases';

import { apiFetch } from '@/lib/api';
import {
  configurePurchases,
  getAvailablePackages,
  hasActiveEntitlement,
  logOutPurchases,
  purchasePackage,
  purchasesSupported,
  restorePurchases,
  type PurchaseOutcome,
} from '@/lib/purchases';
import { useSession } from '@/context/session';

interface BillingStatus {
  entitlement: { entitled: boolean; status: string | null; currentPeriodEndsAt: number | null };
  allowance: { allowed: boolean; entitled: boolean; freeUsed: number; freeLimit: number };
}

interface EntitlementValue {
  /** True when this athlete has PULSO Plus. Drives ad removal and paywall UI. */
  entitled: boolean;
  /** Whether another AI generation is available (subscription or free quota). */
  canGenerate: boolean;
  freeUsed: number;
  freeLimit: number;
  loading: boolean;
  packages: PurchasesPackage[];
  purchase: (item: PurchasesPackage) => Promise<PurchaseOutcome>;
  restore: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

const EntitlementContext = createContext<EntitlementValue>({
  entitled: false,
  canGenerate: true,
  freeUsed: 0,
  freeLimit: 1,
  loading: true,
  packages: [],
  purchase: async () => 'failed',
  restore: async () => false,
  refresh: async () => {},
});

export function useEntitlement(): EntitlementValue {
  return useContext(EntitlementContext);
}

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const { userId } = useSession();

  const [entitled, setEntitled] = useState(false);
  const [allowance, setAllowance] = useState({ allowed: true, freeUsed: 0, freeLimit: 1 });
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * The server is the source of truth for the quota, because it is what
   * actually authorizes generation. The local SDK answer is used as an
   * immediate fallback so the UI is not blocked on the network.
   */
  const refresh = useCallback(async () => {
    if (!userId) {
      setEntitled(false);
      setLoading(false);
      return;
    }
    const local = await hasActiveEntitlement();
    setEntitled(local);
    try {
      const status = await apiFetch<BillingStatus>('/api/billing/status');
      setEntitled(status.entitlement.entitled || local);
      setAllowance({
        allowed: status.allowance.allowed,
        freeUsed: status.allowance.freeUsed,
        freeLimit: status.allowance.freeLimit,
      });
    } catch {
      // Offline: keep whatever the store told us. Being generous here only
      // affects local UI — the server still gates the paid work itself.
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) {
        await logOutPurchases();
        if (!cancelled) { setEntitled(false); setPackages([]); setLoading(false); }
        return;
      }
      await configurePurchases(userId);
      if (cancelled) return;
      const available = await getAvailablePackages();
      if (!cancelled) setPackages(available);
      await refresh();
    })();
    return () => { cancelled = true; };
  }, [userId, refresh]);

  /**
   * After a purchase, ask the server to re-read RevenueCat instead of waiting
   * for the webhook — an athlete who just paid should not be refused.
   */
  const syncServer = useCallback(async () => {
    try {
      const status = await apiFetch<BillingStatus>('/api/billing/status', { method: 'POST' });
      setEntitled(status.entitlement.entitled);
      setAllowance({
        allowed: status.allowance.allowed,
        freeUsed: status.allowance.freeUsed,
        freeLimit: status.allowance.freeLimit,
      });
    } catch {
      await refresh();
    }
  }, [refresh]);

  const purchase = useCallback(async (item: PurchasesPackage) => {
    const outcome = await purchasePackage(item);
    if (outcome === 'purchased') {
      setEntitled(true);
      await syncServer();
    }
    return outcome;
  }, [syncServer]);

  const restore = useCallback(async () => {
    const restored = await restorePurchases();
    if (restored) {
      setEntitled(true);
      await syncServer();
    }
    return restored;
  }, [syncServer]);

  const value = useMemo<EntitlementValue>(() => ({
    entitled,
    canGenerate: entitled || allowance.allowed,
    freeUsed: allowance.freeUsed,
    freeLimit: allowance.freeLimit,
    // Without the native module there is nothing to wait for.
    loading: loading && purchasesSupported,
    packages,
    purchase,
    restore,
    refresh,
  }), [entitled, allowance, loading, packages, purchase, restore, refresh]);

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}
