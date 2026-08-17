import { randomBytes } from "crypto";

import { and, asc, desc, eq, gt, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  athleteDailySummaries,
  attentionSignals,
  bodyMeasurements,
  careAssignments,
  checkinRequests,
  checkinResponses,
  nutritionEntries,
  organizationClients,
  syncChanges,
  syncDevices,
  syncMutations,
  trainingSessions,
  trainingSets,
} from "@/db/schema";
import {
  CURRENT_SYNC_SCHEMA_VERSION,
  decodeSyncCursor,
  encodeSyncCursor,
  supportsSchemaVersion,
  type SyncMutation,
} from "@/lib/sync-contract";

const trainingSessionPayload = z.object({
  plannedSessionId: z.string().max(128).nullable().optional(),
  status: z.enum(["completed", "skipped"]),
  startedAt: z.number().int().positive(),
  completedAt: z.number().int().positive().nullable().optional(),
  durationSeconds: z.number().int().nonnegative().max(24 * 60 * 60).nullable().optional(),
  totalVolumeKg: z.number().finite().nonnegative().max(10_000_000).default(0),
  version: z.number().int().positive().default(1),
  supersedesId: z.string().max(128).nullable().optional(),
});

const trainingSetPayload = z.object({
  sessionId: z.string().min(1).max(128),
  exerciseName: z.string().trim().min(1).max(160),
  setIndex: z.number().int().nonnegative().max(500),
  reps: z.number().int().nonnegative().max(10_000),
  weightKg: z.number().finite().nonnegative().max(10_000),
  isPersonalRecord: z.boolean().default(false),
  completedAt: z.number().int().positive(),
  version: z.number().int().positive().default(1),
  supersedesId: z.string().max(128).nullable().optional(),
});

const nutritionPayload = z.object({
  mealKey: z.string().trim().min(1).max(120),
  status: z.enum(["completed", "substituted", "pending", "added", "omitted"]),
  note: z.string().trim().max(2000).nullable().optional(),
  occurredAt: z.number().int().positive(),
  version: z.number().int().positive(),
  supersedesId: z.string().max(128).nullable().optional(),
});

const measurementPayload = z.object({
  measuredAt: z.number().int().positive(),
  weightKg: z.number().finite().min(25).max(350),
  version: z.number().int().positive(),
  supersedesId: z.string().max(128).nullable().optional(),
});

const checkinPayload = z.object({
  requestId: z.string().min(1).max(128),
  schemaVersion: z.number().int().positive(),
  submittedAt: z.number().int().positive(),
  answers: z.object({
    energy: z.number().int().min(1).max(10),
    sleep: z.number().int().min(1).max(10),
    pain: z.number().int().min(0).max(10),
    stress: z.number().int().min(1).max(10),
    motivation: z.number().int().min(1).max(10),
    obstacles: z.string().trim().max(1000).default(""),
    note: z.string().trim().max(2000).default(""),
  }),
});

export type MutationStatus = "acked" | "retryable" | "rejected";

export interface MutationResult {
  mutationId: string;
  status: MutationStatus;
  serverSequence: number;
  error?: string;
}

