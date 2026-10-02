import { randomBytes } from "crypto";

import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, or, SQL, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  account,
  adminAuditEvents,
  careAssignments,
  organizationMemberships,
  organizations,
  professionalCapabilities,
  session,
  subscriptions,
  user,
} from "@/db/schema";
import {
  AdminUserAction,
  adminActionError,
  isProfessionalRole,
  isSuperAdmin,
  ProfessionalStatus,
} from "@/lib/admin-policy";
import {
  accountSuspendedEmail,
  emailEnabled,
  professionalApprovedEmail,
  professionalRejectedEmail,
  sendEmail,
} from "@/lib/email";
import { legacyMembershipId } from "@/lib/organizations";
import { initializeProfessionalAccount } from "@/lib/professional-profile";

// Data behind /portal/admin. Account, organization and subscription metadata
// only: health data (training, meals, weight) stays behind the athlete's
// consent to an organization and is never read here.

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

export async function recordAdminAction(input: {
  actorUserId: string;
  action: string;
  subjectType: string;
  subjectId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(adminAuditEvents).values({
    id: newId("adm"),
    actorUserId: input.actorUserId,
    action: input.action,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    metadata: input.metadata ?? null,
    occurredAt: Date.now(),
  });
}

const ENTITLED = ["active", "in_grace_period", "billing_issue"];

// ── overview ─────────────────────────────────────────────────────────────────

export async function adminOverview(now = Date.now()) {
  const weekAgo = new Date(now - 7 * 86_400_000);
  const monthAgo = new Date(now - 30 * 86_400_000);
  const [roles, pending, suspended, week, month, subs, sandbox] = await Promise.all([
    db.select({ role: user.role, value: count() }).from(user).groupBy(user.role),
    db.select({ value: count() }).from(user).where(eq(user.professionalStatus, "pending")),
    db.select({ value: count() }).from(user).where(isNotNull(user.suspendedAt)),
    db.select({ value: count() }).from(user).where(gte(user.createdAt, weekAgo)),
    db.select({ value: count() }).from(user).where(gte(user.createdAt, monthAgo)),
    db.select({ status: subscriptions.status, value: count() }).from(subscriptions)
      .where(eq(subscriptions.isSandbox, false)).groupBy(subscriptions.status),
    db.select({ value: count() }).from(subscriptions).where(eq(subscriptions.isSandbox, true)),
  ]);
  const byRole = Object.fromEntries(roles.map(row => [row.role, Number(row.value)]));
  const byStatus = Object.fromEntries(subs.map(row => [row.status, Number(row.value)]));
  return {
    users: {
      total: roles.reduce((sum, row) => sum + Number(row.value), 0),
      athletes: byRole.athlete ?? 0,
      coaches: byRole.coach ?? 0,
      nutritionists: byRole.nutritionist ?? 0,
      newLast7Days: Number(week[0]?.value ?? 0),
      newLast30Days: Number(month[0]?.value ?? 0),
      suspended: Number(suspended[0]?.value ?? 0),
    },
    professionalsPending: Number(pending[0]?.value ?? 0),
    subscriptions: {
      entitled: ENTITLED.reduce((sum, status) => sum + (byStatus[status] ?? 0), 0),
      active: byStatus.active ?? 0,
      inGracePeriod: byStatus.in_grace_period ?? 0,
      billingIssue: byStatus.billing_issue ?? 0,
      cancelled: byStatus.cancelled ?? 0,
      expired: byStatus.expired ?? 0,
      sandbox: Number(sandbox[0]?.value ?? 0),
    },
  };
}

// ── users ────────────────────────────────────────────────────────────────────

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: string;
  professionalStatus: string | null;
  suspendedAt: number | null;
  superAdmin: boolean;
  createdAt: number;
  lastSeenAt: number | null;
  subscriptionStatus: string | null;
}

export const USER_STATUS_FILTERS = ["all", "suspended", "pending", "unverified"] as const;
export type UserStatusFilter = typeof USER_STATUS_FILTERS[number];

const lastSeen = sql<Date | null>`(select max(${session.updatedAt}) from ${session} where ${session.userId} = ${user.id})`;

