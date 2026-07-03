import { desc, eq } from 'drizzle-orm';

import { nanoid } from '@/lib/id';
import { db } from './index';
import { athleteProfiles, bodyMeasurements } from './schema';

export async function saveAthleteProfile(
  userId: string,
  data: {
    fullName: string;
    initials: string;
    dateOfBirth?: string;
    sex?: 'M' | 'F' | 'X';
    heightCm?: number;
    goalWeightKg?: number;
  },
) {
  const now = new Date();
  await db
    .insert(athleteProfiles)
    .values({
      userId,
      coachId: null,
      fullName: data.fullName,
      initials: data.initials,
      dateOfBirth: data.dateOfBirth ?? null,
      sex: data.sex ?? null,
      heightCm: data.heightCm ?? null,
      goalWeightKg: data.goalWeightKg ?? null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: athleteProfiles.userId,
      set: {
        fullName: data.fullName,
        initials: data.initials,
        dateOfBirth: data.dateOfBirth ?? null,
        sex: data.sex ?? null,
        heightCm: data.heightCm ?? null,
        goalWeightKg: data.goalWeightKg ?? null,
        updatedAt: now,
      },
    });
}

export async function saveInitialWeight(athleteId: string, weightKg: number) {
  await db.insert(bodyMeasurements).values({
    id: nanoid(),
    athleteId,
    measuredAt: new Date(),
    weightKg,
    bodyFatPct: null,
    muscleMassPct: null,
    notes: null,
  });
}

export async function getAthleteProfile(userId: string) {
  const rows = await db
    .select()
    .from(athleteProfiles)
    .where(eq(athleteProfiles.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLatestWeight(athleteId: string): Promise<number | null> {
  const rows = await db
    .select({ weightKg: bodyMeasurements.weightKg })
    .from(bodyMeasurements)
    .where(eq(bodyMeasurements.athleteId, athleteId))
    .orderBy(desc(bodyMeasurements.measuredAt))
    .limit(1);
  return rows[0]?.weightKg ?? null;
}
