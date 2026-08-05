import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { nanoid } from '@/lib/id';
import { todayStr, WEEKDAY_LABELS } from '@/lib/dates';
import { db } from './index';
import {
  exercises,
  personalRecords,
  programs,
  templateExerciseSlots,
  workoutTemplates,
} from './schema';

export interface PlanExercise {
  slotId: string;
  exerciseId: string;
  nombre: string;
  target: number;   // sets
  reps: number;
  peso: number;     // kg
  step: number;     // kg per increment
  restSeconds: number;
  basePR: number;
  muscleGroup: 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'full' | null;
  wxId: string | null; // WorkoutX id, for showing the exercise's demo animation
}

async function getOrCreateActiveProgramId(athleteId: string): Promise<string> {
  const existing = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.athleteId, athleteId), eq(programs.active, true)))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const programId = nanoid();
  await db.insert(programs).values({
    id: programId,
    athleteId,
    coachId: null,
    name: 'Plan personal',
    startDate: todayStr(),
    active: true,
    createdAt: new Date(),
  });
  return programId;
}

/**
 * Resolves (creating if needed) the template for a given day of the week
 * (1 = Sunday .. 7 = Saturday, see lib/dates.ts). The first time a day gets its
 * own template, it's seeded from the legacy day-less template (weekday = null)
 * if one exists, so upgrading from the old single-plan model doesn't lose
 * anyone's exercises — each day then diverges independently from there.
 */
async function getOrCreateTemplate(athleteId: string, weekday: number): Promise<string> {
  const programId = await getOrCreateActiveProgramId(athleteId);

  const templates = await db
    .select({ id: workoutTemplates.id, weekday: workoutTemplates.weekday })
    .from(workoutTemplates)
    .where(eq(workoutTemplates.programId, programId));

  const forDay = templates.find(t => t.weekday === weekday);
  if (forDay) return forDay.id;

  const templateId = nanoid();
  const label = WEEKDAY_LABELS[weekday] ?? 'SESIÓN';
  await db.insert(workoutTemplates).values({
    id: templateId,
    programId,
    coachId: null,
    name: label,
    sessionLabel: label,
    type: null,
    templateOrder: weekday,
    weekday,
    createdAt: new Date(),
  });

  const legacy = templates.find(t => t.weekday === null);
  if (legacy) {
    const slots = await db
      .select()
      .from(templateExerciseSlots)
      .where(eq(templateExerciseSlots.templateId, legacy.id));
    if (slots.length) {
      await db.insert(templateExerciseSlots).values(
        slots.map(s => ({ ...s, id: nanoid(), templateId })),
      );
    }
  }
  return templateId;
}

export interface WeekdaySummary {
  weekday: number;
  exerciseCount: number;
}

/** Exercise count per day of the week, for showing which days already have a plan. */
export async function getWeekSummary(athleteId: string): Promise<WeekdaySummary[]> {
  const programId = await getOrCreateActiveProgramId(athleteId);
  const templates = await db
    .select({ id: workoutTemplates.id, weekday: workoutTemplates.weekday })
    .from(workoutTemplates)
    .where(eq(workoutTemplates.programId, programId));

  const templateIds = templates.map(t => t.id);
  const countByTemplate = new Map<string, number>();
  if (templateIds.length) {
    const counts = await db
      .select({ templateId: templateExerciseSlots.templateId, n: sql<number>`count(*)` })
      .from(templateExerciseSlots)
      .where(inArray(templateExerciseSlots.templateId, templateIds))
      .groupBy(templateExerciseSlots.templateId);
    for (const c of counts) countByTemplate.set(c.templateId, c.n);
  }

  const result: WeekdaySummary[] = [];
  for (let weekday = 1; weekday <= 7; weekday++) {
    const t = templates.find(x => x.weekday === weekday);
    result.push({ weekday, exerciseCount: t ? countByTemplate.get(t.id) ?? 0 : 0 });
  }
  return result;
}

export async function getPlan(athleteId: string, weekday: number): Promise<{ templateId: string; exercises: PlanExercise[] }> {
  const templateId = await getOrCreateTemplate(athleteId, weekday);

  const rows = await db
    .select({
      slotId: templateExerciseSlots.id,
      exerciseId: templateExerciseSlots.exerciseId,
      nombre: exercises.name,
      target: templateExerciseSlots.targetSets,
      reps: templateExerciseSlots.targetReps,
      peso: templateExerciseSlots.targetWeightKg,
      step: templateExerciseSlots.stepKg,
      restSeconds: templateExerciseSlots.restSeconds,
      muscleGroup: exercises.muscleGroup,
      wxId: exercises.wxId,
    })
    .from(templateExerciseSlots)
    .innerJoin(exercises, eq(templateExerciseSlots.exerciseId, exercises.id))
    .where(eq(templateExerciseSlots.templateId, templateId))
    .orderBy(asc(templateExerciseSlots.slotOrder));

  const prs = await db
    .select({ exerciseId: personalRecords.exerciseId, weightKg: personalRecords.weightKg })
    .from(personalRecords)
    .where(eq(personalRecords.athleteId, athleteId));
  const prByExercise = new Map(prs.map(p => [p.exerciseId, p.weightKg]));

  return {
    templateId,
    exercises: rows.map(r => ({
      slotId: r.slotId,
      exerciseId: r.exerciseId,
      nombre: r.nombre,
      target: r.target,
      reps: r.reps,
      peso: r.peso ?? 0,
      step: r.step,
      restSeconds: r.restSeconds,
      basePR: prByExercise.get(r.exerciseId) ?? r.peso ?? 0,
      muscleGroup: r.muscleGroup,
      wxId: r.wxId,
    })),
  };
}

