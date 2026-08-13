import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { athleteProfiles, bodyMeasurements, user } from "@/db/schema";

export interface WeightMeasurementInput {
  id: string;
  measuredAt: number;
  weightKg: number;
}

export interface AthleteProfileUpdate {
  fullName?: string;
  sex?: "M" | "F" | "X" | null;
  dateOfBirth?: string | null;
  heightCm?: number | null;
  goalWeightKg?: number | null;
  measurement?: WeightMeasurementInput;
}

export interface AthleteProfileRecord {
  userId: string;
  fullName: string;
  sex: "M" | "F" | "X" | null;
  dateOfBirth: string | null;
  heightCm: number | null;
  goalWeightKg: number | null;
  createdAt: number;
  updatedAt: number;
  latestWeight: WeightMeasurementInput | null;
}

type ProfileRow = Omit<AthleteProfileRecord, "latestWeight">;
type DbClient = typeof db | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

async function getProfileRow(client: DbClient, userId: string): Promise<ProfileRow | null> {
  const [row] = await client
    .select()
    .from(athleteProfiles)
    .where(eq(athleteProfiles.userId, userId));
  return (row as ProfileRow | undefined) ?? null;
}

async function getLatestWeight(userId: string): Promise<WeightMeasurementInput | null> {
  const [row] = await db
    .select({ id: bodyMeasurements.id, measuredAt: bodyMeasurements.measuredAt, weightKg: bodyMeasurements.weightKg })
    .from(bodyMeasurements)
    .where(eq(bodyMeasurements.athleteId, userId))
    .orderBy(desc(bodyMeasurements.measuredAt), desc(bodyMeasurements.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getAthleteProfile(userId: string): Promise<AthleteProfileRecord | null> {
  const profile = await getProfileRow(db, userId);
  if (!profile) return null;
  return { ...profile, latestWeight: await getLatestWeight(userId) };
}

export async function upsertAthleteProfile(
  userId: string,
  fallbackName: string,
  update: AthleteProfileUpdate,
): Promise<AthleteProfileRecord> {
  await db.transaction(async (tx) => {
    const existing = await getProfileRow(tx, userId);
    const now = Date.now();
    const fullName = update.fullName ?? existing?.fullName ?? fallbackName;
    const sex = update.sex !== undefined ? update.sex : (existing?.sex ?? null);
    const dateOfBirth = update.dateOfBirth !== undefined ? update.dateOfBirth : (existing?.dateOfBirth ?? null);
    const heightCm = update.heightCm !== undefined ? update.heightCm : (existing?.heightCm ?? null);
    const goalWeightKg = update.goalWeightKg !== undefined ? update.goalWeightKg : (existing?.goalWeightKg ?? null);

    await tx.insert(athleteProfiles)
      .values({ userId, fullName, sex, dateOfBirth, heightCm, goalWeightKg, createdAt: existing?.createdAt ?? now, updatedAt: now })
      .onConflictDoUpdate({
        target: athleteProfiles.userId,
        set: { fullName, sex, dateOfBirth, heightCm, goalWeightKg, updatedAt: now },
      });

    // The portal reads Better Auth's user name, so update both in one transaction.
    await tx.update(user).set({ name: fullName, updatedAt: new Date(now) }).where(eq(user.id, userId));

    if (update.measurement) {
      const [owner] = await tx
        .select({ athleteId: bodyMeasurements.athleteId })
        .from(bodyMeasurements)
        .where(eq(bodyMeasurements.id, update.measurement.id));
      if (owner && owner.athleteId !== userId) {
        throw new Error("measurement_id_conflict");
      }
      await tx.insert(bodyMeasurements)
        .values({
          id: update.measurement.id,
          athleteId: userId,
          measuredAt: update.measurement.measuredAt,
          weightKg: update.measurement.weightKg,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: bodyMeasurements.id,
          set: { measuredAt: update.measurement.measuredAt, weightKg: update.measurement.weightKg },
        });
    }
  });

  return (await getAthleteProfile(userId))!;
}
