import { eq, sql } from 'drizzle-orm';

import { db } from './index';
import { achievementDefinitions, exercises } from './schema';

const DEFAULT_EXERCISES = [
  { id: 'ex_sentadilla', name: 'Sentadilla',    muscleGroup: 'legs' as const,  equipment: 'barbell' as const },
  { id: 'ex_press_banca', name: 'Press banca',  muscleGroup: 'chest' as const, equipment: 'barbell' as const },
  { id: 'ex_peso_muerto', name: 'Peso muerto',  muscleGroup: 'back' as const,  equipment: 'barbell' as const },
  { id: 'ex_press_militar', name: 'Press militar', muscleGroup: 'shoulders' as const, equipment: 'barbell' as const },
  { id: 'ex_dominadas', name: 'Dominadas',      muscleGroup: 'back' as const,  equipment: 'bodyweight' as const },
  { id: 'ex_remo_barra', name: 'Remo con barra', muscleGroup: 'back' as const, equipment: 'barbell' as const },
];

const DEFAULT_ACHIEVEMENTS = [
  { id: 'ach_first_pr',   key: 'first_pr',    name: 'Primer PR',      icon: '🏆', conditionType: 'pr_count' as const,            conditionValue: 1 },
  { id: 'ach_streak_10',  key: 'streak_10',   name: 'Racha 10 días',  icon: '🔥', conditionType: 'streak_days' as const,         conditionValue: 10 },
  { id: 'ach_minus_3kg',  key: 'minus_3kg',   name: '−3 kg',          icon: '⚖️', conditionType: 'weight_lost_kg' as const,      conditionValue: 3 },
  { id: 'ach_full_week',  key: 'full_week',   name: 'Semana completa',icon: '📅', conditionType: 'session_count' as const,       conditionValue: 5 },
  { id: 'ach_squat_140',  key: 'squat_140',   name: 'Squat 140 kg',   icon: '🦵', conditionType: 'custom' as const,              conditionValue: 140 },
  { id: 'ach_recomp',     key: 'recomp',      name: 'Recomposición',  icon: '💪', conditionType: 'nutrition_adherence' as const, conditionValue: 80 },
];

// Idempotent — checks the count before inserting
export async function seedDefaults() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(exercises);

  if (count === 0) {
    await db.insert(exercises).values(
      DEFAULT_EXERCISES.map(e => ({ ...e, isCustom: false })),
    );
  }

  const [{ count: achCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(achievementDefinitions);

  if (achCount === 0) {
    await db.insert(achievementDefinitions).values(DEFAULT_ACHIEVEMENTS);
  }
}
