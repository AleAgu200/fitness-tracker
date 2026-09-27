import { purgeDueAccounts } from "@/lib/account";

const INTERVAL_MS = 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 60 * 1000;

const state = globalThis as typeof globalThis & { pulsoAccountPurge?: ReturnType<typeof setInterval> };

async function sweep() {
  try {
    const purged = await purgeDueAccounts();
    if (purged) console.info(`[account-purge] purged ${purged} account(s)`);
  } catch (error) {
    console.error("[account-purge] sweep failed", error);
  }
}

/**
 * Hourly in-process sweep for accounts whose deletion grace period ended. The
 * server is a single long-lived process (see infra/ec2-stack.yaml), so no
 * external cron is needed; purges are claimed per row, so an overlapping run
 * elsewhere (scripts/purge-deleted-accounts.ts) is harmless.
 */
export function startAccountPurgeScheduler() {
  if (state.pulsoAccountPurge) return; // dev hot reload re-runs register()
  setTimeout(() => void sweep(), FIRST_RUN_DELAY_MS).unref();
  state.pulsoAccountPurge = setInterval(() => void sweep(), INTERVAL_MS);
  state.pulsoAccountPurge.unref();
}
