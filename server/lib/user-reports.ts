import { randomBytes } from "crypto";

import { and, count, desc, eq, gte, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { messages, user, userReports } from "@/db/schema";
import { recordAdminAction } from "@/lib/admin";
import { emailEnabled, sendEmail, userReportedEmail } from "@/lib/email";
import { areLinked } from "@/lib/messaging";

export const REPORT_REASONS = ["harassment", "inappropriate", "spam", "unsafe_advice", "other"] as const;
export type ReportReason = typeof REPORT_REASONS[number];

export const REASON_LABEL: Record<ReportReason, string> = {
  harassment: "acoso o amenazas",
  inappropriate: "contenido inapropiado",
  spam: "spam o estafa",
  unsafe_advice: "consejos peligrosos para la salud",
  other: "otro",
};

/** Messages copied into a report, newest last. Enough context to judge, not the whole history. */
const EVIDENCE_MESSAGES = 30;
/** A reporter can file this many reports per day; beyond that it's noise or abuse of the form. */
const DAILY_LIMIT = 10;
const MAX_DETAIL = 1000;

function newId(): string {
  return `report_${randomBytes(12).toString("hex")}`;
}

export type CreateReportResult =
  | { ok: true; id: string }
  | { ok: false; error: "self_report" | "not_related" | "too_many_reports" };

/**
 * Files a report about someone the reporter is (or was) in contact with: linked now, or
 * with at least one message exchanged, so leaving the team first doesn't stop a report.
 * A second report of the same person while one is open just updates it.
 */
export async function createReport(input: {
  reporterId: string;
  reportedUserId: string;
  reason: ReportReason;
  detail?: string | null;
  now?: number;
}): Promise<CreateReportResult> {
  const now = input.now ?? Date.now();
  if (input.reporterId === input.reportedUserId) return { ok: false, error: "self_report" };

  const pair = or(
    and(eq(messages.senderId, input.reporterId), eq(messages.receiverId, input.reportedUserId)),
    and(eq(messages.senderId, input.reportedUserId), eq(messages.receiverId, input.reporterId)),
  );
  const conversation = await db.select({ senderId: messages.senderId, content: messages.content, sentAt: messages.sentAt })
    .from(messages).where(pair).orderBy(desc(messages.sentAt)).limit(EVIDENCE_MESSAGES);
  if (!conversation.length && !(await areLinked(input.reporterId, input.reportedUserId))) {
    return { ok: false, error: "not_related" };
  }

  const evidence = {
    messages: conversation.reverse().map(message => ({
      from: message.senderId === input.reporterId ? "reporter" : "reported",
      content: message.content,
      sentAt: message.sentAt,
    })),
  };
  const detail = input.detail?.trim().slice(0, MAX_DETAIL) || null;

  const [open] = await db.select({ id: userReports.id }).from(userReports).where(and(
    eq(userReports.reporterId, input.reporterId),
    eq(userReports.reportedUserId, input.reportedUserId),
    eq(userReports.status, "open"),
  ));
  if (open) {
    await db.update(userReports).set({ reason: input.reason, detail, evidence }).where(eq(userReports.id, open.id));
    return { ok: true, id: open.id };
  }

  const [{ value: today }] = await db.select({ value: count() }).from(userReports)
    .where(and(eq(userReports.reporterId, input.reporterId), gte(userReports.createdAt, now - 86_400_000)));
  if (today >= DAILY_LIMIT) return { ok: false, error: "too_many_reports" };

  const id = newId();
  await db.insert(userReports).values({
    id,
    reporterId: input.reporterId,
    reportedUserId: input.reportedUserId,
    reason: input.reason,
    detail,
    evidence,
    status: "open",
    createdAt: now,
  });
  await notifyAdmins(input.reason);
  return { ok: true, id };
}

/** Best-effort heads-up to the addresses in SUPERADMIN_EMAILS; the panel is the source of truth. */
async function notifyAdmins(reason: ReportReason) {
  if (!emailEnabled()) return;
  const admins = (process.env.SUPERADMIN_EMAILS ?? "").split(",").map(email => email.trim()).filter(Boolean);
  const base = (process.env.BETTER_AUTH_URL ?? "https://pulsofitness.tech").replace(/\/+$/, "");
  for (const to of admins) {
    try {
      await sendEmail(userReportedEmail(to, REASON_LABEL[reason], `${base}/portal/admin/reportes`));
    } catch (error) {
      console.error("[report-email]", error);
    }
  }
}

export type ReportStatusFilter = "open" | "resolved" | "dismissed" | "all";

export async function listReports(status: ReportStatusFilter) {
  const reporter = alias(user, "reporter");
  const reported = alias(user, "reported");
  return db.select({
    id: userReports.id,
    reason: userReports.reason,
    detail: userReports.detail,
    evidence: userReports.evidence,
    status: userReports.status,
    createdAt: userReports.createdAt,
    resolvedAt: userReports.resolvedAt,
    resolutionNote: userReports.resolutionNote,
    reporter: { id: reporter.id, name: reporter.name, email: reporter.email },
    reported: { id: reported.id, name: reported.name, email: reported.email, role: reported.role, suspendedAt: reported.suspendedAt },
  })
    .from(userReports)
    .innerJoin(reporter, eq(reporter.id, userReports.reporterId))
    .innerJoin(reported, eq(reported.id, userReports.reportedUserId))
    .where(status === "all" ? undefined : eq(userReports.status, status))
    .orderBy(desc(userReports.createdAt))
    .limit(100);
}

/** Closes an open report. Suspending the reported account is a separate action in Usuarios. */
export async function closeReport(actor: { id: string }, id: string, decision: "resolved" | "dismissed", note?: string) {
  const [closed] = await db.update(userReports)
    .set({ status: decision, resolvedAt: Date.now(), resolvedBy: actor.id, resolutionNote: note?.trim().slice(0, MAX_DETAIL) || null })
    .where(and(eq(userReports.id, id), eq(userReports.status, "open")))
    .returning({ reportedUserId: userReports.reportedUserId });
  if (!closed) return false;
  await recordAdminAction({
    actorUserId: actor.id,
    action: decision === "resolved" ? "report.resolved" : "report.dismissed",
    subjectType: "user",
    subjectId: closed.reportedUserId,
    metadata: { reportId: id },
  });
  return true;
}
