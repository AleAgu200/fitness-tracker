import { randomBytes } from "crypto";

import { and, desc, eq, gte, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  assignedMealPlans,
  assignedWorkouts,
  athleteDailySummaries,
  athleteProfiles,
  attentionSignals,
  auditEvents,
  careAssignments,
  checkinRequests,
  checkinResponses,
  followUpTasks,
  organizationClients,
  organizationMemberships,
  syncDevices,
  user,
} from "@/db/schema";
import {
  disciplineAllowsCategory,
  getProfessionalAccess,
  type AccessContext,
  type SharingCategory,
} from "@/lib/permissions";

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

const CATEGORIES: SharingCategory[] = ["training", "nutrition", "metrics", "checkins", "photos"];

function categoryState(contexts: AccessContext[], category: SharingCategory) {
  const relevant = contexts.filter(context => disciplineAllowsCategory(context.discipline, category));
  if (relevant.some(context => context.consents[category] === "granted")) return "granted" as const;
  if (relevant.some(context => context.consents[category] === "revoked")) return "revoked" as const;
  return "not_authorized" as const;
}

export async function getAthleteOverview(professionalUserId: string, athleteId: string) {
  const contexts = await getProfessionalAccess(professionalUserId, athleteId);
  if (!contexts.length) return null;
  const permissions = Object.fromEntries(CATEGORIES.map(category => [category, {
    status: categoryState(contexts, category),
    canEdit: contexts.some(context => disciplineAllowsCategory(context.discipline, category) && context.consents[category] === "granted"),
  }])) as Record<SharingCategory, { status: "granted" | "revoked" | "not_authorized"; canEdit: boolean }>;

  const assignmentIds = contexts.map(context => context.assignmentId);
  const clientIds = [...new Set(contexts.map(context => context.organizationClientId))];
  const organizationIds = [...new Set(contexts.map(context => context.organizationId))];
  const sinceDate = new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10);
  const [athleteRows, profileRows, summaries, team, workoutPlans, mealPlans, checkins, signals, tasks, activity, writer] = await Promise.all([
    db.select({ id: user.id, name: user.name, email: user.email, image: user.image }).from(user).where(eq(user.id, athleteId)),
    db.select().from(athleteProfiles).where(eq(athleteProfiles.userId, athleteId)),
    db.select().from(athleteDailySummaries).where(and(
      eq(athleteDailySummaries.athleteId, athleteId),
      gte(athleteDailySummaries.date, sinceDate),
    )).orderBy(athleteDailySummaries.date),
    db.select({
      assignmentId: careAssignments.id,
      discipline: careAssignments.discipline,
      primary: careAssignments.primary,
      professionalId: user.id,
      professionalName: user.name,
      status: careAssignments.status,
    }).from(careAssignments)
      .innerJoin(organizationMemberships, eq(organizationMemberships.id, careAssignments.professionalMembershipId))
      .innerJoin(user, eq(user.id, organizationMemberships.userId))
      .where(and(inArray(careAssignments.organizationClientId, clientIds), eq(careAssignments.status, "active"))),
    permissions.training.status === "granted"
      ? db.select({ id: assignedWorkouts.id, version: assignedWorkouts.version, effectiveAt: assignedWorkouts.effectiveAt, endsAt: assignedWorkouts.endsAt, createdAt: assignedWorkouts.createdAt })
          .from(assignedWorkouts)
          .where(and(eq(assignedWorkouts.athleteId, athleteId), eq(assignedWorkouts.status, "active"), inArray(assignedWorkouts.careAssignmentId, assignmentIds)))
      : Promise.resolve([]),
    permissions.nutrition.status === "granted"
      ? db.select({ id: assignedMealPlans.id, version: assignedMealPlans.version, effectiveAt: assignedMealPlans.effectiveAt, endsAt: assignedMealPlans.endsAt, createdAt: assignedMealPlans.createdAt })
          .from(assignedMealPlans)
          .where(and(eq(assignedMealPlans.athleteId, athleteId), eq(assignedMealPlans.status, "active"), inArray(assignedMealPlans.careAssignmentId, assignmentIds)))
      : Promise.resolve([]),
    permissions.checkins.status === "granted"
      ? db.select({
          requestId: checkinRequests.id,
          status: checkinRequests.status,
          dueAt: checkinRequests.dueAt,
          submittedAt: checkinRequests.submittedAt,
          reviewedAt: checkinRequests.reviewedAt,
          responseId: checkinResponses.id,
          answers: checkinResponses.answers,
        }).from(checkinRequests)
          .leftJoin(checkinResponses, eq(checkinResponses.requestId, checkinRequests.id))
          .where(and(eq(checkinRequests.athleteId, athleteId), inArray(checkinRequests.careAssignmentId, assignmentIds)))
          .orderBy(desc(checkinRequests.createdAt)).limit(6)
      : Promise.resolve([]),
    db.select({ id: attentionSignals.id, reasonCode: attentionSignals.reasonCode, severity: attentionSignals.severity, status: attentionSignals.status, evidence: attentionSignals.evidence, openedAt: attentionSignals.openedAt })
      .from(attentionSignals)
      .where(and(inArray(attentionSignals.ownerAssignmentId, assignmentIds), inArray(attentionSignals.status, ["open", "acknowledged"])))
      .orderBy(desc(attentionSignals.openedAt)),
    db.select({ id: followUpTasks.id, title: followUpTasks.title, detail: followUpTasks.detail, dueAt: followUpTasks.dueAt, status: followUpTasks.status, createdAt: followUpTasks.createdAt })
      .from(followUpTasks)
      .where(and(eq(followUpTasks.athleteId, athleteId), inArray(followUpTasks.organizationId, organizationIds)))
      .orderBy(desc(followUpTasks.createdAt)).limit(10),
    db.select({ id: auditEvents.id, action: auditEvents.action, subjectType: auditEvents.subjectType, subjectId: auditEvents.subjectId, metadata: auditEvents.metadata, occurredAt: auditEvents.occurredAt })
      .from(auditEvents)
      .where(and(inArray(auditEvents.organizationId, organizationIds), eq(auditEvents.subjectId, athleteId)))
      .orderBy(desc(auditEvents.occurredAt)).limit(20),
    db.select({ deviceId: syncDevices.id, lastSeenAt: syncDevices.lastSeenAt, status: syncDevices.status })
      .from(syncDevices)
      .where(and(eq(syncDevices.athleteId, athleteId), eq(syncDevices.status, "active_writer"))).limit(1),
  ]);
  const athlete = athleteRows[0];
  if (!athlete) return null;

  const sum = <K extends keyof typeof summaries[number]>(key: K) => summaries.reduce((total, row) => total + Number(row[key] ?? 0), 0);
  const completedTraining = sum("trainingCompleted");
  const skippedTraining = sum("trainingSkipped");
  const mealsCompleted = sum("mealsCompleted");
  const mealsSubstituted = sum("mealsSubstituted");
  const mealsPending = sum("mealsPending");
  const weights = summaries.filter(row => row.latestWeightKg != null).map(row => row.latestWeightKg as number);
  const freshness = {
    training: Math.max(0, ...summaries.map(row => row.trainingFreshAt ?? 0)) || null,
    nutrition: Math.max(0, ...summaries.map(row => row.nutritionFreshAt ?? 0)) || null,
    metrics: Math.max(0, ...summaries.map(row => row.metricsFreshAt ?? 0)) || null,
    checkins: Math.max(0, ...summaries.map(row => row.checkinsFreshAt ?? 0)) || null,
    photos: null,
  };

  await Promise.all(organizationIds.map(organizationId => {
    const context = contexts.find(item => item.organizationId === organizationId)!;
    return db.insert(auditEvents).values({
      id: newId("audit"),
      organizationId,
      actorMembershipId: context.membershipId,
      actorUserId: professionalUserId,
      action: "athlete_record.viewed",
      subjectType: "athlete",
      subjectId: athleteId,
      metadata: { categories: CATEGORIES.filter(category => permissions[category].status === "granted") },
      occurredAt: Date.now(),
    });
  }));

  return {
    athlete: {
      ...athlete,
      profile: permissions.metrics.status === "granted" ? profileRows[0] ?? null : null,
    },
    organizations: contexts.map(context => ({ id: context.organizationId, name: context.organizationName, discipline: context.discipline })),
    permissions,
    dataFreshness: Object.fromEntries(CATEGORIES.map(category => [category, {
      status: permissions[category].status,
      updatedAt: permissions[category].status === "granted" ? freshness[category] : null,
    }])),
    sync: writer[0] ?? null,
    progress: {
      periodDays: 28,
      training: permissions.training.status === "granted" ? {
        completed: completedTraining,
        scheduled: completedTraining + skippedTraining,
        adherence: completedTraining + skippedTraining ? completedTraining / (completedTraining + skippedTraining) : null,
        totalVolumeKg: sum("totalVolumeKg"),
        daysWithData: summaries.filter(row => row.trainingFreshAt != null).length,
      } : null,
      nutrition: permissions.nutrition.status === "granted" ? {
        completed: mealsCompleted,
        substituted: mealsSubstituted,
        pending: mealsPending,
        adherence: mealsCompleted + mealsSubstituted + mealsPending ? mealsCompleted / (mealsCompleted + mealsSubstituted + mealsPending) : null,
        daysWithData: summaries.filter(row => row.nutritionFreshAt != null).length,
      } : null,
      metrics: permissions.metrics.status === "granted" ? {
        latestWeightKg: weights.at(-1) ?? null,
        weightChangeKg: weights.length > 1 ? weights.at(-1)! - weights[0] : null,
        daysWithData: weights.length,
      } : null,
    },
    plans: { workout: workoutPlans[0] ?? null, mealPlan: mealPlans[0] ?? null },
    checkins,
    signals,
    tasks,
    team,
    activity,
  };
}

export async function createFollowUpTask(input: {
  professionalUserId: string;
  athleteId: string;
  title: string;
  detail?: string;
  dueAt?: number;
  attentionSignalId?: string;
}) {
  const access = (await getProfessionalAccess(input.professionalUserId, input.athleteId))[0];
  if (!access) return null;
  const now = Date.now();
  const id = newId("task");
  await db.transaction(async (tx) => {
    await tx.insert(followUpTasks).values({
      id,
      organizationId: access.organizationId,
      attentionSignalId: input.attentionSignalId,
      athleteId: input.athleteId,
      assigneeMembershipId: access.membershipId,
      createdByMembershipId: access.membershipId,
      title: input.title,
      detail: input.detail,
      dueAt: input.dueAt,
      status: "open",
      createdAt: now,
    });
    await tx.insert(auditEvents).values({
      id: newId("audit"),
      organizationId: access.organizationId,
      actorMembershipId: access.membershipId,
      actorUserId: input.professionalUserId,
      action: "follow_up_task.created",
      subjectType: "athlete",
      subjectId: input.athleteId,
      metadata: { taskId: id, attentionSignalId: input.attentionSignalId },
      occurredAt: now,
    });
  });
  return { id, status: "open" as const, createdAt: now };
}