export async function listUsers(input: { q?: string; role?: string; status?: UserStatusFilter; page?: number; pageSize?: number }) {
  const pageSize = Math.min(100, Math.max(5, input.pageSize ?? 25));
  const page = Math.max(1, input.page ?? 1);
  const filters: SQL[] = [];
  const q = input.q?.trim();
  if (q) filters.push(or(ilike(user.email, `%${q}%`), ilike(user.name, `%${q}%`))!);
  if (input.role && input.role !== "all") filters.push(eq(user.role, input.role));
  if (input.status === "suspended") filters.push(isNotNull(user.suspendedAt));
  if (input.status === "pending") filters.push(eq(user.professionalStatus, "pending"));
  if (input.status === "unverified") filters.push(eq(user.emailVerified, false));
  const where = filters.length ? and(...filters) : undefined;

  const [rows, total] = await Promise.all([
    db.select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role,
      professionalStatus: user.professionalStatus,
      suspendedAt: user.suspendedAt,
      isSuperAdmin: user.isSuperAdmin,
      createdAt: user.createdAt,
      lastSeenAt: lastSeen,
      subscriptionStatus: subscriptions.status,
    }).from(user)
      .leftJoin(subscriptions, eq(subscriptions.userId, user.id))
      .where(where)
      .orderBy(desc(user.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(user).where(where),
  ]);

  const users: AdminUserRow[] = rows.map(row => ({
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    role: row.role,
    professionalStatus: row.professionalStatus,
    suspendedAt: row.suspendedAt?.getTime() ?? null,
    superAdmin: isSuperAdmin({ isSuperAdmin: row.isSuperAdmin, email: row.email, emailVerified: row.emailVerified }),
    createdAt: row.createdAt.getTime(),
    lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).getTime() : null,
    subscriptionStatus: row.subscriptionStatus,
  }));
  const totalCount = Number(total[0]?.value ?? 0);
  return { users, total: totalCount, page, pageSize, pageCount: Math.ceil(totalCount / pageSize) };
}

export async function getUserDetail(id: string) {
  const [row] = await db.select({
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image,
    role: user.role,
    professionalStatus: user.professionalStatus,
    suspendedAt: user.suspendedAt,
    isSuperAdmin: user.isSuperAdmin,
    createdAt: user.createdAt,
    lastSeenAt: lastSeen,
  }).from(user).where(eq(user.id, id)).limit(1);
  if (!row) return null;

  const [memberships, providers, sessionsCount, subscription, history] = await Promise.all([
    db.select({
      organizationId: organizations.id,
      organizationName: organizations.name,
      orgRole: organizationMemberships.orgRole,
      status: organizationMemberships.status,
      membershipId: organizationMemberships.id,
    }).from(organizationMemberships)
      .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
      .where(eq(organizationMemberships.userId, id))
      .orderBy(asc(organizations.name)),
    db.select({ providerId: account.providerId }).from(account).where(eq(account.userId, id)),
    db.select({ value: count() }).from(session).where(eq(session.userId, id)),
    db.select({
      status: subscriptions.status,
      productId: subscriptions.productId,
      store: subscriptions.store,
      isSandbox: subscriptions.isSandbox,
      currentPeriodEndsAt: subscriptions.currentPeriodEndsAt,
      willRenew: subscriptions.willRenew,
      updatedAt: subscriptions.updatedAt,
    }).from(subscriptions).where(eq(subscriptions.userId, id)),
    db.select().from(adminAuditEvents).where(eq(adminAuditEvents.subjectId, id)).orderBy(desc(adminAuditEvents.occurredAt)).limit(20),
  ]);

  const membershipIds = memberships.map(m => m.membershipId);
  const [athletes] = membershipIds.length
    ? await db.select({ value: count() }).from(careAssignments)
        .where(and(inArray(careAssignments.professionalMembershipId, membershipIds), eq(careAssignments.status, "active")))
    : [{ value: 0 }];

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    image: row.image,
    role: row.role,
    professionalStatus: row.professionalStatus,
    suspendedAt: row.suspendedAt?.getTime() ?? null,
    superAdmin: isSuperAdmin({ isSuperAdmin: row.isSuperAdmin, email: row.email, emailVerified: row.emailVerified }),
    createdAt: row.createdAt.getTime(),
    lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).getTime() : null,
    signInMethods: [...new Set(providers.map(p => p.providerId))],
    activeSessions: Number(sessionsCount[0]?.value ?? 0),
    organizations: memberships.map(({ membershipId: _, ...m }) => m),
    activeAthletes: Number(athletes?.value ?? 0),
    subscription: subscription[0] ?? null,
    history: history.map(event => ({ action: event.action, occurredAt: event.occurredAt, metadata: event.metadata })),
  };
}

