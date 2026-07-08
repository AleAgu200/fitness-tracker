import Database from "better-sqlite3";

const db = new Database("./data/auth.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS "push_devices" (
    "expoPushToken" TEXT NOT NULL PRIMARY KEY,
    "userId"        TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "platform"      TEXT NOT NULL,
    "updatedAt"     INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS "push_user" ON "push_devices" ("userId");
`);

const TOKEN_RE = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;

export function isExpoPushToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

export function registerPushDevice(userId: string, token: string, platform: string): void {
  db.prepare(`
    INSERT INTO "push_devices" ("expoPushToken", "userId", "platform", "updatedAt")
    VALUES (?, ?, ?, ?)
    ON CONFLICT("expoPushToken") DO UPDATE SET
      "userId" = excluded."userId",
      "platform" = excluded."platform",
      "updatedAt" = excluded."updatedAt"
  `).run(token, userId, platform, Date.now());
}

export function unregisterPushDevice(userId: string, token: string): void {
  db.prepare(`DELETE FROM "push_devices" WHERE "userId" = ? AND "expoPushToken" = ?`).run(userId, token);
}

function tokensFor(userId: string): string[] {
  const rows = db.prepare(`SELECT "expoPushToken" FROM "push_devices" WHERE "userId" = ?`)
    .all(userId) as { expoPushToken: string }[];
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
  const sender = db.prepare(`SELECT "name", "role" FROM "user" WHERE "id" = ?`)
    .get(senderId) as { name: string; role: string } | undefined;
  const receiver = db.prepare(`SELECT "role" FROM "user" WHERE "id" = ?`)
    .get(receiverId) as { role: string } | undefined;

  if (!sender || !receiver || receiver.role !== "athlete") return;
  if (sender.role !== "coach" && sender.role !== "nutritionist") return;

  const tokens = tokensFor(receiverId);
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
  json.data?.forEach((ticket, index) => {
    if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
      db.prepare(`DELETE FROM "push_devices" WHERE "expoPushToken" = ?`).run(tokens[index]);
    }
  });
}
