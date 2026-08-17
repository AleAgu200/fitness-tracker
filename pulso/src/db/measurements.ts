import { and, asc, eq, gte } from 'drizzle-orm';

import { nanoid } from '@/lib/id';
import { dayStart } from '@/lib/dates';
import { db } from './index';
import { bodyMeasurements, progressPhotos } from './schema';
import { enqueueSyncMutation } from './sync';

export type MetricKey = 'peso' | 'grasa' | 'musculo';

export interface MetricPoint {
  value: number;
  label: string; // 'DD/MM'
}

function pointLabel(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Log today's value for a metric. One measurement row per day, updated in place. */
export async function logMeasurement(
  athleteId: string,
  metric: MetricKey,
  value: number,
  fallbackWeightKg: number,
): Promise<void> {
  await db.transaction(async tx => {
    const start = dayStart(new Date());
    const [existing] = await tx.select().from(bodyMeasurements).where(and(
      eq(bodyMeasurements.athleteId, athleteId), gte(bodyMeasurements.measuredAt, start),
    )).limit(1);
    const now = new Date();
    const id = existing?.id ?? nanoid();
    const version = (existing?.syncVersion ?? 0) + 1;
    const weightKg = metric === 'peso' ? value : existing?.weightKg ?? fallbackWeightKg;
    const patch = metric === 'peso' ? { weightKg } : metric === 'grasa' ? { bodyFatPct: value } : { muscleMassPct: value };
    if (existing) {
      await tx.update(bodyMeasurements).set({ ...patch, syncVersion: version }).where(eq(bodyMeasurements.id, id));
    } else {
      await tx.insert(bodyMeasurements).values({
        id, athleteId, measuredAt: now, weightKg,
        bodyFatPct: metric === 'grasa' ? value : null,
        muscleMassPct: metric === 'musculo' ? value : null,
        notes: null, syncVersion: version,
      });
    }
    await enqueueSyncMutation(tx, {
      athleteId,
      entityType: 'body_measurement',
      entityId: id,
      operation: existing && existing.syncVersion > 0 ? 'update' : 'create',
      baseVersion: existing && existing.syncVersion > 0 ? existing.syncVersion : null,
      occurredAt: now,
      payload: { measuredAt: (existing?.measuredAt ?? now).getTime(), weightKg, version },
    });
  });
}

export interface MetricHistories {
  peso: MetricPoint[];
  grasa: MetricPoint[];
  musculo: MetricPoint[];
}

export async function getMetricHistories(athleteId: string, limit = 8): Promise<MetricHistories> {
  const rows = await db
    .select()
    .from(bodyMeasurements)
    .where(eq(bodyMeasurements.athleteId, athleteId))
    .orderBy(asc(bodyMeasurements.measuredAt));

  const pick = (get: (r: typeof rows[number]) => number | null): MetricPoint[] =>
    rows
      .filter(r => get(r) != null)
      .map(r => ({ value: get(r)!, label: pointLabel(r.measuredAt) }))
      .slice(-limit);

  return {
    peso: pick(r => r.weightKg),
    grasa: pick(r => r.bodyFatPct),
    musculo: pick(r => r.muscleMassPct),
  };
}

export interface ProgressPhoto {
  id: string;
  uri: string;
  takenAt: Date;
}

export async function getPhotos(athleteId: string): Promise<ProgressPhoto[]> {
  const rows = await db
    .select()
    .from(progressPhotos)
    .where(eq(progressPhotos.athleteId, athleteId))
    .orderBy(asc(progressPhotos.takenAt));
  return rows.map(r => ({ id: r.id, uri: r.localUri, takenAt: r.takenAt }));
}

export async function addPhoto(athleteId: string, uri: string): Promise<void> {
  await db.insert(progressPhotos).values({
    id: nanoid(),
    athleteId,
    takenAt: new Date(),
    localUri: uri,
    angle: 'front',
    phaseId: null,
  });
}