export class AdminActionError extends Error {}

async function setRole(userId: string, name: string, role: "athlete" | "coach" | "nutritionist", previous: string) {
  const now = Date.now();
  if (role === "athlete") {
    await db.transaction(async tx => {
      await tx.update(user).set({ role, professionalStatus: null, updatedAt: new Date() }).where(eq(user.id, userId));
      // Without an active membership no organization path opens; the
      // organizations and their history stay for accountability.
      await tx.update(organizationMemberships).set({ status: "revoked", revokedAt: now })
        .where(and(eq(organizationMemberships.userId, userId), inArray(organizationMemberships.status, ["active", "invited"])));
    });
    return;
  }
  await initializeProfessionalAccount({ userId, name, discipline: role, reviewStatus: "approved" });
  const membershipId = legacyMembershipId(userId);
  await db.transaction(async tx => {
    await tx.update(organizationMemberships).set({ status: "active", activatedAt: now, revokedAt: null })
      .where(eq(organizationMemberships.id, membershipId));
    if (isProfessionalRole(previous) && previous !== role) {
      await tx.delete(professionalCapabilities)
        .where(and(eq(professionalCapabilities.membershipId, membershipId), eq(professionalCapabilities.discipline, previous)));
    }
  });
}

/** Suspend, reactivate or change the role of a user. Throws AdminActionError with a code. */
export async function applyUserAction(actor: { id: string }, targetId: string, action: AdminUserAction) {
  const [target] = await db.select().from(user).where(eq(user.id, targetId)).limit(1);
  if (!target) throw new AdminActionError("user_not_found");
  const error = adminActionError(action, actor, {
    id: target.id,
    superAdmin: isSuperAdmin({ isSuperAdmin: target.isSuperAdmin, email: target.email, emailVerified: target.emailVerified }),
    role: target.role,
    suspended: target.suspendedAt != null,
  });
  if (error) throw new AdminActionError(error);

  if (action.action === "suspend") {
    await db.transaction(async tx => {
      await tx.update(user).set({ suspendedAt: new Date(), updatedAt: new Date() }).where(eq(user.id, targetId));
      await tx.delete(session).where(eq(session.userId, targetId));
    });
    if (emailEnabled()) await sendEmail(accountSuspendedEmail(target.email, target.name));
  } else if (action.action === "reactivate") {
    await db.update(user).set({ suspendedAt: null, updatedAt: new Date() }).where(eq(user.id, targetId));
  } else {
    await setRole(targetId, target.name, action.role, target.role);
  }
  await recordAdminAction({
    actorUserId: actor.id,
    action: action.action === "set_role" ? "user.role_changed" : `user.${action.action === "suspend" ? "suspended" : "reactivated"}`,
    subjectType: "user",
    subjectId: targetId,
    metadata: action.action === "set_role"
      ? { from: target.role, to: action.role }
      : action.action === "suspend" ? { reason: action.reason ?? null } : undefined,
  });
}

// ── professional reviews ─────────────────────────────────────────────────────

export async function listProfessionals(status: ProfessionalStatus | "all") {
  const where = status === "all"
    ? inArray(user.role, ["coach", "nutritionist"])
    : and(inArray(user.role, ["coach", "nutritionist"]), eq(user.professionalStatus, status));
  const rows = await db.select({
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    role: user.role,
    professionalStatus: user.professionalStatus,
    createdAt: user.createdAt,
    organizationName: organizations.name,
  }).from(user)
    .leftJoin(organizationMemberships, and(eq(organizationMemberships.userId, user.id), eq(organizationMemberships.orgRole, "owner")))
    .leftJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(where)
    .orderBy(desc(user.createdAt))
    .limit(200);
  return rows.map(row => ({
    ...row,
    professionalStatus: row.professionalStatus ?? "approved",
    createdAt: row.createdAt.getTime(),
  }));
}

