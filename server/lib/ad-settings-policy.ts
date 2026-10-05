// Ad configuration the admin panel edits and the app reads (GET /api/ads/config).
// Pure: no database, so the rules are unit-tested on their own.

export const AD_PLACEMENTS = ["hoy", "dieta", "entreno", "perfil"] as const;
export type AdPlacement = typeof AD_PLACEMENTS[number];

export const AD_FORMATS = ["interstitial", "rewarded_interstitial"] as const;
export type AdFormat = typeof AD_FORMATS[number];

/** "session": the first time the tab is opened after launching the app. "opens": every N openings. */
export const AD_FREQUENCIES = ["session", "opens"] as const;
export type AdFrequency = typeof AD_FREQUENCIES[number];

export interface AdPlacementSettings {
  enabled: boolean;
  format: AdFormat;
  /** AdMob ad unit (ca-app-pub-…/…). Debug builds always use Google's test units. */
  adUnitId: string;
  frequency: AdFrequency;
  /** For "opens": show on every Nth opening of the tab. */
  every: number;
}

export interface AdSettings {
  /** Master switch: off hides every ad without touching the per-tab settings. */
  enabled: boolean;
  /** Minimum minutes between two ads, across tabs. 0 = no minimum. */
  cooldownMinutes: number;
  /** Maximum ads per device per day. 0 = no limit. */
  dailyCap: number;
  placements: Record<AdPlacement, AdPlacementSettings>;
}

/** Today's behavior before the panel existed: one ad the first time ENTRENO opens per launch. */
export const DEFAULT_AD_SETTINGS: AdSettings = {
  enabled: true,
  cooldownMinutes: 3,
  dailyCap: 10,
  placements: {
    hoy: { enabled: false, format: "interstitial", adUnitId: "", frequency: "opens", every: 3 },
    dieta: { enabled: false, format: "interstitial", adUnitId: "", frequency: "opens", every: 3 },
    entreno: { enabled: true, format: "rewarded_interstitial", adUnitId: "ca-app-pub-8542922303101158/7129481676", frequency: "session", every: 1 },
    perfil: { enabled: false, format: "interstitial", adUnitId: "", frequency: "opens", every: 3 },
  },
};

const AD_UNIT = /^ca-app-pub-\d{16}\/\d{10}$/;

export type AdSettingsError =
  | "invalid_body"
  | "invalid_cooldown"
  | "invalid_daily_cap"
  | `invalid_${AdPlacement}`
  | `missing_ad_unit_${AdPlacement}`;

function integer(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

/** Validates a full settings object from the admin panel. */
export function parseAdSettings(input: unknown): { ok: true; settings: AdSettings } | { ok: false; error: AdSettingsError } {
  if (!input || typeof input !== "object") return { ok: false, error: "invalid_body" };
  const body = input as Record<string, unknown>;
  if (typeof body.enabled !== "boolean") return { ok: false, error: "invalid_body" };
  const cooldownMinutes = integer(body.cooldownMinutes, 0, 1440);
  if (cooldownMinutes == null) return { ok: false, error: "invalid_cooldown" };
  const dailyCap = integer(body.dailyCap, 0, 100);
  if (dailyCap == null) return { ok: false, error: "invalid_daily_cap" };
  if (!body.placements || typeof body.placements !== "object") return { ok: false, error: "invalid_body" };

  const placements = {} as Record<AdPlacement, AdPlacementSettings>;
  for (const placement of AD_PLACEMENTS) {
    const raw = (body.placements as Record<string, unknown>)[placement] as Record<string, unknown> | undefined;
    if (!raw || typeof raw !== "object") return { ok: false, error: `invalid_${placement}` };
    const adUnitId = typeof raw.adUnitId === "string" ? raw.adUnitId.trim() : "";
    const every = integer(raw.every, 1, 50);
    if (
      typeof raw.enabled !== "boolean"
      || !(AD_FORMATS as readonly unknown[]).includes(raw.format)
      || !(AD_FREQUENCIES as readonly unknown[]).includes(raw.frequency)
      || every == null
      || (adUnitId !== "" && !AD_UNIT.test(adUnitId))
    ) {
      return { ok: false, error: `invalid_${placement}` };
    }
    if (raw.enabled && !adUnitId) return { ok: false, error: `missing_ad_unit_${placement}` };
    placements[placement] = {
      enabled: raw.enabled,
      format: raw.format as AdFormat,
      adUnitId,
      frequency: raw.frequency as AdFrequency,
      every,
    };
  }
  return { ok: true, settings: { enabled: body.enabled, cooldownMinutes, dailyCap, placements } };
}

/** A stored value that no longer parses (older shape, manual edit) falls back to the defaults. */
export function storedAdSettings(value: unknown): AdSettings {
  const parsed = parseAdSettings(value);
  return parsed.ok ? parsed.settings : DEFAULT_AD_SETTINGS;
}
