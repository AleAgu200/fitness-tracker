// When a tab shows an ad. Pure (no React Native), so tests/ad-rules.test.ts runs it
// under node. The config comes from the admin panel (server/lib/ad-settings-policy.ts).

export const AD_PLACEMENTS = ['hoy', 'dieta', 'entreno', 'perfil'] as const;
export type AdPlacement = typeof AD_PLACEMENTS[number];
export type AdFormat = 'interstitial' | 'rewarded_interstitial';

export interface AdPlacementConfig {
  enabled: boolean;
  format: AdFormat;
  adUnitId: string;
  /** 'session': first opening after launch. 'opens': every Nth opening. */
  frequency: 'session' | 'opens';
  every: number;
}

export interface AdConfig {
  enabled: boolean;
  cooldownMinutes: number;
  dailyCap: number;
  placements: Record<AdPlacement, AdPlacementConfig>;
}

/** Used until the server answers once: the single ENTRENO ad the app always had. */
export const DEFAULT_AD_CONFIG: AdConfig = {
  enabled: true,
  cooldownMinutes: 3,
  dailyCap: 10,
  placements: {
    hoy: { enabled: false, format: 'interstitial', adUnitId: '', frequency: 'opens', every: 3 },
    dieta: { enabled: false, format: 'interstitial', adUnitId: '', frequency: 'opens', every: 3 },
    entreno: { enabled: true, format: 'rewarded_interstitial', adUnitId: 'ca-app-pub-8542922303101158/7129481676', frequency: 'session', every: 1 },
    perfil: { enabled: false, format: 'interstitial', adUnitId: '', frequency: 'opens', every: 3 },
  },
};

function count(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

/** The server validates; this only keeps a damaged cache or response from crashing the app. */
export function sanitizeAdConfig(value: unknown): AdConfig {
  if (!value || typeof value !== 'object') return DEFAULT_AD_CONFIG;
  const raw = value as Record<string, unknown>;
  const rawPlacements = (raw.placements && typeof raw.placements === 'object' ? raw.placements : {}) as Record<string, Record<string, unknown> | undefined>;
  const placements = {} as Record<AdPlacement, AdPlacementConfig>;
  for (const key of AD_PLACEMENTS) {
    const item = rawPlacements[key];
    const fallback = DEFAULT_AD_CONFIG.placements[key];
    placements[key] = item && typeof item === 'object' ? {
      enabled: item.enabled === true,
      format: item.format === 'rewarded_interstitial' ? 'rewarded_interstitial' : 'interstitial',
      adUnitId: typeof item.adUnitId === 'string' ? item.adUnitId : '',
      frequency: item.frequency === 'session' ? 'session' : 'opens',
      every: count(item.every, 1, 50, fallback.every),
    } : fallback;
  }
  return {
    enabled: raw.enabled !== false,
    cooldownMinutes: count(raw.cooldownMinutes, 0, 1440, DEFAULT_AD_CONFIG.cooldownMinutes),
    dailyCap: count(raw.dailyCap, 0, 100, DEFAULT_AD_CONFIG.dailyCap),
    placements,
  };
}

/** Survives restarts (stored on the device). */
export interface AdDeviceState {
  day: string;
  shownToday: number;
  lastShownAt: number | null;
  opens: Partial<Record<AdPlacement, number>>;
}

/** Lives for one app launch. */
export interface AdSessionState {
  /** The tab focused last; returning from a screen pushed over it is not a new opening. */
  lastTab: AdPlacement | null;
  shown: Partial<Record<AdPlacement, boolean>>;
}

export const EMPTY_DEVICE_STATE: AdDeviceState = { day: '', shownToday: 0, lastShownAt: null, opens: {} };
export const EMPTY_SESSION_STATE: AdSessionState = { lastTab: null, shown: {} };

export interface TabFocus {
  config: AdConfig;
  placement: AdPlacement;
  device: AdDeviceState;
  session: AdSessionState;
  /** False for Plus subscribers (and while that is unknown): the opening still counts. */
  allowed: boolean;
  now: number;
  /** Local calendar day, YYYY-MM-DD. */
  today: string;
}

export interface TabFocusResult {
  show: AdPlacementConfig | null;
  device: AdDeviceState;
  session: AdSessionState;
}

/**
 * A tab gained focus. Only switching tabs counts as an opening, and the first tab of
 * a launch never shows an ad (AdMob forbids interstitials on app load). Beyond that:
 * the tab's own frequency, then the global pause between ads and the daily cap.
 */
export function onTabFocus(input: TabFocus): TabFocusResult {
  const { config, placement, now, today } = input;
  if (input.session.lastTab === placement) return { show: null, device: input.device, session: input.session };

  const firstOfLaunch = input.session.lastTab == null;
  const session: AdSessionState = { ...input.session, lastTab: placement };
  const sameDay = input.device.day === today;
  const opens = (input.device.opens[placement] ?? 0) + 1;
  const device: AdDeviceState = {
    ...input.device,
    day: today,
    shownToday: sameDay ? input.device.shownToday : 0,
    opens: { ...input.device.opens, [placement]: opens },
  };

  const tab = config.placements[placement];
  const due = tab.frequency === 'session' ? !session.shown[placement] : opens % tab.every === 0;
  const cooling = device.lastShownAt != null && now - device.lastShownAt < config.cooldownMinutes * 60_000;
  const capped = config.dailyCap > 0 && device.shownToday >= config.dailyCap;

  if (firstOfLaunch || !input.allowed || !config.enabled || !tab.enabled || !tab.adUnitId || !due || cooling || capped) {
    return { show: null, device, session };
  }
  // Consumed on the attempt: an ad that fails to load doesn't retry on the next switch.
  return { show: tab, device, session: { ...session, shown: { ...session.shown, [placement]: true } } };
}

/** An ad actually appeared on screen. */
export function onAdShown(device: AdDeviceState, now: number, today: string): AdDeviceState {
  const shownToday = device.day === today ? device.shownToday + 1 : 1;
  return { ...device, day: today, shownToday, lastShownAt: now };
}
