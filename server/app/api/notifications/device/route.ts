import { getSessionUser, unauthorized } from "@/lib/api-auth";
import {
  isExpoPushToken,
  registerPushDevice,
  unregisterPushDevice,
} from "@/lib/push-notifications";

/** POST /api/notifications/device — register or disable this device's Expo push token. */
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  let body: { token?: unknown; platform?: unknown; enabled?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (!isExpoPushToken(token)) {
    return Response.json({ error: "invalid_push_token" }, { status: 400 });
  }

  if (body.enabled === false) {
    await unregisterPushDevice(user.id, token);
  } else {
    const platform = body.platform === "ios" ? "ios" : "android";
    await registerPushDevice(user.id, token, platform);
  }
  return Response.json({ ok: true });
}
