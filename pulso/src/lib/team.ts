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
