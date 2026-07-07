import Database from "better-sqlite3";
import { randomBytes } from "crypto";

// Same DB as auth + supervision so we can enforce links and join names
const db = new Database("./data/auth.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS "messages" (
    "id"         TEXT NOT NULL PRIMARY KEY,
    "senderId"   TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "receiverId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "content"    TEXT NOT NULL,
    "sentAt"     INTEGER NOT NULL,
    "readAt"     INTEGER
  );
  CREATE INDEX IF NOT EXISTS "msg_pair"   ON "messages" ("senderId", "receiverId", "sentAt");
  CREATE INDEX IF NOT EXISTS "msg_unread" ON "messages" ("receiverId", "readAt");
`);

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  sentAt: number;
  readAt: number | null;
}

/** Messaging is only allowed between users with an active supervision link */
export function areLinked(a: string, b: string): boolean {
  const row = db.prepare(
    `SELECT 1 FROM "supervision_links"
     WHERE "status" = 'active'
       AND (("professionalId" = ? AND "athleteId" = ?) OR ("professionalId" = ? AND "athleteId" = ?))`,
  ).get(a, b, b, a);
  return !!row;
}

export function sendMessage(senderId: string, receiverId: string, content: string): Message {
  const msg: Message = {
    id: randomBytes(12).toString("hex"),
    senderId,
    receiverId,
    content,
    sentAt: Date.now(),
    readAt: null,
  };
  db.prepare(
    `INSERT INTO "messages" ("id","senderId","receiverId","content","sentAt")
     VALUES (?, ?, ?, ?, ?)`,
  ).run(msg.id, msg.senderId, msg.receiverId, msg.content, msg.sentAt);
  return msg;
}

/** Both directions of a conversation, oldest first. `since` (ms) for incremental polling. */
export function getConversation(me: string, other: string, since = 0, limit = 200): Message[] {
  return db.prepare(
    `SELECT * FROM "messages"
     WHERE (("senderId" = ? AND "receiverId" = ?) OR ("senderId" = ? AND "receiverId" = ?))
       AND "sentAt" > ?
     ORDER BY "sentAt" ASC
     LIMIT ?`,
  ).all(me, other, other, me, since, limit) as Message[];
}

export function markConversationRead(me: string, other: string): void {
  db.prepare(
    `UPDATE "messages" SET "readAt" = ?
     WHERE "receiverId" = ? AND "senderId" = ? AND "readAt" IS NULL`,
  ).run(Date.now(), me, other);
}

/** Unread incoming messages grouped by sender */
export function unreadCounts(me: string): { total: number; bySender: Record<string, number> } {
  const rows = db.prepare(
    `SELECT "senderId", COUNT(*) AS n FROM "messages"
     WHERE "receiverId" = ? AND "readAt" IS NULL
     GROUP BY "senderId"`,
  ).all(me) as { senderId: string; n: number }[];
  const bySender: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    bySender[r.senderId] = r.n;
    total += r.n;
  }
  return { total, bySender };
}
