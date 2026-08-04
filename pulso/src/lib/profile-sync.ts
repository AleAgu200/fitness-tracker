// Opportunistic two-way sync for stable profile/body fields. The device keeps
// its SQLite copy for offline use; the authenticated server copy restores it
// after login on a new installation.

import {
  getAthleteProfile,
  getLatestWeightMeasurement,
  saveAthleteProfile,
  upsertWeightMeasurement,
  type WeightMeasurementRecord,
} from '@/db/profile';
import type { AthleteProfile } from '@/db/schema';
import { getInitials } from './names';
import { apiFetch } from './api';

export interface ServerProfileUpdate {
  fullName?: string;
  sex?: 'M' | 'F' | 'X' | null;
  dateOfBirth?: string | null;
  heightCm?: number | null;
  goalWeightKg?: number | null;
  measurement?: {
    id: string;
    measuredAt: number;
    weightKg: number;
  };
}

interface RemoteAthleteProfile {
  userId: string;
  fullName: string;
  sex: 'M' | 'F' | 'X' | null;
  dateOfBirth: string | null;
  heightCm: number | null;
  goalWeightKg: number | null;
  createdAt: number;
  updatedAt: number;
  latestWeight: ServerProfileUpdate['measurement'] | null;
}

interface ProfileResponse {
  profile: RemoteAthleteProfile | null;
}

function localProfilePayload(
  profile: AthleteProfile,
  measurement: WeightMeasurementRecord | null,
): ServerProfileUpdate {
  return {
    fullName: profile.fullName,
    sex: profile.sex,
    dateOfBirth: profile.dateOfBirth,
    heightCm: profile.heightCm,
    goalWeightKg: profile.goalWeightKg,
    measurement: measurement
      ? {
          id: measurement.id,
          measuredAt: measurement.measuredAt.getTime(),
          weightKg: measurement.weightKg,
        }
      : undefined,
  };
}

function sameProfile(local: AthleteProfile, remote: RemoteAthleteProfile): boolean {
  return local.fullName === remote.fullName
    && local.sex === remote.sex
    && local.dateOfBirth === remote.dateOfBirth
    && local.heightCm === remote.heightCm
    && local.goalWeightKg === remote.goalWeightKg;
}

async function hydrateLocalProfile(userId: string, profile: RemoteAthleteProfile): Promise<void> {
  await saveAthleteProfile(userId, {
    fullName: profile.fullName,
    initials: getInitials(profile.fullName),
    sex: profile.sex ?? undefined,
    dateOfBirth: profile.dateOfBirth ?? undefined,
    heightCm: profile.heightCm ?? undefined,
    goalWeightKg: profile.goalWeightKg ?? undefined,
  });
  if (profile.latestWeight) {
    await upsertWeightMeasurement(userId, {
      id: profile.latestWeight.id,
      measuredAt: new Date(profile.latestWeight.measuredAt),
      weightKg: profile.latestWeight.weightKg,
    });
  }
}

export async function pushAthleteProfile(update: ServerProfileUpdate): Promise<RemoteAthleteProfile> {
  const response = await apiFetch<ProfileResponse>('/api/profile', {
    method: 'POST',
    body: update,
  });
  if (!response.profile) throw new Error('profile_sync_empty_response');
  return response.profile;
}

const activeSyncs = new Map<string, Promise<void>>();

/** Pulls a server profile onto a new device, or seeds/updates the server from a
 *  newer local profile. Concurrent startup callers share one request. */
export function syncAthleteProfile(userId: string): Promise<void> {
  const active = activeSyncs.get(userId);
  if (active) return active;

  const sync = (async () => {
    const [local, localWeight, response] = await Promise.all([
      getAthleteProfile(userId),
      getLatestWeightMeasurement(userId),
      apiFetch<ProfileResponse>('/api/profile'),
    ]);
    const remote = response.profile;

    if (!remote) {
      if (local) await pushAthleteProfile(localProfilePayload(local, localWeight));
      return;
    }
    if (!local) {
      await hydrateLocalProfile(userId, remote);
      return;
    }

    if (!sameProfile(local, remote)) {
      if (local.updatedAt.getTime() > remote.updatedAt) {
        await pushAthleteProfile(localProfilePayload(local, null));
      } else {
        await hydrateLocalProfile(userId, { ...remote, latestWeight: null });
      }
    }

    const remoteWeight = remote.latestWeight;
    if (localWeight && (!remoteWeight || localWeight.measuredAt.getTime() > remoteWeight.measuredAt)) {
      await pushAthleteProfile({
        measurement: {
          id: localWeight.id,
          measuredAt: localWeight.measuredAt.getTime(),
          weightKg: localWeight.weightKg,
        },
      });
    } else if (remoteWeight && (!localWeight || remoteWeight.measuredAt > localWeight.measuredAt.getTime())) {
      await upsertWeightMeasurement(userId, {
        id: remoteWeight.id,
        measuredAt: new Date(remoteWeight.measuredAt),
        weightKg: remoteWeight.weightKg,
      });
    }
  })().finally(() => activeSyncs.delete(userId));

  activeSyncs.set(userId, sync);
  return sync;
}
