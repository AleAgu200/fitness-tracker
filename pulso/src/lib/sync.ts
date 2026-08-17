// Pulls professional assignments (workout / meal plan) from the server and
// applies them onto the local SQLite tables. The phone stays usable offline;
// sync is opportunistic at app load.

import * as SecureStore from 'expo-secure-store';
import { and, eq, inArray } from 'drizzle-orm';

import { DAYS_PER_WEEK, replaceWeekMealSlots } from '@/db/nutrition';
import { AssignedExercise, replacePlanExercises } from '@/db/plan';
import { db } from '@/db';
import {
  ensureSyncState,
  getReadyOutbox,
  getSyncSummary,
  localCareAssignments,
  localSharingConsents,
  professionalCheckinRequests,
  saveLocalSharingConsent,
  SharingCategory,
  syncOutbox,
  syncState,
} from '@/db/sync';
import { ApiError, apiFetch } from './api';

interface WorkoutAssignment {
  version: number;
  payload: { coachName: string; exercises: AssignedExercise[] };
}

interface MealPlanAssignment {
  version: number;
  payload: {
    nutritionistName: string;
    meals: { label: string; time: string; n: string; kcal: number; p: number; c: number; g: number }[];
  };
}

export interface SyncResult {
  workoutBy: string | null;
  mealsBy: string | null;
  workoutChanged: boolean;
  mealsChanged: boolean;
}

const kv = {
  get: (k: string) => SecureStore.getItemAsync(k).catch(() => null),
  set: (k: string, v: string) => SecureStore.setItemAsync(k, v).catch(() => {}),
  del: (k: string) => SecureStore.deleteItemAsync(k).catch(() => {}),
};

const keys = (uid: string) => ({
  wVersion: `pulso_aw_v_${uid}`,
  wBy: `pulso_aw_by_${uid}`,
  mVersion: `pulso_amp_v_${uid}`,
  mBy: `pulso_amp_by_${uid}`,
});

/** Last-known assignment authors, for offline attribution banners. */
export async function getStoredAssignmentMeta(userId: string): Promise<{ workoutBy: string | null; mealsBy: string | null }> {
  const k = keys(userId);
  return {
    workoutBy: await kv.get(k.wBy),
    mealsBy: await kv.get(k.mBy),
  };
}

export async function syncAssignments(
  userId: string,
  templateId: string,
  mealPlanId: string,
): Promise<SyncResult> {
  const res = await apiFetch<{ workout: WorkoutAssignment | null; mealPlan: MealPlanAssignment | null }>(
    '/api/assignments',
  );
  const k = keys(userId);
  const result: SyncResult = { workoutBy: null, mealsBy: null, workoutChanged: false, mealsChanged: false };

  if (res.workout) {
    result.workoutBy = res.workout.payload.coachName || 'tu coach';
    const applied = Number(await kv.get(k.wVersion)) || 0;
    if (res.workout.version > applied) {
      await replacePlanExercises(userId, templateId, res.workout.payload.exercises);
      await kv.set(k.wVersion, String(res.workout.version));
      result.workoutChanged = true;
    }
    await kv.set(k.wBy, result.workoutBy);
  } else {
    await kv.del(k.wBy);
  }

  if (res.mealPlan) {
    result.mealsBy = res.mealPlan.payload.nutritionistName || 'tu nutricionista';
    const applied = Number(await kv.get(k.mVersion)) || 0;
    if (res.mealPlan.version > applied) {
      // A nutritionist still assigns a single daily template. Applying it to
      // every weekday keeps that meaning intact now that plans are per-day,
      // instead of leaving six days empty.
      const assigned = res.mealPlan.payload.meals.map(m => ({
        label: m.label,
        time: m.time,
        n: m.n,
        kcal: m.kcal,
        p: m.p,
        c: m.c,
        g: m.g,
      }));
      await replaceWeekMealSlots(
        mealPlanId,
        Array.from({ length: DAYS_PER_WEEK }, (_, i) => ({ weekday: i + 1, meals: assigned })),
      );
      await kv.set(k.mVersion, String(res.mealPlan.version));
      result.mealsChanged = true;
    }
    await kv.set(k.mBy, result.mealsBy);
  } else {
    await kv.del(k.mBy);
  }

  return result;
}

type PushStatus = 'acked' | 'retryable' | 'rejected';

interface PushResult {
  mutationId: string;
  status: PushStatus;
  serverSequence: number;
  error?: string;
}

interface PullChange {
  serverSequence: number;
  entityType: string;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  payload: unknown;
  createdAt: number;
}

