import { randomBytes } from "crypto";

import { and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { careAssignments, messages, organizationClients, organizationMemberships, supervisionLinks } from "@/db/schema";

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  sentAt: number;
  readAt: number | null;
}

/** Messaging is only allowed between users with an active supervision link */
export async function areLinked(a: string, b: string): Promise<boolean> {
  const [projected] = await db
    .select({ id: careAssignments.id })
    .from(careAssignments)
    .innerJoin(organizationClients, eq(organizationClients.id, careAssignments.organizationClientId))
    .innerJoin(organizationMemberships, eq(organizationMemberships.id, careAssignments.professionalMembershipId))
    .where(and(
      eq(careAssignments.status, "active"),
      eq(organizationClients.status, "active"),
      eq(organizationMemberships.status, "active"),
      or(
        and(eq(organizationMemberships.userId, a), eq(organizationClients.athleteId, b)),
        and(eq(organizationMemberships.userId, b), eq(organizationClients.athleteId, a)),
      ),
    ));
  if (projected) return true;

  const [row] = await db
    .select({ id: supervisionLinks.id })
    .from(supervisionLinks)
    .where(and(
      eq(supervisionLinks.status, "active"),
      or(
        and(eq(supervisionLinks.professionalId, a), eq(supervisionLinks.athleteId, b)),
        and(eq(supervisionLinks.professionalId, b), eq(supervisionLinks.athleteId, a)),
      ),
    ));
  return !!row;
}

export async function sendMessage(senderId: string, receiverId: string, content: string): Promise<Message> {
  const msg: Message = {
    id: randomBytes(12).toString("hex"),
    senderId,
    receiverId,
    content,
    sentAt: Date.now(),
    readAt: null,
  };
  await db.insert(messages).values(msg);
  return msg;
}

/** Both directions of a conversation, oldest first. `since` (ms) for incremental polling. */
export async function getConversation(me: string, other: string, since = 0, limit = 200): Promise<Message[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(and(
      or(
        and(eq(messages.senderId, me), eq(messages.receiverId, other)),
        and(eq(messages.senderId, other), eq(messages.receiverId, me)),
      ),
      gt(messages.sentAt, since),
    ))
    .orderBy(asc(messages.sentAt))
    .limit(limit);
  return rows;
}

export async function markConversationRead(me: string, other: string): Promise<void> {
  await db.update(messages)
    .set({ readAt: Date.now() })
    .where(and(eq(messages.receiverId, me), eq(messages.senderId, other), isNull(messages.readAt)));
}

/** Most recent message time (either direction) per conversation partner */
export async function lastMessageAt(me: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ senderId: messages.senderId, receiverId: messages.receiverId, sentAt: messages.sentAt })
    .from(messages)
    .where(or(eq(messages.senderId, me), eq(messages.receiverId, me)));
  const result: Record<string, number> = {};
  for (const r of rows) {
    const other = r.senderId === me ? r.receiverId : r.senderId;
    if (!result[other] || r.sentAt > result[other]) result[other] = r.sentAt;
  }
  return result;
}

/** Unread incoming messages grouped by sender */
export async function unreadCounts(me: string): Promise<{ total: number; bySender: Record<string, number> }> {
  const rows = await db
    .select({ senderId: messages.senderId, n: sql<number>`count(*)` })
    .from(messages)
    .where(and(eq(messages.receiverId, me), isNull(messages.readAt)))
    .groupBy(messages.senderId);
  const bySender: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const n = Number(r.n);
    bySender[r.senderId] = n;
    total += n;
  }
  return { total, bySender };
}
