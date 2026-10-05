// Athlete's supervision team (coach / nutritionist) — server-backed.

import { apiFetch } from './api';

export type LinkKind = 'coach' | 'nutritionist';

export interface TeamMember {
  linkId: string;
  kind: LinkKind;
  userId: string;
  name: string;
  email: string;
  since: number;
}

export async function fetchTeam(): Promise<TeamMember[]> {
  const res = await apiFetch<{ team?: TeamMember[] }>('/api/links');
  return res.team ?? [];
}

export async function redeemInvite(code: string): Promise<{ kind: LinkKind; professionalName: string }> {
  return apiFetch('/api/links/accept', { method: 'POST', body: { code } });
}

/** Ends the relationship with one professional: no more data sharing and no more messages. */
export async function leaveTeam(professionalId: string): Promise<void> {
  await apiFetch('/api/links/leave', { method: 'POST', body: { professionalId } });
}

export const REPORT_REASONS = [
  { key: 'harassment', label: 'Acoso o amenazas' },
  { key: 'inappropriate', label: 'Contenido inapropiado' },
  { key: 'unsafe_advice', label: 'Consejos peligrosos' },
  { key: 'spam', label: 'Spam o estafa' },
  { key: 'other', label: 'Otro' },
] as const;

export type ReportReason = typeof REPORT_REASONS[number]['key'];

/** Sends a report to PULSO's moderators, with the conversation's latest messages attached server-side. */
export async function reportUser(reportedUserId: string, reason: ReportReason, detail: string): Promise<void> {
  await apiFetch('/api/reports', { method: 'POST', body: { reportedUserId, reason, detail } });
}