interface PullResponse {
  changes: PullChange[];
  pendingAcks: PushResult[];
  nextCursor: string;
  hasMore: boolean;
  schemaVersion: number;
}

type SyncTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const syncFlights = new Map<string, Promise<MobileSyncResult>>();

function retryDelay(attempt: number): number {
  return Math.min(5 * 60_000, 2 ** Math.min(attempt, 6) * 2_000);
}

async function reconcileResults(results: PushResult[]) {
  const acked = results.filter(result => result.status === 'acked').map(result => result.mutationId);
  if (acked.length) await db.delete(syncOutbox).where(inArray(syncOutbox.mutationId, acked));
  for (const result of results.filter(result => result.status !== 'acked')) {
    const [row] = await db.select({ attempts: syncOutbox.attempts }).from(syncOutbox)
      .where(eq(syncOutbox.mutationId, result.mutationId)).limit(1);
    if (!row) continue;
    const attempts = row.attempts + 1;
    await db.update(syncOutbox).set({
      status: result.status === 'retryable' ? 'retryable' : 'rejected',
      attempts,
      serverSequence: result.serverSequence,
      errorCode: result.error ?? result.status,
      nextAttemptAt: result.status === 'retryable' ? new Date(Date.now() + retryDelay(attempts)) : null,
      updatedAt: new Date(),
    }).where(eq(syncOutbox.mutationId, result.mutationId));
  }
}

async function applyChange(tx: SyncTransaction, athleteId: string, change: PullChange) {
  const now = new Date(change.createdAt);
  const payload = (change.payload ?? {}) as Record<string, unknown>;
  if (change.entityType === 'checkin_request') {
    if (change.operation === 'delete') {
      await tx.update(professionalCheckinRequests).set({ status: 'cancelled', updatedAt: now })
        .where(eq(professionalCheckinRequests.id, change.entityId));
      return;
    }
    await tx.insert(professionalCheckinRequests).values({
      id: change.entityId,
      athleteId,
      dueAt: new Date(Number(payload.dueAt)),
      schemaVersion: Number(payload.schemaVersion ?? 1),
      questions: JSON.stringify(payload.questions ?? []),
      status: 'pending',
      receivedAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: professionalCheckinRequests.id,
      set: { dueAt: new Date(Number(payload.dueAt)), questions: JSON.stringify(payload.questions ?? []), updatedAt: now },
    });
    return;
  }
  if (change.entityType === 'sharing_permissions') {
    const organizationId = String(payload.organizationId ?? '');
    const categories = Array.isArray(payload.categories) ? payload.categories : [];
    for (const category of categories) {
      if (['training', 'nutrition', 'metrics', 'checkins', 'photos'].includes(String(category))) {
        const typedCategory = category as SharingCategory;
        const id = `${athleteId}:${organizationId}:${typedCategory}`;
        await tx.insert(localSharingConsents).values({ id, athleteId, organizationId, category: typedCategory, granted: true, updatedAt: now })
          .onConflictDoUpdate({ target: localSharingConsents.id, set: { granted: true, updatedAt: now } });
      }
    }
    return;
  }
  if (change.entityType === 'sharing_consent') {
    const organizationId = String(payload.organizationId ?? '');
    const category = payload.category as SharingCategory;
    const granted = Boolean(payload.granted);
    const updatedAt = new Date(Number(payload.updatedAt ?? change.createdAt));
    const id = `${athleteId}:${organizationId}:${category}`;
    await tx.insert(localSharingConsents).values({ id, athleteId, organizationId, category, granted, updatedAt })
      .onConflictDoUpdate({ target: localSharingConsents.id, set: { granted, updatedAt } });
    return;
  }
  if (change.entityType === 'care_assignment') {
    const organizationId = String(payload.organizationId ?? '');
    const discipline = payload.discipline === 'nutritionist' ? 'nutritionist' : 'coach';
    await tx.insert(localCareAssignments).values({
      id: change.entityId,
      athleteId,
      organizationId,
      discipline,
      primary: Boolean(payload.primary),
      active: change.operation !== 'delete',
      updatedAt: now,
    }).onConflictDoUpdate({
      target: localCareAssignments.id,
      set: { organizationId, discipline, primary: Boolean(payload.primary), active: change.operation !== 'delete', updatedAt: now },
    });
  }
}

export type MobileSyncResult = Awaited<ReturnType<typeof getSyncSummary>>;

const CATEGORY_BY_ENTITY: Record<string, SharingCategory> = {
  training_session: 'training',
  training_set: 'training',
  nutrition_entry: 'nutrition',
  body_measurement: 'metrics',
  checkin_response: 'checkins',
};

