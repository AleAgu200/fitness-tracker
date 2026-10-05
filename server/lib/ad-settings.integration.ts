import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { adminAuditEvents, appSettings, user } from "@/db/schema";
import { getAdSettings, saveAdSettings } from "@/lib/ad-settings";
import { DEFAULT_AD_SETTINGS } from "@/lib/ad-settings-policy";

test("ad settings start at the defaults, save, and leave an audit trail", async () => {
  await db.delete(appSettings).where(eq(appSettings.key, "ads"));
  const fresh = await getAdSettings();
  assert.deepEqual(fresh.settings, DEFAULT_AD_SETTINGS);
  assert.equal(fresh.updatedAt, null);

  const adminId = `admin_${randomUUID()}`;
  await db.insert(user).values({ id: adminId, name: "Admin", email: `${adminId}@pulso.test`, role: "athlete", createdAt: new Date(), updatedAt: new Date() });

  const changed = structuredClone(DEFAULT_AD_SETTINGS);
  changed.placements.dieta = { enabled: true, format: "interstitial", adUnitId: "ca-app-pub-8542922303101158/2222222222", frequency: "opens", every: 4 };
  changed.dailyCap = 6;
  const updatedAt = await saveAdSettings({ id: adminId }, changed);

  const saved = await getAdSettings();
  assert.deepEqual(saved.settings, changed);
  assert.equal(saved.updatedAt, updatedAt);

  const audit = await db.select().from(adminAuditEvents).where(eq(adminAuditEvents.actorUserId, adminId));
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, "ads.updated");
});
