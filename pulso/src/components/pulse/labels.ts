// Copy and color roles shared by the PULSO surfaces (Hoy, Entreno, cierre,
// Progreso, Wrapped). Color rule: accent = act, cyan = context/recovery,
// orange = continuity, red = record or alert.

import { ColorTokens } from '@/constants/colors';
import type { PulseComparison, PulseCoreComponent, PulseCoreState, PulseTone, SessionCardType } from '@/lib/pulse-engine';

export const CORE_MESSAGES: Record<PulseCoreState, string> = {
  LATENTE: 'Tu núcleo espera tu primera sesión. Empezá con algo corto.',
  ACTIVO: 'Tu cuerpo está listo. Hoy suma sin perseguir fatiga.',
  CARGADO: 'Sesión registrada. Lo que sigue es recuperar bien.',
  RECUPERANDO: 'Cargaste fuerte estos días. Recuperar también es progresar.',
  ESTABLE: 'Semana cumplida. Mantener el ritmo también es progresar.',
  REACTIVANDO: 'Sin culpa: una sesión corta reactiva el sistema.',
};

export const CORE_COMPONENT_LABELS: Record<PulseCoreComponent['key'], string> = {
  sessions: 'SESIONES · 7 DÍAS',
  continuity: 'CONTINUIDAD',
  nutrition: 'NUTRICIÓN · HOY',
  hydration: 'HIDRATACIÓN · HOY',
  balance: 'EQUILIBRIO DE CARGA',
};

export function toneColor(tone: PulseTone, accent: string, C: ColorTokens): string {
  switch (tone) {
    case 'action': return accent;
    case 'context': return C.cyan;
    case 'continuity': return C.orange;
    default: return C.textTertiary;
  }
}

export const CARD_FAMILIES: Record<SessionCardType, { label: string; color: (accent: string, C: ColorTokens) => string }> = {
  new_pulse: { label: 'NUEVO PULSO', color: (_, C) => C.red },
  control: { label: 'CONTROL', color: (_, C) => C.cyan },
  return: { label: 'REGRESO', color: (_, C) => C.orange },
  consistency: { label: 'CONSISTENCIA', color: accent => accent },
};

/** Instruction shown under the previous pulse while logging a set. */
export function comparisonCopy(comparison: PulseComparison): string {
  switch (comparison.mode) {
    case 'first': return 'PRIMER PULSO · ESTA SESIÓN CREA TU REFERENCIA';
    case 'return': return 'REGRESO · COMPLETAR ES EL OBJETIVO';
    case 'beat': return 'SUPERÁS TU PULSO ANTERIOR';
    case 'control': return 'MISMO TRABAJO · MENOR ESFUERZO';
    case 'match':
    case 'close': {
      const reps = comparison.repsToBeat ?? 1;
      return `+${reps} REP${reps > 1 ? 'S' : ''} PARA SUPERARLO`;
    }
    default: return 'HOY TOCA CONSOLIDAR';
  }
}

const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

/** "22 · SEP · 2026" */
export function cardDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')} · ${MONTHS[date.getMonth()]} · ${date.getFullYear()}`;
}

/** "15–21 SEP" (or "28 SEP – 4 OCT" across months) */
export function weekRangeLabel(start: Date): string {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return start.getMonth() === end.getMonth()
    ? `${start.getDate()}–${end.getDate()} ${MONTHS[end.getMonth()]}`
    : `${start.getDate()} ${MONTHS[start.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]}`;
}
