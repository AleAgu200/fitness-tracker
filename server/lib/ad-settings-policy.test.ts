import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_AD_SETTINGS, parseAdSettings, storedAdSettings } from "@/lib/ad-settings-policy";

const clone = () => structuredClone(DEFAULT_AD_SETTINGS);

test("the defaults are valid and keep today's single ENTRENO ad", () => {
  const parsed = parseAdSettings(DEFAULT_AD_SETTINGS);
  assert.equal(parsed.ok, true);
  const enabled = Object.entries(DEFAULT_AD_SETTINGS.placements).filter(([, value]) => value.enabled).map(([key]) => key);
  assert.deepEqual(enabled, ["entreno"]);
});

test("an enabled tab needs an ad unit", () => {
  const settings = clone();
  settings.placements.dieta.enabled = true;
  assert.deepEqual(parseAdSettings(settings), { ok: false, error: "missing_ad_unit_dieta" });

  settings.placements.dieta.adUnitId = " ca-app-pub-8542922303101158/1234567890 ";
  const parsed = parseAdSettings(settings);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.settings.placements.dieta.adUnitId, "ca-app-pub-8542922303101158/1234567890");
});

test("malformed values are rejected with the field that failed", () => {
  const badUnit = clone();
  badUnit.placements.perfil.adUnitId = "ca-app-pub-123~456";
  assert.deepEqual(parseAdSettings(badUnit), { ok: false, error: "invalid_perfil" });

  const badEvery = clone();
  badEvery.placements.hoy.every = 0;
  assert.deepEqual(parseAdSettings(badEvery), { ok: false, error: "invalid_hoy" });

  assert.deepEqual(parseAdSettings({ ...clone(), cooldownMinutes: -1 }), { ok: false, error: "invalid_cooldown" });
  assert.deepEqual(parseAdSettings({ ...clone(), dailyCap: 2.5 }), { ok: false, error: "invalid_daily_cap" });
  assert.deepEqual(parseAdSettings({ ...clone(), placements: { hoy: clone().placements.hoy } }), { ok: false, error: "invalid_dieta" });
  assert.deepEqual(parseAdSettings(null), { ok: false, error: "invalid_body" });
});

test("unknown fields are dropped and a broken stored value falls back to the defaults", () => {
  const parsed = parseAdSettings({ ...clone(), extra: true });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal("extra" in parsed.settings, false);
  assert.deepEqual(storedAdSettings({ enabled: "yes" }), DEFAULT_AD_SETTINGS);
});