function portalUrl(): string {
  return `${(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/portal`;
}

export async function reviewProfessional(actor: { id: string }, targetId: string, decision: "approve" | "reject", reason?: string) {
  const [target] = await db.select().from(user).where(eq(user.id, targetId)).limit(1);
  if (!target || !isProfessionalRole(target.role)) throw new AdminActionError("not_a_professional");
  const now = Date.now();
  await db.transaction(async tx => {
    await tx.update(user).set({ professionalStatus: decision === "approve" ? "approved" : "rejected", updatedAt: new Date() })
      .where(eq(user.id, targetId));
    await tx.update(organizationMemberships)
      .set(decision === "approve" ? { status: "active", activatedAt: now, revokedAt: null } : { status: "revoked", revokedAt: now })
      .where(and(eq(organizationMemberships.userId, targetId), eq(organizationMemberships.status, decision === "approve" ? "invited" : "active")));
  });
  if (emailEnabled()) {
    await sendEmail(decision === "approve"
      ? professionalApprovedEmail(target.email, target.name, portalUrl())
      : professionalRejectedEmail(target.email, target.name, reason));
  }
  await recordAdminAction({
    actorUserId: actor.id,
    action: decision === "approve" ? "professional.approved" : "professional.rejected",
    subjectType: "user",
    subjectId: targetId,
    metadata: reason ? { reason } : undefined,
  });
}

// ── subscriptions ────────────────────────────────────────────────────────────

export async function listSubscriptions(input: { status?: string; q?: string; includeSandbox?: boolean; page?: number }) {
  const pageSize = 50;
  const page = Math.max(1, input.page ?? 1);
  const filters: SQL[] = [];
  if (input.status && input.status !== "all") {
    filters.push(input.status === "entitled" ? inArray(subscriptions.status, ENTITLED) : eq(subscriptions.status, input.status));
  }
  if (!input.includeSandbox) filters.push(eq(subscriptions.isSandbox, false));
  const q = input.q?.trim();
  if (q) filters.push(or(ilike(user.email, `%${q}%`), ilike(user.name, `%${q}%`))!);
  const where = filters.length ? and(...filters) : undefined;
  const [rows, total] = await Promise.all([
    db.select({
      userId: subscriptions.userId,
      name: user.name,
      email: user.email,
      status: subscriptions.status,
      productId: subscriptions.productId,
      store: subscriptions.store,
      isSandbox: subscriptions.isSandbox,
      currentPeriodEndsAt: subscriptions.currentPeriodEndsAt,
      willRenew: subscriptions.willRenew,
      createdAt: subscriptions.createdAt,
      updatedAt: subscriptions.updatedAt,
    }).from(subscriptions)
      .innerJoin(user, eq(user.id, subscriptions.userId))
      .where(where)
      .orderBy(desc(subscriptions.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(subscriptions).innerJoin(user, eq(user.id, subscriptions.userId)).where(where),
  ]);
  const totalCount = Number(total[0]?.value ?? 0);
  return { subscriptions: rows, total: totalCount, page, pageCount: Math.ceil(totalCount / pageSize) };
}

export async function recentAdminActivity(limit = 30) {
  return db.select({
    id: adminAuditEvents.id,
    action: adminAuditEvents.action,
    subjectType: adminAuditEvents.subjectType,
    subjectId: adminAuditEvents.subjectId,
    metadata: adminAuditEvents.metadata,
    occurredAt: adminAuditEvents.occurredAt,
    actorName: user.name,
  }).from(adminAuditEvents)
    .leftJoin(user, eq(user.id, adminAuditEvents.actorUserId))
    .orderBy(desc(adminAuditEvents.occurredAt))
    .limit(limit);
}
