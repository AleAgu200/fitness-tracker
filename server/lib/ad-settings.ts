import { eq } from "drizzle-orm";

import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { type AdSettings, storedAdSettings } from "@/lib/ad-settings-policy";
import { recordAdminAction } from "@/lib/admin";

const KEY = "ads";

export async function getAdSettings(): Promise<{ settings: AdSettings; updatedAt: number | null }> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY));
  return { settings: storedAdSettings(row?.value), updatedAt: row?.updatedAt ?? null };
}

export async function saveAdSettings(actor: { id: string }, settings: AdSettings): Promise<number> {
  const now = Date.now();
  await db.insert(appSettings)
    .values({ key: KEY, value: settings, updatedAt: now, updatedBy: actor.id })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: settings, updatedAt: now, updatedBy: actor.id } });
  await recordAdminAction({
    actorUserId: actor.id,
    action: "ads.updated",
    subjectType: "settings",
    subjectId: KEY,
    metadata: {
      enabled: settings.enabled,
      placements: Object.fromEntries(Object.entries(settings.placements).map(([key, value]) => [key, value.enabled])),
    },
  });
  return now;
}