export class WriterDeviceConflictError extends Error {
  constructor() {
    super("writer_device_conflict");
  }
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function utcDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

async function ensureWriterDevice(athleteId: string, deviceId: string, schemaVersion: number) {
  const [active] = await db.select().from(syncDevices).where(and(
    eq(syncDevices.athleteId, athleteId),
    eq(syncDevices.status, "active_writer"),
  ));
  const now = Date.now();
  if (active && active.id !== deviceId) throw new WriterDeviceConflictError();

  const [sameId] = await db.select().from(syncDevices).where(eq(syncDevices.id, deviceId));
  if (sameId && sameId.athleteId !== athleteId) throw new WriterDeviceConflictError();
  if (!sameId) {
    await db.insert(syncDevices).values({
      id: deviceId,
      athleteId,
      status: "active_writer",
      schemaVersion,
      registeredAt: now,
      lastSeenAt: now,
    });
  } else {
    await db.update(syncDevices).set({ schemaVersion, lastSeenAt: now }).where(eq(syncDevices.id, deviceId));
  }
}

async function rebuildDailySummary(tx: any, athleteId: string, timestamp: number) {
  const date = utcDate(timestamp);
  const start = Date.parse(`${date}T00:00:00.000Z`);
  const end = start + 24 * 60 * 60 * 1000;
  const [training] = await tx.select({
    completed: sql<number>`count(*) filter (where ${trainingSessions.status} = 'completed')`,
    skipped: sql<number>`count(*) filter (where ${trainingSessions.status} = 'skipped')`,
    volume: sql<number>`coalesce(sum(${trainingSessions.totalVolumeKg}), 0)`,
    freshAt: sql<number | null>`max(coalesce(${trainingSessions.completedAt}, ${trainingSessions.startedAt}))`,
  }).from(trainingSessions).where(and(
    eq(trainingSessions.athleteId, athleteId),
    gte(trainingSessions.startedAt, start),
    lt(trainingSessions.startedAt, end),
  ));
  const [nutrition] = await tx.select({
    completed: sql<number>`count(*) filter (where ${nutritionEntries.status} = 'completed' and ${nutritionEntries.deletedAt} is null)`,
    substituted: sql<number>`count(*) filter (where ${nutritionEntries.status} = 'substituted' and ${nutritionEntries.deletedAt} is null)`,
    pending: sql<number>`count(*) filter (where ${nutritionEntries.status} = 'pending' and ${nutritionEntries.deletedAt} is null)`,
    freshAt: sql<number | null>`max(${nutritionEntries.updatedAt})`,
  }).from(nutritionEntries).where(and(
    eq(nutritionEntries.athleteId, athleteId),
    gte(nutritionEntries.occurredAt, start),
    lt(nutritionEntries.occurredAt, end),
  ));
  const [measurement] = await tx.select({
    weight: bodyMeasurements.weightKg,
    freshAt: bodyMeasurements.measuredAt,
  }).from(bodyMeasurements).where(and(
    eq(bodyMeasurements.athleteId, athleteId),
    gte(bodyMeasurements.measuredAt, start),
    lt(bodyMeasurements.measuredAt, end),
  )).orderBy(desc(bodyMeasurements.measuredAt)).limit(1);
  const [checkins] = await tx.select({
    count: sql<number>`count(*)`,
    freshAt: sql<number | null>`max(${checkinResponses.submittedAt})`,
  }).from(checkinResponses)
    .innerJoin(checkinRequests, eq(checkinRequests.id, checkinResponses.requestId))
    .where(and(
      eq(checkinRequests.athleteId, athleteId),
      gte(checkinResponses.submittedAt, start),
      lt(checkinResponses.submittedAt, end),
    ));

  const values = {
    id: `${athleteId}:${date}`,
    athleteId,
    date,
    trainingCompleted: Number(training?.completed ?? 0),
    trainingSkipped: Number(training?.skipped ?? 0),
    totalVolumeKg: Number(training?.volume ?? 0),
    mealsCompleted: Number(nutrition?.completed ?? 0),
    mealsSubstituted: Number(nutrition?.substituted ?? 0),
    mealsPending: Number(nutrition?.pending ?? 0),
    latestWeightKg: measurement?.weight ?? null,
    checkinsSubmitted: Number(checkins?.count ?? 0),
    trainingFreshAt: training?.freshAt == null ? null : Number(training.freshAt),
    nutritionFreshAt: nutrition?.freshAt == null ? null : Number(nutrition.freshAt),
    metricsFreshAt: measurement?.freshAt ?? null,
    checkinsFreshAt: checkins?.freshAt == null ? null : Number(checkins.freshAt),
    updatedAt: Date.now(),
  };
  await tx.insert(athleteDailySummaries).values(values).onConflictDoUpdate({
    target: [athleteDailySummaries.athleteId, athleteDailySummaries.date],
    set: values,
  });
}

async function applyDomainMutation(tx: any, athleteId: string, deviceId: string, mutation: SyncMutation) {
  const now = Date.now();
  switch (mutation.entityType) {
    case "training_session": {
      if (mutation.operation !== "create") return { status: "rejected" as const, error: "immutable_entity" };
      const parsed = trainingSessionPayload.safeParse(mutation.payload);
      if (!parsed.success) return { status: "rejected" as const, error: "invalid_training_session" };
      const [existing] = await tx.select({ id: trainingSessions.id }).from(trainingSessions).where(eq(trainingSessions.id, mutation.entityId));
      if (existing) return { status: "rejected" as const, error: "entity_exists" };
      await tx.insert(trainingSessions).values({
        id: mutation.entityId,
        athleteId,
        deviceId,
        plannedSessionId: parsed.data.plannedSessionId,
        status: parsed.data.status,
        startedAt: parsed.data.startedAt,
        completedAt: parsed.data.completedAt,
        durationSeconds: parsed.data.durationSeconds,
        totalVolumeKg: parsed.data.totalVolumeKg,
        version: parsed.data.version,
        supersedesId: parsed.data.supersedesId,
        createdAt: now,
      });
      await rebuildDailySummary(tx, athleteId, parsed.data.startedAt);
      return { status: "acked" as const };
    }
    case "training_set": {
      if (mutation.operation !== "create") return { status: "rejected" as const, error: "immutable_entity" };
      const parsed = trainingSetPayload.safeParse(mutation.payload);
      if (!parsed.success) return { status: "rejected" as const, error: "invalid_training_set" };
      const [session] = await tx.select({ id: trainingSessions.id }).from(trainingSessions).where(and(
        eq(trainingSessions.id, parsed.data.sessionId),
        eq(trainingSessions.athleteId, athleteId),
      ));
      if (!session) return { status: "retryable" as const, error: "session_not_synced" };
      const [existing] = await tx.select({ id: trainingSets.id }).from(trainingSets).where(eq(trainingSets.id, mutation.entityId));
      if (existing) return { status: "rejected" as const, error: "entity_exists" };
      await tx.insert(trainingSets).values({
        id: mutation.entityId,
        athleteId,
        sessionId: parsed.data.sessionId,
        exerciseName: parsed.data.exerciseName,
        setIndex: parsed.data.setIndex,
        reps: parsed.data.reps,
        weightKg: parsed.data.weightKg,
        isPersonalRecord: parsed.data.isPersonalRecord ? 1 : 0,
        completedAt: parsed.data.completedAt,
        version: parsed.data.version,
        supersedesId: parsed.data.supersedesId,
      });
      return { status: "acked" as const };
    }
    case "nutrition_entry": {
      const parsed = nutritionPayload.safeParse(mutation.payload);
      if (!parsed.success) return { status: "rejected" as const, error: "invalid_nutrition_entry" };
      const [current] = await tx.select().from(nutritionEntries).where(eq(nutritionEntries.id, mutation.entityId));
      if (mutation.operation === "create") {
        if (current) return { status: "rejected" as const, error: "entity_exists" };
        await tx.insert(nutritionEntries).values({
          id: mutation.entityId,
          athleteId,
          deviceId,
          ...parsed.data,
          updatedAt: now,
        });
      } else {
        if (!current || current.athleteId !== athleteId) return { status: "rejected" as const, error: "entity_not_found" };
        if (mutation.baseVersion == null || mutation.baseVersion !== current.version) {
          return { status: "rejected" as const, error: "version_conflict" };
        }
        await tx.update(nutritionEntries).set({
          ...parsed.data,
          deletedAt: mutation.operation === "delete" ? now : null,
          updatedAt: now,
        }).where(eq(nutritionEntries.id, mutation.entityId));
      }
      await rebuildDailySummary(tx, athleteId, parsed.data.occurredAt);
      return { status: "acked" as const };
    }
    case "body_measurement": {
      const parsed = measurementPayload.safeParse(mutation.payload);
      if (!parsed.success) return { status: "rejected" as const, error: "invalid_body_measurement" };
      const [current] = await tx.select().from(bodyMeasurements).where(eq(bodyMeasurements.id, mutation.entityId));
      if (mutation.operation === "create") {
        if (current) return { status: "rejected" as const, error: "entity_exists" };
        await tx.insert(bodyMeasurements).values({
          id: mutation.entityId,
          athleteId,
          measuredAt: parsed.data.measuredAt,
          weightKg: parsed.data.weightKg,
          version: parsed.data.version,
          supersedesId: parsed.data.supersedesId,
          sourceDeviceId: deviceId,
          createdAt: now,
        });
      } else {
        if (!current || current.athleteId !== athleteId) return { status: "rejected" as const, error: "entity_not_found" };
        if (mutation.baseVersion == null || mutation.baseVersion !== current.version) {
          return { status: "rejected" as const, error: "version_conflict" };
        }
        await tx.update(bodyMeasurements).set({
          measuredAt: parsed.data.measuredAt,
          weightKg: parsed.data.weightKg,
          version: parsed.data.version,
          supersedesId: parsed.data.supersedesId,
          deletedAt: mutation.operation === "delete" ? now : null,
        }).where(eq(bodyMeasurements.id, mutation.entityId));
      }
      await rebuildDailySummary(tx, athleteId, parsed.data.measuredAt);
      return { status: "acked" as const };
    }
    case "checkin_response": {
      if (mutation.operation !== "create") return { status: "rejected" as const, error: "immutable_entity" };
      const parsed = checkinPayload.safeParse(mutation.payload);
      if (!parsed.success) return { status: "rejected" as const, error: "invalid_checkin_response" };
      const [request] = await tx.select({
        id: checkinRequests.id,
        athleteId: checkinRequests.athleteId,
        status: checkinRequests.status,
        assignmentId: careAssignments.id,
        organizationId: organizationClients.organizationId,
      }).from(checkinRequests)
        .innerJoin(careAssignments, eq(careAssignments.id, checkinRequests.careAssignmentId))
        .innerJoin(organizationClients, eq(organizationClients.id, careAssignments.organizationClientId))
        .where(eq(checkinRequests.id, parsed.data.requestId));
      if (!request || request.athleteId !== athleteId) return { status: "rejected" as const, error: "checkin_not_found" };
      if (request.status !== "pending") return { status: "rejected" as const, error: "checkin_already_submitted" };
      await tx.insert(checkinResponses).values({
        id: mutation.entityId,
        requestId: request.id,
        schemaVersion: parsed.data.schemaVersion,
        answers: parsed.data.answers,
        submittedAt: parsed.data.submittedAt,
      });
      await tx.update(checkinRequests).set({ status: "submitted", submittedAt: parsed.data.submittedAt }).where(eq(checkinRequests.id, request.id));
      const severity = parsed.data.answers.pain >= 7 ? "urgent" : "attention";
      await tx.insert(attentionSignals).values({
        id: newId("signal"),
        organizationId: request.organizationId,
        ownerAssignmentId: request.assignmentId,
        checkinRequestId: request.id,
        athleteId,
        reasonCode: "checkin_submitted",
        dedupeKey: `checkin_submitted:${request.id}`,
        evidence: {
          pain: parsed.data.answers.pain,
          energy: parsed.data.answers.energy,
          sleep: parsed.data.answers.sleep,
          stress: parsed.data.answers.stress,
          motivation: parsed.data.answers.motivation,
          hasNote: Boolean(parsed.data.answers.note || parsed.data.answers.obstacles),
        },
        severity,
        status: "open",
        suggestedAction: "review_checkin",
        openedAt: parsed.data.submittedAt,
      }).onConflictDoNothing();
      await rebuildDailySummary(tx, athleteId, parsed.data.submittedAt);
      return { status: "acked" as const };
    }
  }
}

async function persistLedger(
  athleteId: string,
  deviceId: string,
  mutation: SyncMutation,
  status: MutationStatus,
  error?: string,
): Promise<MutationResult> {
  const [row] = await db.insert(syncMutations).values({
    id: newId("mutation"),
    athleteId,
    deviceId,
    mutationId: mutation.mutationId,
    schemaVersion: mutation.schemaVersion,
    entityType: mutation.entityType,
    entityId: mutation.entityId,
    operation: mutation.operation,
    status,
    errorCode: error,
    occurredAt: mutation.occurredAt,
    receivedAt: Date.now(),
  }).returning({ serverSequence: syncMutations.serverSequence });
  return { mutationId: mutation.mutationId, status, serverSequence: row.serverSequence, ...(error ? { error } : {}) };
}

async function processMutation(athleteId: string, deviceId: string, mutation: SyncMutation): Promise<MutationResult> {
  const [existing] = await db.select({
    id: syncMutations.id,
    status: syncMutations.status,
    serverSequence: syncMutations.serverSequence,
    error: syncMutations.errorCode,
  }).from(syncMutations).where(and(
    eq(syncMutations.athleteId, athleteId),
    eq(syncMutations.deviceId, deviceId),
    eq(syncMutations.mutationId, mutation.mutationId),
  ));
  if (existing && existing.status !== "retryable") return {
    mutationId: mutation.mutationId,
    status: existing.status as MutationStatus,
    serverSequence: existing.serverSequence,
    ...(existing.error ? { error: existing.error } : {}),
  };

  try {
    return await db.transaction(async (tx) => {
      const domainResult = await applyDomainMutation(tx, athleteId, deviceId, mutation);
      if (existing) {
        await tx.update(syncMutations).set({
          status: domainResult.status,
          errorCode: domainResult.error ?? null,
          receivedAt: Date.now(),
        }).where(eq(syncMutations.id, existing.id));
        return {
          mutationId: mutation.mutationId,
          status: domainResult.status,
          serverSequence: existing.serverSequence,
          ...(domainResult.error ? { error: domainResult.error } : {}),
        };
      }
      const [ledger] = await tx.insert(syncMutations).values({
        id: newId("mutation"),
        athleteId,
        deviceId,
        mutationId: mutation.mutationId,
        schemaVersion: mutation.schemaVersion,
        entityType: mutation.entityType,
        entityId: mutation.entityId,
        operation: mutation.operation,
        status: domainResult.status,
        errorCode: domainResult.error,
        occurredAt: mutation.occurredAt,
        receivedAt: Date.now(),
      }).returning({ serverSequence: syncMutations.serverSequence });
      return {
        mutationId: mutation.mutationId,
        status: domainResult.status,
        serverSequence: ledger.serverSequence,
        ...(domainResult.error ? { error: domainResult.error } : {}),
      };
    });
  } catch {
    if (existing) return {
      mutationId: mutation.mutationId,
      status: "retryable",
      serverSequence: existing.serverSequence,
      error: "temporary_server_error",
    };
    try {
      return await persistLedger(athleteId, deviceId, mutation, "retryable", "temporary_server_error");
    } catch {
      const [raced] = await db.select({
        status: syncMutations.status,
        serverSequence: syncMutations.serverSequence,
        error: syncMutations.errorCode,
      }).from(syncMutations).where(and(
        eq(syncMutations.athleteId, athleteId),
        eq(syncMutations.deviceId, deviceId),
        eq(syncMutations.mutationId, mutation.mutationId),
      ));
      if (raced) return {
        mutationId: mutation.mutationId,
        status: raced.status as MutationStatus,
        serverSequence: raced.serverSequence,
        ...(raced.error ? { error: raced.error } : {}),
      };
      throw new Error("sync_ledger_unavailable");
    }
  }
}

export async function pushMutations(athleteId: string, deviceId: string, mutations: SyncMutation[]) {
  const unsupported = mutations.find(mutation => !supportsSchemaVersion(mutation.schemaVersion));
  if (unsupported) return {
    upgradeRequired: true as const,
    currentSchemaVersion: CURRENT_SYNC_SCHEMA_VERSION,
    minimumSchemaVersion: CURRENT_SYNC_SCHEMA_VERSION - 1,
  };
  await ensureWriterDevice(athleteId, deviceId, Math.max(...mutations.map(mutation => mutation.schemaVersion)));
  const results: MutationResult[] = [];
  for (const mutation of mutations) results.push(await processMutation(athleteId, deviceId, mutation));
  return { upgradeRequired: false as const, results };
}

export async function pullChanges(input: {
  athleteId: string;
  cursor: string | null;
  deviceId?: string | null;
  ackSequence?: number | null;
  limit?: number;
}) {
  const sequence = decodeSyncCursor(input.cursor);
  if (sequence == null) return null;
  const limit = Math.min(100, Math.max(1, input.limit ?? 100));
  if (input.deviceId && input.ackSequence != null) {
    await db.update(syncDevices).set({
      lastAckSequence: input.ackSequence,
      lastSeenAt: Date.now(),
    }).where(and(eq(syncDevices.id, input.deviceId), eq(syncDevices.athleteId, input.athleteId)));
  }
  const changes = await db.select().from(syncChanges).where(and(
    eq(syncChanges.athleteId, input.athleteId),
    gt(syncChanges.serverSequence, sequence),
  )).orderBy(asc(syncChanges.serverSequence)).limit(limit);
  const nextSequence = changes.at(-1)?.serverSequence ?? sequence;
  const pendingAcks = input.deviceId
    ? await db.select({
        mutationId: syncMutations.mutationId,
        status: syncMutations.status,
        serverSequence: syncMutations.serverSequence,
        error: syncMutations.errorCode,
      }).from(syncMutations).where(and(
        eq(syncMutations.athleteId, input.athleteId),
        eq(syncMutations.deviceId, input.deviceId),
        gt(syncMutations.serverSequence, input.ackSequence ?? 0),
      )).orderBy(asc(syncMutations.serverSequence)).limit(100)
    : [];
  return {
    changes,
    pendingAcks,
    nextCursor: encodeSyncCursor(nextSequence),
    hasMore: changes.length === limit,
    schemaVersion: CURRENT_SYNC_SCHEMA_VERSION,
  };
}
