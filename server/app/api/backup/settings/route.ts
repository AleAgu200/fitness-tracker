import { z } from "zod";

import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { setBackupEnabled } from "@/lib/personal-backup";

const settingsSchema = z.object({ enabled: z.boolean() }).strict();

/** PUT /api/backup/settings — the athlete's own backup consent. Independent of professional sharing. */
export async function PUT(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "athlete") return Response.json({ error: "athlete_only" }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  return Response.json({ settings: await setBackupEnabled(user.id, parsed.data.enabled) });
}