/** Reuse a catalog exercise when the name matches, otherwise create a custom one.
 *  When a WorkoutX id is given, it's also backfilled onto an existing name match
 *  that doesn't have one yet, so re-picking the same exercise from search later
 *  unlocks its demo animation. */
async function resolveExerciseId(athleteId: string, nombre: string, wxId?: string | null): Promise<string> {
  const all = await db.select({ id: exercises.id, name: exercises.name, wxId: exercises.wxId }).from(exercises);
  const match = all.find(e => e.name.trim().toLowerCase() === nombre.trim().toLowerCase());
  if (match) {
    if (wxId && !match.wxId) {
      await db.update(exercises).set({ wxId }).where(eq(exercises.id, match.id));
    }
    return match.id;
  }

  const id = nanoid();
  await db.insert(exercises).values({
    id,
    name: nombre.trim(),
    muscleGroup: null,
    equipment: null,
    isCustom: true,
    createdByUserId: athleteId,
    wxId: wxId ?? null,
  });
  return id;
}

export async function addPlanExercise(
  athleteId: string,
  templateId: string,
  data: { nombre: string; target: number; reps: number; peso: number; step: number; wxId?: string | null },
): Promise<void> {
  const exerciseId = await resolveExerciseId(athleteId, data.nombre, data.wxId);
  const existing = await db
    .select({ id: templateExerciseSlots.id })
    .from(templateExerciseSlots)
    .where(eq(templateExerciseSlots.templateId, templateId));

  await db.insert(templateExerciseSlots).values({
    id: nanoid(),
    templateId,
    exerciseId,
    slotOrder: existing.length,
    targetSets: data.target,
    targetReps: data.reps,
    targetWeightKg: data.peso,
    restSeconds: 90,
    stepKg: data.step,
  });
}

export async function updatePlanExercise(
  athleteId: string,
  slotId: string,
  data: { nombre: string; target: number; reps: number; peso: number; step: number; wxId?: string | null },
): Promise<void> {
  const exerciseId = await resolveExerciseId(athleteId, data.nombre, data.wxId);
  await db
    .update(templateExerciseSlots)
    .set({
      exerciseId,
      targetSets: data.target,
      targetReps: data.reps,
      targetWeightKg: data.peso,
      stepKg: data.step,
    })
    .where(eq(templateExerciseSlots.id, slotId));
}

export async function deletePlanExercise(slotId: string): Promise<void> {
  await db.delete(templateExerciseSlots).where(eq(templateExerciseSlots.id, slotId));
}

export interface AssignedExercise {
  nombre: string;
  target: number;
  reps: number;
  peso: number;
  step: number;
  restSeconds: number;
}

/** Replace the whole plan with a coach-assigned one (logged history keeps its rows — slotId nulls out) */
export async function replacePlanExercises(
  athleteId: string,
  templateId: string,
  items: AssignedExercise[],
): Promise<void> {
  await db.delete(templateExerciseSlots).where(eq(templateExerciseSlots.templateId, templateId));
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const exerciseId = await resolveExerciseId(athleteId, it.nombre);
    await db.insert(templateExerciseSlots).values({
      id: nanoid(),
      templateId,
      exerciseId,
      slotOrder: i,
      targetSets: it.target,
      targetReps: it.reps,
      targetWeightKg: it.peso,
      restSeconds: it.restSeconds,
      stepKg: it.step,
    });
  }
}

const SUGGESTED_PLAN = [
  { exerciseId: 'ex_sentadilla',    target: 4, reps: 6,  peso: 60, step: 5 },
  { exerciseId: 'ex_press_banca',   target: 4, reps: 8,  peso: 40, step: 2.5 },
  { exerciseId: 'ex_peso_muerto',   target: 3, reps: 5,  peso: 80, step: 5 },
  { exerciseId: 'ex_press_militar', target: 3, reps: 8,  peso: 25, step: 2.5 },
  { exerciseId: 'ex_dominadas',     target: 3, reps: 8,  peso: 0,  step: 1 },
  { exerciseId: 'ex_remo_barra',    target: 4, reps: 10, peso: 40, step: 2.5 },
];

/** Fill an empty plan with the seeded catalog exercises */
export async function applySuggestedPlan(templateId: string): Promise<void> {
  const existing = await db
    .select({ id: templateExerciseSlots.id })
    .from(templateExerciseSlots)
    .where(eq(templateExerciseSlots.templateId, templateId));
  if (existing.length > 0) return;

  await db.insert(templateExerciseSlots).values(
    SUGGESTED_PLAN.map((s, i) => ({
      id: nanoid(),
      templateId,
      exerciseId: s.exerciseId,
      slotOrder: i,
      targetSets: s.target,
      targetReps: s.reps,
      targetWeightKg: s.peso,
      restSeconds: 90,
      stepKg: s.step,
    })),
  );
}
