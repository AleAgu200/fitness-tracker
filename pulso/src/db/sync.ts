import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm';

import { nanoid } from '@/lib/id';
import { db } from './index';
import {
  localCareAssignments,
  localSharingConsents,
  professionalCheckinRequests,
  professionalCheckinResponses,
  syncOutbox,
  syncState,
} from './schema';

export const SYNC_SCHEMA_VERSION = 2;

export type SyncEntityType = 'training_session' | 'training_set' | 'nutrition_entry' | 'body_measurement' | 'checkin_response';
export type SyncOperation = 'create' | 'update' | 'delete';
export type SharingCategory = 'training' | 'nutrition' | 'metrics' | 'checkins' | 'photos';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type SyncWriter = Pick<typeof db, 'insert'> | Pick<Transaction, 'insert'>;

export async function enqueueSyncMutation(writer: SyncWriter, input: {
  athleteId: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  baseVersion?: number | null;
  occurredAt: Date;
  payload: unknown;
}): Promise<string> {
  const mutationId = `mut_${nanoid()}`;
  await writer.insert(syncOutbox).values({
    mutationId,
    athleteId: input.athleteId,
    schemaVersion: SYNC_SCHEMA_VERSION,
    entityType: input.entityType,
    entityId: input.entityId,
    operation: input.operation,
    baseVersion: input.baseVersion ?? null,
    occurredAt: input.occurredAt,
    payload: JSON.stringify(input.payload),
    status: 'pending',
    attempts: 0,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  });
  return mutationId;
}

export async function ensureSyncState(athleteId: string) {
  const [existing] = await db.select().from(syncState).where(eq(syncState.athleteId, athleteId)).limit(1);
  if (existing) return existing;
  const now = new Date();
  const created = {
    athleteId,
    deviceId: `device_${nanoid()}`,
    cursor: null,
    lastAckSequence: 0,
    lastSyncAt: null,
    lastSuccessAt: null,
    lastError: null,
    upgradeRequired: false,
    writerConflict: false,
    updatedAt: now,
  };
  await db.insert(syncState).values(created).onConflictDoNothing();
  return (await db.select().from(syncState).where(eq(syncState.athleteId, athleteId)).limit(1))[0];
}

export async function getReadyOutbox(athleteId: string, limit = 100) {
  return db.select().from(syncOutbox).where(and(
    eq(syncOutbox.athleteId, athleteId),
    or(eq(syncOutbox.status, 'pending'), eq(syncOutbox.status, 'retryable')),
    or(isNull(syncOutbox.nextAttemptAt), lte(syncOutbox.nextAttemptAt, new Date())),
  )).orderBy(asc(syncOutbox.createdAt)).limit(limit);
}

export async function getSyncSummary(athleteId: string) {
  const state = await ensureSyncState(athleteId);
  const counts = await db.select({
    pending: sql<number>`sum(case when ${syncOutbox.status} in ('pending', 'retryable') then 1 else 0 end)`,
    rejected: sql<number>`sum(case when ${syncOutbox.status} = 'rejected' then 1 else 0 end)`,
  }).from(syncOutbox).where(eq(syncOutbox.athleteId, athleteId));
  return {
    lastSuccessAt: state.lastSuccessAt,
    lastError: state.lastError,
    upgradeRequired: state.upgradeRequired,
    writerConflict: state.writerConflict,
    pending: Number(counts[0]?.pending ?? 0),
    rejected: Number(counts[0]?.rejected ?? 0),
  };
}

export async function getPendingProfessionalCheckin(athleteId: string) {
  const rows = await db.select().from(professionalCheckinRequests)
    .where(and(eq(professionalCheckinRequests.athleteId, athleteId), eq(professionalCheckinRequests.status, 'pending')))
    .orderBy(asc(professionalCheckinRequests.dueAt)).limit(1);
  if (!rows[0]) return null;
  return { ...rows[0], questions: JSON.parse(rows[0].questions) as CheckinQuestion[] };
}

export interface CheckinQuestion {
  id: 'energy' | 'sleep' | 'pain' | 'stress' | 'motivation' | 'obstacles' | 'note';
  label: string;
  type: 'scale' | 'text';
  min?: number;
  max?: number;
  required: boolean;
}

export type ProfessionalCheckinRequest = typeof professionalCheckinRequests.$inferSelect;

export interface CheckinAnswers {
  energy: number;
  sleep: number;
  pain: number;
  stress: number;
  motivation: number;
  obstacles?: string;
  note?: string;
}

export async function submitProfessionalCheckin(athleteId: string, requestId: string, answers: CheckinAnswers) {
  const [request] = await db.select().from(professionalCheckinRequests)
    .where(and(eq(professionalCheckinRequests.id, requestId), eq(professionalCheckinRequests.athleteId, athleteId), eq(professionalCheckinRequests.status, 'pending'))).limit(1);
  if (!request) throw new Error('checkin_not_pending');
  const now = new Date();
  const responseId = `checkin_response_${nanoid()}`;
  await db.transaction(async tx => {
    await tx.insert(professionalCheckinResponses).values({
      id: responseId,
      requestId,
      schemaVersion: request.schemaVersion,
      answers: JSON.stringify(answers),
      submittedAt: now,
    });
    await tx.update(professionalCheckinRequests).set({ status: 'submitted', updatedAt: now })
      .where(eq(professionalCheckinRequests.id, requestId));
    await enqueueSyncMutation(tx, {
      athleteId,
      entityType: 'checkin_response',
      entityId: responseId,
      operation: 'create',
      occurredAt: now,
      payload: { requestId, schemaVersion: request.schemaVersion, submittedAt: now.getTime(), answers },
    });
  });
}

export async function getLocalSharingConsents(athleteId: string) {
  return db.select().from(localSharingConsents).where(eq(localSharingConsents.athleteId, athleteId))
    .orderBy(asc(localSharingConsents.organizationId), asc(localSharingConsents.category));
}

export async function saveLocalSharingConsent(athleteId: string, organizationId: string, category: SharingCategory, granted: boolean, updatedAt = Date.now()) {
  const id = `${athleteId}:${organizationId}:${category}`;
  await db.insert(localSharingConsents).values({ id, athleteId, organizationId, category, granted, updatedAt: new Date(updatedAt) })
    .onConflictDoUpdate({ target: localSharingConsents.id, set: { granted, updatedAt: new Date(updatedAt) } });
}

export { localCareAssignments, localSharingConsents, professionalCheckinRequests, syncOutbox, syncState };
