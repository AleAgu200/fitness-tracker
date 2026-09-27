// Account export and deletion (Configuración). Both are free: data portability
// and the right to leave are never behind the subscription.

import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { collectLocalData, wipeLocalData } from '@/db/account-data';
import { dateStr } from './dates';
import { clearDiscomfort } from './discomfort';
import { ApiError, apiFetch } from './api';
import { clearAssignmentMeta } from './sync';

export interface PendingDeletion {
  status: 'pending';
  requestedAt: number;
  purgeAfter: number;
}

export async function getPendingDeletion(): Promise<PendingDeletion | null> {
  return (await apiFetch<{ deletion: PendingDeletion | null }>('/api/account/deletion')).deletion;
}

export async function cancelDeletion(): Promise<void> {
  await apiFetch('/api/account/deletion', { method: 'DELETE' });
}

export class ProfessionalAccountError extends Error {
  constructor() {
    super('professional_account');
  }
}

/**
 * Schedules the account for deletion (30-day grace on the server) and removes
 * this account's data from the phone right away. The server signs out every
 * session, so the caller must sign out locally afterwards.
 */
export async function requestDeletion(userId: string): Promise<PendingDeletion> {
  let deletion: PendingDeletion;
  try {
    deletion = (await apiFetch<{ deletion: PendingDeletion }>('/api/account/deletion', { method: 'POST' })).deletion;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'professional_account') throw new ProfessionalAccountError();
    throw error;
  }
  await wipeLocalData(userId);
  await Promise.all([clearAssignmentMeta(userId), clearDiscomfort(userId)]);
  return deletion;
}

export interface ExportResult {
  /** False when the server couldn't be reached: the file has only local data. */
  includesServer: boolean;
}

/**
 * Builds one JSON file with the phone's history plus what the server holds,
 * and opens the share sheet so the athlete decides where it goes.
 */
export async function exportAccountData(userId: string): Promise<ExportResult> {
  const [local, server] = await Promise.all([
    collectLocalData(userId),
    apiFetch<Record<string, unknown>>('/api/account/export').catch(() => null),
  ]);
  const payload = {
    format: 'pulso-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    appVersion: Constants.expoConfig?.version ?? null,
    phone: local,
    server: server ?? { unavailable: true, note: 'Sin conexión al exportar: solo se incluyen los datos del teléfono.' },
  };

  const file = new File(Paths.cache, `pulso-datos-${dateStr(new Date())}.json`);
  file.create({ overwrite: true });
  file.write(JSON.stringify(payload, null, 2));
  if (!(await Sharing.isAvailableAsync())) throw new Error('sharing_unavailable');
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: 'Exportar mis datos de PULSO',
  });
  return { includesServer: server != null };
}
