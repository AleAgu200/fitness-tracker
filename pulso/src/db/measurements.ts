import { and, asc, eq, gte } from 'drizzle-orm';

import { nanoid } from '@/lib/id';
import { dayStart } from '@/lib/dates';
import { db } from './index';
import { bodyMeasurements, progressPhotos } from './schema';

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
  const start = dayStart(new Date());
  const rows = await db
    .select()
    .from(bodyMeasurements)
    .where(and(
      eq(bodyMeasurements.athleteId, athleteId),
      gte(bodyMeasurements.measuredAt, start),
    ))
    .limit(1);

  const patch =
    metric === 'peso'  ? { weightKg: value } :
    metric === 'grasa' ? { bodyFatPct: value } :
                         { muscleMassPct: value };

  if (rows[0]) {
    await db.update(bodyMeasurements).set(patch).where(eq(bodyMeasurements.id, rows[0].id));
  } else {
    await db.insert(bodyMeasurements).values({
      id: nanoid(),
      athleteId,
      measuredAt: new Date(),
      weightKg: metric === 'peso' ? value : fallbackWeightKg,
      bodyFatPct: metric === 'grasa' ? value : null,
      muscleMassPct: metric === 'musculo' ? value : null,
      notes: null,
    });
  }
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
