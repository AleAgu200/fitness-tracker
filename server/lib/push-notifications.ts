import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { pushDevices, user } from "@/db/schema";

const TOKEN_RE = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;

export function isExpoPushToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

export async function registerPushDevice(userId: string, token: string, platform: string): Promise<void> {
  await db.insert(pushDevices)
    .values({ expoPushToken: token, userId, platform, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: pushDevices.expoPushToken,
      set: { userId, platform, updatedAt: Date.now() },
    });
}

export async function unregisterPushDevice(userId: string, token: string): Promise<void> {
  await db.delete(pushDevices).where(and(eq(pushDevices.userId, userId), eq(pushDevices.expoPushToken, token)));
}

async function tokensFor(userId: string): Promise<string[]> {
  const rows = await db.select({ expoPushToken: pushDevices.expoPushToken }).from(pushDevices).where(eq(pushDevices.userId, userId));
  return rows.map(row => row.expoPushToken);
}

interface ExpoTicket {
  status: "ok" | "error";
  details?: { error?: string };
}

/** Notify athletes about messages sent by their linked coach or nutritionist. */
export async function pushProfessionalMessage(
  senderId: string,
  receiverId: string,
  content: string,
): Promise<void> {
  const [sender] = await db.select({ name: user.name, role: user.role }).from(user).where(eq(user.id, senderId));
  const [receiver] = await db.select({ role: user.role }).from(user).where(eq(user.id, receiverId));

  if (!sender || !receiver || receiver.role !== "athlete") return;
  if (sender.role !== "coach" && sender.role !== "nutritionist") return;

  const tokens = await tokensFor(receiverId);
  if (!tokens.length) return;

  const role = sender.role === "coach" ? "entrenador" : "nutricionista";
  const payload = tokens.map(to => ({
    to,
    sound: "default",
    title: `Mensaje de tu ${role}`,
    body: `${sender.name}: ${content.slice(0, 140)}`,
    data: { type: "message", senderId },
    channelId: "pulso-messages",
  }));

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`expo_push_${response.status}`);

  const json = await response.json() as { data?: ExpoTicket[] };
  for (const [index, ticket] of json.data?.entries() ?? []) {
    if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
      await db.delete(pushDevices).where(eq(pushDevices.expoPushToken, tokens[index]));
    }
  }
}
