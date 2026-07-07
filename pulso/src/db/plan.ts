import { and, asc, eq } from 'drizzle-orm';

import { nanoid } from '@/lib/id';
import { todayStr } from '@/lib/dates';
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
}

async function getOrCreateTemplate(athleteId: string): Promise<string> {
  const existing = await db
    .select({ id: workoutTemplates.id })
    .from(workoutTemplates)
    .innerJoin(programs, eq(workoutTemplates.programId, programs.id))
    .where(and(eq(programs.athleteId, athleteId), eq(programs.active, true)))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const programId = nanoid();
  const templateId = nanoid();
  const now = new Date();
  await db.insert(programs).values({
    id: programId,
    athleteId,
    coachId: null,
    name: 'Plan personal',
    startDate: todayStr(),
    active: true,
    createdAt: now,
  });
  await db.insert(workoutTemplates).values({
    id: templateId,
    programId,
    coachId: null,
    name: 'Sesión A',
    sessionLabel: 'SESIÓN A · FULL BODY',
    type: 'full_body',
    templateOrder: 0,
    createdAt: now,
  });
  return templateId;
}

export async function getPlan(athleteId: string): Promise<{ templateId: string; exercises: PlanExercise[] }> {
  const templateId = await getOrCreateTemplate(athleteId);

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
    })),
  };
}

/** Reuse a catalog exercise when the name matches, otherwise create a custom one */
async function resolveExerciseId(athleteId: string, nombre: string): Promise<string> {
  const all = await db.select({ id: exercises.id, name: exercises.name }).from(exercises);
  const match = all.find(e => e.name.trim().toLowerCase() === nombre.trim().toLowerCase());
  if (match) return match.id;

  const id = nanoid();
  await db.insert(exercises).values({
    id,
    name: nombre.trim(),
    muscleGroup: null,
    equipment: null,
    isCustom: true,
    createdByUserId: athleteId,
  });
  return id;
}

export async function addPlanExercise(
  athleteId: string,
  templateId: string,
  data: { nombre: string; target: number; reps: number; peso: number; step: number },
): Promise<void> {
  const exerciseId = await resolveExerciseId(athleteId, data.nombre);
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
  data: { nombre: string; target: number; reps: number; peso: number; step: number },
): Promise<void> {
  const exerciseId = await resolveExerciseId(athleteId, data.nombre);
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
