// Runtime side of the ad rules: the admin panel's config (fetched and cached) and
// this phone's counters. Every failure falls back silently: ads never block the app.

import * as SecureStore from 'expo-secure-store';

import {
  type AdConfig,
  type AdDeviceState,
  type AdPlacement,
  type AdPlacementConfig,
  type AdSessionState,
  DEFAULT_AD_CONFIG,
  EMPTY_DEVICE_STATE,
  EMPTY_SESSION_STATE,
  onAdShown,
  onTabFocus,
  sanitizeAdConfig,
} from './ad-rules';
import { SERVER_URL } from './auth-client';

const CONFIG_KEY = 'pulso_ads_config';
const STATE_KEY = 'pulso_ads_state';
/** The server caches for five minutes; re-asking hourly is plenty for an admin change. */
const REFRESH_MS = 60 * 60_000;

let config: AdConfig = DEFAULT_AD_CONFIG;
let fetchedAt = 0;
let refreshing: Promise<void> | null = null;
let device: AdDeviceState | null = null;
let session: AdSessionState = EMPTY_SESSION_STATE;

function localDay(now: number): string {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function readJson(key: string): Promise<unknown> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  SecureStore.setItemAsync(key, JSON.stringify(value)).catch(() => {});
}

/** Loads the cached config right away, then asks the server for a fresh one. */
export function refreshAdConfig(force = false): Promise<void> {
  if (refreshing) return refreshing;
  if (!force && Date.now() - fetchedAt < REFRESH_MS) return Promise.resolve();
  refreshing = (async () => {
    if (!fetchedAt) {
      const cached = await readJson(CONFIG_KEY);
      if (cached) config = sanitizeAdConfig(cached);
    }
    try {
      const response = await fetch(`${SERVER_URL}/api/ads/config`);
      if (response.ok) {
        const fresh = await response.json();
        config = sanitizeAdConfig(fresh);
        writeJson(CONFIG_KEY, fresh);
      }
      fetchedAt = Date.now();
    } catch {
      // Offline: keep the cached (or default) config and try again next time.
    }
  })().finally(() => { refreshing = null; });
  return refreshing;
}

async function loadDevice(): Promise<AdDeviceState> {
  if (device) return device;
  const stored = await readJson(STATE_KEY) as Partial<AdDeviceState> | null;
  device = stored && typeof stored === 'object'
    ? { ...EMPTY_DEVICE_STATE, ...stored, opens: { ...(stored.opens ?? {}) } }
    : EMPTY_DEVICE_STATE;
  return device;
}

/** A tab gained focus: returns the ad to show, if any, and records the opening. */
export async function adForTabFocus(placement: AdPlacement, allowed: boolean): Promise<AdPlacementConfig | null> {
  void refreshAdConfig();
  const now = Date.now();
  const result = onTabFocus({ config, placement, device: await loadDevice(), session, allowed, now, today: localDay(now) });
  session = result.session;
  device = result.device;
  writeJson(STATE_KEY, device);
  return result.show;
}

/** The ad actually appeared: counts toward the pause and the daily cap. */
export async function recordAdShown(): Promise<void> {
  const now = Date.now();
  device = onAdShown(await loadDevice(), now, localDay(now));
  writeJson(STATE_KEY, device);
}
