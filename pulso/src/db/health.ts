// Local storage for Health Connect / Apple Health data. Everything is scoped
// to one account; imported rows are keyed by provider + provider record ID,
// so repeating an import updates rows instead of adding them.

import { and, asc, desc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';

import { nanoid } from '@/lib/id';
import type { ImportedRecord, ImportMetric } from '@/lib/health/types';
import type { ProviderId } from '@/lib/health/model';
import { db } from './index';
import {
  bodyMeasurements,
  HealthMetric,
  healthConnections,
  healthDailySteps,
  healthMetricSources,
  healthSamples,
  healthSyncCursors,
  healthWorkoutExports,
  sleepEntries,
  workoutSessions,
  workoutTemplates,
} from './schema';

export interface ConnectionState {
  provider: ProviderId;
  status: 'connected' | 'disconnected';
  readMetrics: HealthMetric[];
  writeWorkouts: boolean;
  connectedAt: Date | null;
  lastImportAt: Date | null;
  lastError: string | null;
}

function parseMetrics(json: string): HealthMetric[] {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value.filter((item): item is HealthMetric => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export async function getConnections(athleteId: string): Promise<ConnectionState[]> {
  const rows = await db.select().from(healthConnections).where(eq(healthConnections.athleteId, athleteId));
  return rows.map(row => ({
    provider: row.provider,
    status: row.status,
    readMetrics: parseMetrics(row.readMetrics),
    writeWorkouts: row.writeWorkouts,
    connectedAt: row.connectedAt,
    lastImportAt: row.lastImportAt,
    lastError: row.lastError,
  }));
}

export async function saveConnection(athleteId: string, provider: ProviderId, input: {
  status: 'connected' | 'disconnected';
  readMetrics?: HealthMetric[];
  writeWorkouts?: boolean;
}): Promise<void> {
  const now = new Date();
  const values = {
    status: input.status,
    ...(input.readMetrics ? { readMetrics: JSON.stringify(input.readMetrics) } : {}),
    ...(input.writeWorkouts !== undefined ? { writeWorkouts: input.writeWorkouts } : {}),
    ...(input.status === 'connected' ? { connectedAt: now, disconnectedAt: null } : { disconnectedAt: now }),
    updatedAt: now,
  };
  await db.insert(healthConnections).values({ athleteId, provider, readMetrics: '[]', writeWorkouts: false, ...values })
    .onConflictDoUpdate({ target: [healthConnections.athleteId, healthConnections.provider], set: values });
}

export async function recordImportResult(athleteId: string, provider: ProviderId, error: string | null): Promise<void> {
  const now = new Date();
  await db.update(healthConnections)
    .set(error ? { lastError: error, updatedAt: now } : { lastImportAt: now, lastError: null, updatedAt: now })
    .where(and(eq(healthConnections.athleteId, athleteId), eq(healthConnections.provider, provider)));
}

export async function getCursor(athleteId: string, provider: ProviderId, metric: HealthMetric): Promise<string | null> {
  const [row] = await db.select({ cursor: healthSyncCursors.cursor }).from(healthSyncCursors).where(and(
    eq(healthSyncCursors.athleteId, athleteId), eq(healthSyncCursors.provider, provider), eq(healthSyncCursors.metric, metric),
  )).limit(1);
  return row?.cursor ?? null;
}

export async function clearCursor(athleteId: string, provider: ProviderId, metric: HealthMetric): Promise<void> {
  await db.delete(healthSyncCursors).where(and(
    eq(healthSyncCursors.athleteId, athleteId), eq(healthSyncCursors.provider, provider), eq(healthSyncCursors.metric, metric),
  ));
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Removes every local row that came from these provider records. */
async function deleteGroups(tx: Transaction, athleteId: string, provider: ProviderId, metric: ImportMetric, groupIds: string[]) {
  if (!groupIds.length) return;
  if (metric === 'weight') {
    await tx.delete(bodyMeasurements).where(and(
      eq(bodyMeasurements.athleteId, athleteId), eq(bodyMeasurements.source, provider), inArray(bodyMeasurements.externalId, groupIds),
    ));
    return;
  }
  for (const groupId of groupIds) {
    await tx.delete(healthSamples).where(and(
      eq(healthSamples.athleteId, athleteId),
      eq(healthSamples.provider, provider),
      or(eq(healthSamples.externalId, groupId), sql`${healthSamples.externalId} like ${`${groupId}#%`}`),
    ));
  }
}

/**
 * Applies one provider batch and saves its cursor in the same transaction:
 * the cursor only moves once the batch is stored, so a crash replays it.
 * `replaceFrom` (a bounded rescan) first drops imported rows of the metric
 * from that instant, so records deleted while the token was expired go too.
 */
export async function applyHealthBatch(athleteId: string, provider: ProviderId, metric: ImportMetric, batch: {
  upserts: ImportedRecord[];
  deletedGroupIds: string[];
  nextCursor: string;
  replaceFrom?: number;
}): Promise<void> {
  const now = new Date();
  await db.transaction(async tx => {
    if (batch.replaceFrom != null) {
      const from = new Date(batch.replaceFrom);
      if (metric === 'weight') {
        await tx.delete(bodyMeasurements).where(and(
          eq(bodyMeasurements.athleteId, athleteId), eq(bodyMeasurements.source, provider), gte(bodyMeasurements.measuredAt, from),
        ));
      } else {
        await tx.delete(healthSamples).where(and(
          eq(healthSamples.athleteId, athleteId), eq(healthSamples.provider, provider), eq(healthSamples.kind, metric), gte(healthSamples.startAt, from),
        ));
      }
    }

    await deleteGroups(tx, athleteId, provider, metric, batch.deletedGroupIds);
    // An updated record replaces all of its rows (its sample count may change).
    const groups = [...new Set(batch.upserts.map(record => record.groupId))];
    await deleteGroups(tx, athleteId, provider, metric, groups);

    for (const record of batch.upserts) {
      if (metric === 'weight') {
        if (record.value == null) continue;
        await tx.insert(bodyMeasurements).values({
          id: `${provider}:${record.externalId}`,
          athleteId,
          measuredAt: new Date(record.start),
          weightKg: record.value,
          bodyFatPct: null,
          muscleMassPct: null,
          notes: null,
          syncVersion: 0,
          source: provider,
          externalId: record.groupId,
        }).onConflictDoNothing();
        continue;
      }
      await tx.insert(healthSamples).values({
        id: `${provider}:${record.externalId}`,
        athleteId,
        provider,
        externalId: record.externalId,
        sourceApp: record.sourceApp,
        kind: metric,
        startAt: new Date(record.start),
        endAt: new Date(record.end),
        tzOffsetMin: record.tzOffsetMin,
        value: record.value,
        stage: record.stage,
        version: record.version,
        deletedAt: null,
        importedAt: now,
      }).onConflictDoNothing();
    }

    await tx.insert(healthSyncCursors).values({ athleteId, provider, metric, cursor: batch.nextCursor, updatedAt: now })
      .onConflictDoUpdate({
        target: [healthSyncCursors.athleteId, healthSyncCursors.provider, healthSyncCursors.metric],
        set: { cursor: batch.nextCursor, updatedAt: now },
      });
  });
}

export async function saveDailySteps(athleteId: string, provider: ProviderId, totals: Map<string, number>): Promise<void> {
  const now = new Date();
  await db.transaction(async tx => {
    for (const [localDate, steps] of totals) {
      await tx.insert(healthDailySteps).values({ athleteId, provider, localDate, steps, updatedAt: now })
        .onConflictDoUpdate({
          target: [healthDailySteps.athleteId, healthDailySteps.provider, healthDailySteps.localDate],
          set: { steps, updatedAt: now },
        });
    }
  });
}

export async function getDailySteps(athleteId: string, localDate: string): Promise<Partial<Record<ProviderId, number>>> {
  const rows = await db.select().from(healthDailySteps)
    .where(and(eq(healthDailySteps.athleteId, athleteId), eq(healthDailySteps.localDate, localDate)));
  return Object.fromEntries(rows.map(row => [row.provider, row.steps]));
}

export async function getSleepIntervals(athleteId: string, from: Date, to: Date) {
  return db.select({
    provider: healthSamples.provider,
    start: healthSamples.startAt,
    end: healthSamples.endAt,
    stage: healthSamples.stage,
    tzOffsetMin: healthSamples.tzOffsetMin,
  }).from(healthSamples).where(and(
    eq(healthSamples.athleteId, athleteId), eq(healthSamples.kind, 'sleep'),
    gte(healthSamples.endAt, from), lte(healthSamples.startAt, to),
  ));
}

export async function getLatestHeartRate(athleteId: string): Promise<{ bpm: number; at: Date; provider: ProviderId; sourceApp: string | null } | null> {
  const [row] = await db.select().from(healthSamples)
    .where(and(eq(healthSamples.athleteId, athleteId), eq(healthSamples.kind, 'heart_rate')))
    .orderBy(desc(healthSamples.endAt)).limit(1);
  return row && row.value != null ? { bpm: row.value, at: row.endAt, provider: row.provider, sourceApp: row.sourceApp } : null;
}

export async function getLatestImportedWeight(athleteId: string): Promise<{ weightKg: number; at: Date; provider: string } | null> {
  const [row] = await db.select().from(bodyMeasurements)
    .where(and(eq(bodyMeasurements.athleteId, athleteId), sql`${bodyMeasurements.source} <> 'manual'`))
    .orderBy(desc(bodyMeasurements.measuredAt)).limit(1);
  return row ? { weightKg: row.weightKg, at: row.measuredAt, provider: row.source } : null;
}

// ── manual sleep ────────────────────────────────────────────────────────────

export async function getSleepEntry(athleteId: string, wakeDate: string): Promise<number | null> {
  const [row] = await db.select({ minutes: sleepEntries.minutes }).from(sleepEntries)
    .where(and(eq(sleepEntries.athleteId, athleteId), eq(sleepEntries.wakeDate, wakeDate))).limit(1);
  return row?.minutes ?? null;
}

export async function saveSleepEntry(athleteId: string, wakeDate: string, minutes: number): Promise<void> {
  const now = new Date();
  await db.insert(sleepEntries).values({ id: nanoid(), athleteId, wakeDate, minutes, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: [sleepEntries.athleteId, sleepEntries.wakeDate], set: { minutes, updatedAt: now } });
}

/** Removing the manual entry returns the date to the provider's summary. */
export async function deleteSleepEntry(athleteId: string, wakeDate: string): Promise<void> {
  await db.delete(sleepEntries).where(and(eq(sleepEntries.athleteId, athleteId), eq(sleepEntries.wakeDate, wakeDate)));
}

// ── preferred source ────────────────────────────────────────────────────────

export async function getPreferredSource(athleteId: string, metric: HealthMetric): Promise<ProviderId | null> {
  const [row] = await db.select({ provider: healthMetricSources.provider }).from(healthMetricSources)
    .where(and(eq(healthMetricSources.athleteId, athleteId), eq(healthMetricSources.metric, metric))).limit(1);
  return row?.provider ?? null;
}

export async function setPreferredSource(athleteId: string, metric: HealthMetric, provider: ProviderId): Promise<void> {
  const now = new Date();
  await db.insert(healthMetricSources).values({ athleteId, metric, provider, updatedAt: now })
    .onConflictDoUpdate({ target: [healthMetricSources.athleteId, healthMetricSources.metric], set: { provider, updatedAt: now } });
}

/** Providers that hold any imported data for this account (a restored history can hold the other platform's). */
export async function providersWithData(athleteId: string): Promise<ProviderId[]> {
  const [samples, steps, weights] = await Promise.all([
    db.selectDistinct({ provider: healthSamples.provider }).from(healthSamples).where(eq(healthSamples.athleteId, athleteId)),
    db.selectDistinct({ provider: healthDailySteps.provider }).from(healthDailySteps).where(eq(healthDailySteps.athleteId, athleteId)),
    db.selectDistinct({ source: bodyMeasurements.source }).from(bodyMeasurements).where(eq(bodyMeasurements.athleteId, athleteId)),
  ]);
  const all = new Set<string>([...samples.map(row => row.provider), ...steps.map(row => row.provider), ...weights.map(row => row.source)]);
  return (['health_connect', 'apple_health'] as const).filter(provider => all.has(provider));
}

// ── workout export queue ────────────────────────────────────────────────────

/** Queues (or re-queues after an edit) a completed session for export. */
export async function queueWorkoutExport(athleteId: string, provider: ProviderId, sessionId: string): Promise<void> {
  const id = `${provider}:${sessionId}`;
  const now = new Date();
  const [existing] = await db.select().from(healthWorkoutExports).where(eq(healthWorkoutExports.id, id)).limit(1);
  if (existing) {
    await db.update(healthWorkoutExports)
      .set({ status: 'pending', version: existing.status === 'written' ? existing.version + 1 : existing.version, updatedAt: now })
      .where(eq(healthWorkoutExports.id, id));
    return;
  }
  await db.insert(healthWorkoutExports).values({
    id, athleteId, provider, sessionId, clientRecordId: `pulso-session-${sessionId}`, version: 1, status: 'pending', attempts: 0, updatedAt: now,
  });
}

export async function pendingWorkoutExports(athleteId: string, provider: ProviderId) {
  const rows = await db.select().from(healthWorkoutExports).where(and(
    eq(healthWorkoutExports.athleteId, athleteId),
    eq(healthWorkoutExports.provider, provider),
    inArray(healthWorkoutExports.status, ['pending', 'failed', 'delete_pending']),
  )).orderBy(asc(healthWorkoutExports.updatedAt)).limit(50);
  const sessionIds = rows.map(row => row.sessionId);
  const sessions = sessionIds.length
    ? await db.select({
      id: workoutSessions.id, status: workoutSessions.status, startedAt: workoutSessions.startedAt,
      finishedAt: workoutSessions.finishedAt, title: workoutTemplates.name,
    }).from(workoutSessions)
      .leftJoin(workoutTemplates, eq(workoutSessions.templateId, workoutTemplates.id))
      .where(inArray(workoutSessions.id, sessionIds))
    : [];
  const byId = new Map(sessions.map(session => [session.id, session]));
  return rows.map(row => ({ ...row, session: byId.get(row.sessionId) ?? null }));
}

export async function markWorkoutExport(id: string, result: { status: 'written' | 'failed' | 'deleted'; externalId?: string; error?: string }): Promise<void> {
  await db.update(healthWorkoutExports).set({
    status: result.status,
    ...(result.externalId ? { externalId: result.externalId } : {}),
    lastError: result.error ?? null,
    attempts: sql`${healthWorkoutExports.attempts} + 1`,
    updatedAt: new Date(),
  }).where(eq(healthWorkoutExports.id, id));
}

/** Stops imports and, if asked, removes everything imported from that provider. */
export async function deleteImportedData(athleteId: string, provider: ProviderId): Promise<void> {
  await db.transaction(async tx => {
    await tx.delete(healthSamples).where(and(eq(healthSamples.athleteId, athleteId), eq(healthSamples.provider, provider)));
    await tx.delete(healthDailySteps).where(and(eq(healthDailySteps.athleteId, athleteId), eq(healthDailySteps.provider, provider)));
    await tx.delete(healthSyncCursors).where(and(eq(healthSyncCursors.athleteId, athleteId), eq(healthSyncCursors.provider, provider)));
    await tx.delete(bodyMeasurements).where(and(eq(bodyMeasurements.athleteId, athleteId), eq(bodyMeasurements.source, provider)));
  });
}

/** Everything health-related for the account (data export). */
export async function collectHealthData(athleteId: string) {
  const [connections, samples, steps, sleep, sources, exports] = await Promise.all([
    db.select().from(healthConnections).where(eq(healthConnections.athleteId, athleteId)),
    db.select().from(healthSamples).where(eq(healthSamples.athleteId, athleteId)),
    db.select().from(healthDailySteps).where(eq(healthDailySteps.athleteId, athleteId)),
    db.select().from(sleepEntries).where(eq(sleepEntries.athleteId, athleteId)),
    db.select().from(healthMetricSources).where(eq(healthMetricSources.athleteId, athleteId)),
    db.select().from(healthWorkoutExports).where(eq(healthWorkoutExports.athleteId, athleteId)),
  ]);
  return { connections, samples, dailySteps: steps, sleepEntries: sleep, metricSources: sources, workoutExports: exports };
}

/** Removes every health row of the account (account deletion). */
export async function wipeHealthData(athleteId: string): Promise<void> {
  await db.transaction(async tx => {
    await tx.delete(healthSamples).where(eq(healthSamples.athleteId, athleteId));
    await tx.delete(healthDailySteps).where(eq(healthDailySteps.athleteId, athleteId));
    await tx.delete(healthSyncCursors).where(eq(healthSyncCursors.athleteId, athleteId));
    await tx.delete(healthConnections).where(eq(healthConnections.athleteId, athleteId));
    await tx.delete(healthMetricSources).where(eq(healthMetricSources.athleteId, athleteId));
    await tx.delete(healthWorkoutExports).where(eq(healthWorkoutExports.athleteId, athleteId));
    await tx.delete(sleepEntries).where(eq(sleepEntries.athleteId, athleteId));
  });
}
