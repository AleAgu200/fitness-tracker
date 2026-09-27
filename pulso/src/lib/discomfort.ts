// Discomfort the athlete marks on the body map. Temporary (expires on its own),
// local-only and never shared: it only asks for confirmation before a free
// session includes that muscle. It is not a diagnosis and nothing infers one.

import * as SecureStore from 'expo-secure-store';

import type { DetailedMuscleKey } from './muscles';

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const keyFor = (userId: string) => `pulso_discomfort_${userId}`;

type Stored = Partial<Record<DetailedMuscleKey, number>>; // muscle → expiresAt

async function read(userId: string): Promise<Stored> {
  try {
    const raw = await SecureStore.getItemAsync(keyFor(userId));
    return raw ? JSON.parse(raw) as Stored : {};
  } catch {
    return {};
  }
}

export async function loadDiscomfort(userId: string): Promise<DetailedMuscleKey[]> {
  const now = Date.now();
  return (Object.entries(await read(userId)) as [DetailedMuscleKey, number][])
    .filter(([, expiresAt]) => expiresAt > now)
    .map(([muscle]) => muscle);
}

export async function clearDiscomfort(userId: string): Promise<void> {
  await SecureStore.deleteItemAsync(keyFor(userId)).catch(() => {});
}

/** Toggles a report; returns the active list afterwards. */
export async function toggleDiscomfort(userId: string, muscle: DetailedMuscleKey): Promise<DetailedMuscleKey[]> {
  const now = Date.now();
  const stored = await read(userId);
  const next: Stored = {};
  for (const [key, expiresAt] of Object.entries(stored) as [DetailedMuscleKey, number][]) {
    if (expiresAt > now && key !== muscle) next[key] = expiresAt;
  }
  const wasActive = (stored[muscle] ?? 0) > now;
  if (!wasActive) next[muscle] = now + TTL_MS;
  await SecureStore.setItemAsync(keyFor(userId), JSON.stringify(next));
  return Object.keys(next) as DetailedMuscleKey[];
}
