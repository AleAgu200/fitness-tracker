import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type AdConfig,
  DEFAULT_AD_CONFIG,
  EMPTY_DEVICE_STATE,
  EMPTY_SESSION_STATE,
  onAdShown,
  onTabFocus,
  sanitizeAdConfig,
  type AdDeviceState,
  type AdPlacement,
  type AdSessionState,
} from '../src/lib/ad-rules';

const TODAY = '2026-10-05';
const UNIT = 'ca-app-pub-8542922303101158/1111111111';

function config(patch: (config: AdConfig) => void = () => {}): AdConfig {
  const value = structuredClone(DEFAULT_AD_CONFIG);
  patch(value);
  return value;
}

/** Walks a sequence of tab switches and returns which ones showed an ad. */
function walk(tabs: AdPlacement[], cfg: AdConfig, options: { allowed?: boolean; minutesBetween?: number; device?: AdDeviceState } = {}) {
  let device = options.device ?? EMPTY_DEVICE_STATE;
  let session: AdSessionState = EMPTY_SESSION_STATE;
  let now = Date.UTC(2026, 9, 5, 12);
  const shown: AdPlacement[] = [];
  for (const placement of tabs) {
    now += (options.minutesBetween ?? 10) * 60_000;
    const result = onTabFocus({ config: cfg, placement, device, session, allowed: options.allowed ?? true, now, today: TODAY });
    device = result.device;
    session = result.session;
    if (result.show) {
      shown.push(placement);
      device = onAdShown(device, now, TODAY);
    }
  }
  return { shown, device };
}

test('defaults keep the old behavior: ENTRENO once per launch, never the first screen', () => {
  assert.deepEqual(walk(['hoy', 'entreno', 'hoy', 'entreno', 'dieta'], config()).shown, ['entreno']);
  // Opening the app straight into ENTRENO (a widget link) shows nothing on that first screen.
  assert.deepEqual(walk(['entreno', 'hoy', 'entreno'], config()).shown, ['entreno']);
});

test('every N openings counts openings across launches', () => {
  const cfg = config(c => { c.placements.dieta = { enabled: true, format: 'interstitial', adUnitId: UNIT, frequency: 'opens', every: 2 }; c.placements.entreno.enabled = false; });
  const first = walk(['hoy', 'dieta', 'hoy', 'dieta', 'hoy', 'dieta'], cfg);
  assert.deepEqual(first.shown, ['dieta']);
  // The counter carries over to the next launch: 3 so far, the 4th opening shows.
  // (The walk's clock restarts, so forget the last ad's time to keep the pause out of it.)
  const next = walk(['hoy', 'dieta'], cfg, { device: { ...first.device, lastShownAt: null } });
  assert.deepEqual(next.shown, ['dieta']);
});

test('coming back from a screen pushed over the tab is not a new opening', () => {
  const cfg = config(c => { c.placements.perfil = { enabled: true, format: 'interstitial', adUnitId: UNIT, frequency: 'opens', every: 1 }; });
  assert.deepEqual(walk(['hoy', 'perfil', 'perfil', 'perfil'], cfg).shown, ['perfil']);
});

test('the pause between ads and the daily cap apply across tabs', () => {
  const everyTime = config(c => {
    for (const key of ['dieta', 'perfil'] as const) c.placements[key] = { enabled: true, format: 'interstitial', adUnitId: UNIT, frequency: 'opens', every: 1 };
    c.placements.entreno.enabled = false;
    c.cooldownMinutes = 15;
    c.dailyCap = 0;
  });
  // Ten minutes between switches: the 15-minute pause skips every other one.
  assert.deepEqual(walk(['hoy', 'dieta', 'perfil', 'dieta', 'perfil'], everyTime).shown, ['dieta', 'dieta']);

  const capped = structuredClone(everyTime);
  capped.cooldownMinutes = 0;
  capped.dailyCap = 2;
  assert.deepEqual(walk(['hoy', 'dieta', 'perfil', 'dieta', 'perfil'], capped).shown, ['dieta', 'perfil']);

  // A new day resets the cap.
  const yesterday: AdDeviceState = { day: '2026-10-04', shownToday: 2, lastShownAt: null, opens: {} };
  assert.deepEqual(walk(['hoy', 'dieta'], capped, { device: yesterday }).shown, ['dieta']);
});

test('nothing shows for subscribers, with the master switch off, or without an ad unit', () => {
  assert.deepEqual(walk(['hoy', 'entreno'], config(), { allowed: false }).shown, []);
  assert.deepEqual(walk(['hoy', 'entreno'], config(c => { c.enabled = false; })).shown, []);
  assert.deepEqual(walk(['hoy', 'entreno'], config(c => { c.placements.entreno.adUnitId = ''; })).shown, []);
});

test('a damaged config falls back field by field', () => {
  assert.deepEqual(sanitizeAdConfig(null), DEFAULT_AD_CONFIG);
  const parsed = sanitizeAdConfig({ enabled: true, cooldownMinutes: -5, dailyCap: 4, placements: { dieta: { enabled: true, format: 'x', adUnitId: UNIT, frequency: 'opens', every: 99 } } });
  assert.equal(parsed.cooldownMinutes, DEFAULT_AD_CONFIG.cooldownMinutes);
  assert.equal(parsed.dailyCap, 4);
  assert.deepEqual(parsed.placements.dieta, { enabled: true, format: 'interstitial', adUnitId: UNIT, frequency: 'opens', every: 3 });
  assert.deepEqual(parsed.placements.entreno, DEFAULT_AD_CONFIG.placements.entreno);
});