async function pushAllowedOutbox(athleteId: string, deviceId: string) {
  const granted = await db.select({ category: localSharingConsents.category }).from(localSharingConsents).where(and(
    eq(localSharingConsents.athleteId, athleteId),
    eq(localSharingConsents.granted, true),
  ));
  const allowed = new Set(granted.map(item => item.category));
  const outbox = (await getReadyOutbox(athleteId, 1000))
    .filter(row => allowed.has(CATEGORY_BY_ENTITY[row.entityType]));
  if (!outbox.length) return;
  const priority = (type: string) => type === 'training_session' ? 0 : type === 'training_set' ? 1 : 2;
  const version = (payload: string) => Number((JSON.parse(payload) as { version?: number }).version ?? 1);
  outbox.sort((a, b) =>
    priority(a.entityType) - priority(b.entityType)
    || (a.entityId === b.entityId ? version(a.payload) - version(b.payload) : 0)
    || a.createdAt.getTime() - b.createdAt.getTime()
    || a.mutationId.localeCompare(b.mutationId));
  const batch = outbox.slice(0, 100);
  const pushed = await apiFetch<{ results: PushResult[] }>('/api/sync/push', {
    method: 'POST',
    body: {
      deviceId,
      mutations: batch.map(row => ({
        schemaVersion: row.schemaVersion,
        mutationId: row.mutationId,
        entityType: row.entityType,
        entityId: row.entityId,
        operation: row.operation,
        baseVersion: row.baseVersion,
        occurredAt: row.occurredAt.getTime(),
        payload: JSON.parse(row.payload),
      })),
    },
  });
  await reconcileResults(pushed.results);
}

async function performMobileSync(athleteId: string): Promise<MobileSyncResult> {
  const state = await ensureSyncState(athleteId);
  const startedAt = new Date();
  await db.update(syncState).set({ lastSyncAt: startedAt, lastError: null, updatedAt: startedAt })
    .where(eq(syncState.athleteId, athleteId));
  try {
    let cursor = state.cursor;
    let lastAckSequence = state.lastAckSequence;
    let hasMore = true;
    while (hasMore) {
      const query = new URLSearchParams({ deviceId: state.deviceId, ackSequence: String(lastAckSequence), limit: '100' });
      if (cursor) query.set('cursor', cursor);
      const pulled = await apiFetch<PullResponse>(`/api/sync/pull?${query.toString()}`);
      lastAckSequence = Math.max(lastAckSequence, ...pulled.pendingAcks.map(item => item.serverSequence), 0);
      await db.transaction(async tx => {
        // applyChange only uses idempotent upserts. It intentionally runs before
        // advancing the cursor so a failed projection is replayed on next sync.
        for (const change of pulled.changes) await applyChange(tx, athleteId, change);
        cursor = pulled.nextCursor;
        await tx.update(syncState).set({ cursor, lastAckSequence, updatedAt: new Date() })
          .where(eq(syncState.athleteId, athleteId));
      });
      if (pulled.pendingAcks.length) await reconcileResults(pulled.pendingAcks);
      hasMore = pulled.hasMore;
    }
    // Pull first so current sharing permissions are authoritative before any
    // activity leaves the device. Revoked categories remain safely queued.
    await pushAllowedOutbox(athleteId, state.deviceId);
    const completedAt = new Date();
    await db.update(syncState).set({
      lastSuccessAt: completedAt,
      lastError: null,
      upgradeRequired: false,
      writerConflict: false,
      updatedAt: completedAt,
    }).where(eq(syncState.athleteId, athleteId));
  } catch (error) {
    const upgradeRequired = error instanceof ApiError && error.status === 426;
    const writerConflict = error instanceof ApiError && error.status === 409;
    const code = error instanceof ApiError ? error.code ?? `http_${error.status}` : 'network_unavailable';
    await db.update(syncState).set({ lastError: code, upgradeRequired, writerConflict, updatedAt: new Date() })
      .where(eq(syncState.athleteId, athleteId));
  }
  return getSyncSummary(athleteId);
}

export function syncMobileData(athleteId: string): Promise<MobileSyncResult> {
  const active = syncFlights.get(athleteId);
  if (active) return active;
  const flight = performMobileSync(athleteId).finally(() => syncFlights.delete(athleteId));
  syncFlights.set(athleteId, flight);
  return flight;
}

export async function updateSharingConsent(athleteId: string, organizationId: string, category: SharingCategory, granted: boolean) {
  const result = await apiFetch<{ consent: { updatedAt: number } }>('/api/sharing-consents', {
    method: 'PUT', body: { organizationId, category, granted },
  });
  await saveLocalSharingConsent(athleteId, organizationId, category, granted, result.consent.updatedAt);
}
