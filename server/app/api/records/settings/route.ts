import { z } from "zod";

import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { setDeviceSyncEnabled } from "@/lib/device-sync";

const settingsSchema = z.object({ enabled: z.boolean() }).strict();

/** PUT /api/records/settings — consent to sync this account's devices; off deletes the server copy. */
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
  return Response.json(await setDeviceSyncEnabled(user.id, parsed.data.enabled));
}
