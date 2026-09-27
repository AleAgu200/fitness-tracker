import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { nanoid } from '@/lib/id';
import { todayStr, WEEKDAY_LABELS } from '@/lib/dates';
import { canCreateOwnPlan, copyPlanName, nextPlanName, normalizePlanName, OWN_PLAN_LIMIT_ERROR } from '@/lib/plan-limits';
import { db } from './index';
import { enqueueSyncMutation } from './sync';
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
  wxId: string | null; // legacy WorkoutX id, for showing the exercise's demo animation (WorkoutX disabled)
  gifPath: string | null; // local exercise-catalog GIF path, preferred over wxId
  instructions: string | null; // technique guide paired with the animation
}

export type ProgramOrigin = 'own' | 'coach' | 'ai';

const DEFAULT_PROGRAM_NAMES: Record<ProgramOrigin, string> = {
  own: 'Plan personal',
  coach: 'Plan de tu coach',
  ai: 'Plan PULSO IA',
};

async function getOrCreateActiveProgramId(athleteId: string): Promise<string> {
  const existing = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.athleteId, athleteId), eq(programs.active, true)))
    .limit(1);
  if (existing[0]) return existing[0].id;

  // Nothing active: fall back to the athlete's own plan before creating one.
  const [own] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.athleteId, athleteId), eq(programs.origin, 'own'), isNull(programs.archivedAt)))
    .orderBy(asc(programs.createdAt))
    .limit(1);
  if (own) {
    await db.update(programs).set({ active: true, lastActivatedAt: new Date() }).where(eq(programs.id, own.id));
    return own.id;
  }
  return createProgram(athleteId, 'own', { active: true });
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Tells the care team whether the coach's plan is the one in force — nothing
 * about the athlete's other plans. Only relevant once a coach plan exists, and
 * it leaves the phone only with the training consent (see lib/sync).
 */
async function recordPlanSelection(tx: Transaction, athleteId: string, activeOrigin: ProgramOrigin): Promise<void> {
  const [coach] = await tx.select({ id: programs.id }).from(programs)
    .where(and(eq(programs.athleteId, athleteId), eq(programs.origin, 'coach'))).limit(1);
  if (!coach) return;
  const now = new Date();
  await enqueueSyncMutation(tx, {
    athleteId,
    entityType: 'plan_selection',
    entityId: `plan_selection_${athleteId}`,
    operation: 'update',
    occurredAt: now,
    payload: { coachPlanSelected: activeOrigin === 'coach', selectedAt: now.getTime() },
  });
}

async function createProgram(
  athleteId: string,
  origin: ProgramOrigin,
  options: { active: boolean; name?: string },
): Promise<string> {
  const programId = nanoid();
  await db.transaction(async tx => {
    await insertProgram(tx, athleteId, programId, origin, options);
  });
  return programId;
}

async function insertProgram(
  tx: Transaction,
  athleteId: string,
  programId: string,
  origin: ProgramOrigin,
  options: { active: boolean; name?: string },
): Promise<void> {
  const now = new Date();
  if (options.active) {
    await tx.update(programs).set({ active: false }).where(eq(programs.athleteId, athleteId));
  }
  await tx.insert(programs).values({
    id: programId,
    athleteId,
    coachId: null,
    name: options.name ?? DEFAULT_PROGRAM_NAMES[origin],
    startDate: todayStr(),
    active: options.active,
    origin,
    createdAt: now,
    lastActivatedAt: options.active ? now : null,
  });
  if (options.active) await recordPlanSelection(tx, athleteId, origin);
}

async function findProgram(athleteId: string, origin: ProgramOrigin) {
  const [row] = await db
    .select()
    .from(programs)
    .where(and(eq(programs.athleteId, athleteId), eq(programs.origin, origin), isNull(programs.archivedAt)))
    .orderBy(asc(programs.createdAt))
    .limit(1);
  return row ?? null;
}

export interface ActiveProgram {
  id: string;
  name: string;
  origin: ProgramOrigin;
}

export async function getActiveProgram(athleteId: string): Promise<ActiveProgram> {
  const id = await getOrCreateActiveProgramId(athleteId);
  const [row] = await db.select().from(programs).where(eq(programs.id, id)).limit(1);
  return { id: row.id, name: row.name, origin: row.origin };
}

export interface ProgramSummary extends ActiveProgram {
  active: boolean;
  startDate: string;
  endDate: string | null;
  createdAt: number;
  lastActivatedAt: number | null;
  /** Exercise count per weekday (1 = Sunday .. 7 = Saturday). */
  dayCounts: Record<number, number>;
}

/** Every training plan the athlete keeps on this phone (archived ones aside),
 *  active first. There is always an active one to come back to. */
export async function listPrograms(athleteId: string): Promise<ProgramSummary[]> {
  await getOrCreateActiveProgramId(athleteId);

  const rows = await db.select().from(programs)
    .where(and(eq(programs.athleteId, athleteId), isNull(programs.archivedAt)));
  const summaries: ProgramSummary[] = [];
  for (const row of rows) {
    summaries.push({
      id: row.id,
      name: row.name,
      origin: row.origin,
      active: row.active,
      startDate: row.startDate,
      endDate: row.endDate,
      createdAt: row.createdAt.getTime(),
      lastActivatedAt: row.lastActivatedAt?.getTime() ?? null,
      dayCounts: Object.fromEntries((await getProgramWeekSummary(row.id)).map(day => [day.weekday, day.exerciseCount])),
    });
  }
  return summaries.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'es'));
}

/** Switches the athlete's plan. One active program at a time, atomically. */
export async function activateProgram(athleteId: string, programId: string): Promise<void> {
  await db.transaction(async tx => {
    const [target] = await tx.select({ id: programs.id, origin: programs.origin }).from(programs)
      .where(and(eq(programs.id, programId), eq(programs.athleteId, athleteId), isNull(programs.archivedAt))).limit(1);
    if (!target) throw new Error('program_not_found');
    await tx.update(programs).set({ active: false }).where(eq(programs.athleteId, athleteId));
    await tx.update(programs).set({ active: true, lastActivatedAt: new Date() }).where(eq(programs.id, programId));
    await recordPlanSelection(tx, athleteId, target.origin);
  });
}

/**
 * Creates another own plan — empty, or a copy of any plan the athlete has
 * (a coach's included) — and makes it the active one so it can be built in
 * Entreno right away. Refuses when the free own-plan quota is used and the
 * account has no PULSO Plus (lib/plan-limits).
 */
export async function createOwnProgram(
  athleteId: string,
  options: { name?: string; sourceProgramId?: string | null; entitled: boolean },
): Promise<string> {
  const taken = (await db.select({ name: programs.name }).from(programs)
    .where(and(eq(programs.athleteId, athleteId), isNull(programs.archivedAt)))).map(row => row.name);
  const programId = nanoid();
  await db.transaction(async tx => {
    const own = await tx.select({ id: programs.id, origin: programs.origin, createdAt: programs.createdAt, lastActivatedAt: programs.lastActivatedAt })
      .from(programs)
      .where(and(eq(programs.athleteId, athleteId), eq(programs.origin, 'own'), isNull(programs.archivedAt)));
    const limited = own.map(row => ({ ...row, createdAt: row.createdAt.getTime(), lastActivatedAt: row.lastActivatedAt?.getTime() ?? null }));
    if (!canCreateOwnPlan(limited, options.entitled)) throw new Error(OWN_PLAN_LIMIT_ERROR);
    let name = options.name ? normalizePlanName(options.name) : null;
    let sourceTemplates: (typeof workoutTemplates.$inferSelect)[] = [];
    if (options.sourceProgramId) {
      const [source] = await tx.select({ name: programs.name }).from(programs)
        .where(and(eq(programs.id, options.sourceProgramId), eq(programs.athleteId, athleteId))).limit(1);
      if (!source) throw new Error('program_not_found');
      name ??= copyPlanName(source.name, taken);
      sourceTemplates = await tx.select().from(workoutTemplates)
        .where(and(eq(workoutTemplates.programId, options.sourceProgramId), eq(workoutTemplates.kind, 'plan')));
    }
    await insertProgram(tx, athleteId, programId, 'own', {
      active: true,
      name: name ?? nextPlanName(DEFAULT_PROGRAM_NAMES.own, taken),
    });
    for (const template of sourceTemplates) {
      const templateId = nanoid();
      await tx.insert(workoutTemplates).values({ ...template, id: templateId, programId, coachId: null, createdAt: new Date() });
      const slots = await tx.select().from(templateExerciseSlots).where(eq(templateExerciseSlots.templateId, template.id));
      if (slots.length) {
        await tx.insert(templateExerciseSlots).values(slots.map(slot => ({ ...slot, id: nanoid(), templateId })));
      }
    }
  });
  return programId;
}

/** Renames one of the athlete's own plans; assigned and AI plans keep theirs. */
export async function renameProgram(athleteId: string, programId: string, name: string): Promise<void> {
  const clean = normalizePlanName(name);
  if (!clean) throw new Error('invalid_name');
  await db.update(programs).set({ name: clean })
    .where(and(eq(programs.id, programId), eq(programs.athleteId, athleteId), eq(programs.origin, 'own')));
}

/**
 * "Deletes" an own plan that isn't active. It's archived rather than removed:
 * sessions already logged keep their template references and history.
 */
export async function archiveProgram(athleteId: string, programId: string): Promise<void> {
  const [row] = await db.select({ active: programs.active, origin: programs.origin }).from(programs)
    .where(and(eq(programs.id, programId), eq(programs.athleteId, athleteId))).limit(1);
  if (!row || row.origin !== 'own') throw new Error('program_not_deletable');
  if (row.active) throw new Error('program_active');
  await db.update(programs).set({ archivedAt: new Date() }).where(eq(programs.id, programId));
}

export interface ProgramDayOutline {
  weekday: number;
  exercises: { nombre: string; target: number; reps: number }[];
}

/** Read-only content of any plan, per weekday, for previewing it in "Mis
 *  planes" without activating it. Unseeded days show the base template. */
export async function getProgramOutline(athleteId: string, programId: string): Promise<ProgramDayOutline[]> {
  const [owner] = await db.select({ id: programs.id }).from(programs)
    .where(and(eq(programs.id, programId), eq(programs.athleteId, athleteId))).limit(1);
  if (!owner) return [];
  const templates = await db.select({ id: workoutTemplates.id, weekday: workoutTemplates.weekday })
    .from(workoutTemplates).where(eq(workoutTemplates.programId, programId));
  const rows = templates.length
    ? await db.select({
        templateId: templateExerciseSlots.templateId,
        nombre: exercises.name,
        target: templateExerciseSlots.targetSets,
        reps: templateExerciseSlots.targetReps,
      }).from(templateExerciseSlots)
        .innerJoin(exercises, eq(templateExerciseSlots.exerciseId, exercises.id))
        .where(inArray(templateExerciseSlots.templateId, templates.map(t => t.id)))
        .orderBy(asc(templateExerciseSlots.slotOrder))
    : [];
  const base = templates.find(t => t.weekday === null);
  const outline: ProgramDayOutline[] = [];
  for (let weekday = 1; weekday <= 7; weekday++) {
    const template = templates.find(t => t.weekday === weekday) ?? base;
    outline.push({
      weekday,
      exercises: template
        ? rows.filter(row => row.templateId === template.id).map(({ nombre, target, reps }) => ({ nombre, target, reps }))
        : [],
    });
  }
  return outline;
}

/**
 * Stores a coach's published session in the coach's own program, so it stays
 * available when the athlete trains on another plan. The session becomes the
 * base (weekday-less) template: every day is seeded from it on first use and
 * the athlete can still adjust a single day until the next version arrives.
 * The first coach plan becomes active; later versions never switch plans.
 */
export async function applyCoachWorkout(
  athleteId: string,
  assignment: { name: string | null; coachName: string; exercises: AssignedExercise[] },
): Promise<{ activated: boolean }> {
  const name = assignment.name?.trim() || `Plan de ${assignment.coachName}`;
  const existing = await findProgram(athleteId, 'coach');
  const programId = existing?.id ?? await createProgram(athleteId, 'coach', { active: true, name });
  if (existing) await db.update(programs).set({ name }).where(eq(programs.id, existing.id));
  await replaceProgramBase(athleteId, programId, assignment.exercises);
  return { activated: !existing };
}

/** Whether the coach's plan already lives in its own program on this phone. */
export async function hasCoachProgram(athleteId: string): Promise<boolean> {
  return (await findProgram(athleteId, 'coach')) != null;
}

/**
 * Applies an accepted AI plan (exercises per weekday) as the athlete's AI
 * program and activates it — accepting it is the athlete's explicit choice.
 * A coach's program is kept untouched in "Mis planes".
 */
export async function applyGeneratedPlan(
  athleteId: string,
  exercisesByWeekday: Map<number, AssignedExercise[]>,
): Promise<void> {
  const existing = await findProgram(athleteId, 'ai');
  const programId = existing?.id ?? await createProgram(athleteId, 'ai', { active: false });
  for (let weekday = 1; weekday <= 7; weekday++) {
    const templateId = await getOrCreateTemplateIn(programId, weekday);
    await replacePlanExercises(athleteId, templateId, exercisesByWeekday.get(weekday) ?? []);
  }
  await activateProgram(athleteId, programId);
}

async function replaceProgramBase(athleteId: string, programId: string, items: AssignedExercise[]): Promise<void> {
  const templateId = nanoid();
  await db.transaction(async tx => {
    // Slots are deleted explicitly: foreign_keys isn't guaranteed ON for the
    // connection, so the cascade can't be relied on. Past sessions keep their
    // logged rows either way (their slot/template references just go stale).
    const old = await tx.select({ id: workoutTemplates.id }).from(workoutTemplates)
      .where(eq(workoutTemplates.programId, programId));
    if (old.length) {
      await tx.delete(templateExerciseSlots).where(inArray(templateExerciseSlots.templateId, old.map(t => t.id)));
    }
    await tx.delete(workoutTemplates).where(eq(workoutTemplates.programId, programId));
    await tx.insert(workoutTemplates).values({
      id: templateId,
      programId,
      coachId: null,
      name: 'SESIÓN',
      sessionLabel: 'SESIÓN',
      type: null,
      templateOrder: 0,
      weekday: null,
      createdAt: new Date(),
    });
  });
  await replacePlanExercises(athleteId, templateId, items);
}

/**
 * Resolves (creating if needed) the template for a given day of the week
 * (1 = Sunday .. 7 = Saturday, see lib/dates.ts). The first time a day gets its
 * own template, it's seeded from the legacy day-less template (weekday = null)
 * if one exists, so upgrading from the old single-plan model doesn't lose
 * anyone's exercises — each day then diverges independently from there.
 */
async function getOrCreateTemplate(athleteId: string, weekday: number): Promise<string> {
  return getOrCreateTemplateIn(await getOrCreateActiveProgramId(athleteId), weekday);
}

async function getOrCreateTemplateIn(programId: string, weekday: number): Promise<string> {
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
  return getProgramWeekSummary(await getOrCreateActiveProgramId(athleteId));
}

/** Like getWeekSummary for any program. Days not yet seeded from the program's
 *  base template report the base template's count — that's what they'll show. */
async function getProgramWeekSummary(programId: string): Promise<WeekdaySummary[]> {
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

  const base = templates.find(x => x.weekday === null);
  const result: WeekdaySummary[] = [];
  for (let weekday = 1; weekday <= 7; weekday++) {
    const t = templates.find(x => x.weekday === weekday) ?? base;
    result.push({ weekday, exerciseCount: t ? countByTemplate.get(t.id) ?? 0 : 0 });
  }
  return result;
}

export async function getPlan(athleteId: string, weekday: number): Promise<{ templateId: string; exercises: PlanExercise[] }> {
  const templateId = await getOrCreateTemplate(athleteId, weekday);
  return { templateId, exercises: await getTemplateExercises(athleteId, templateId) };
}

/** Exercises of any template — a weekly plan day or a one-off free session. */
export async function getTemplateExercises(athleteId: string, templateId: string): Promise<PlanExercise[]> {
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
      gifPath: exercises.gifPath,
      instructions: exercises.instructions,
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

  return rows.map(r => ({
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
    gifPath: r.gifPath,
    instructions: r.instructions,
  }));
}

/** Reuse a catalog exercise when the name matches, otherwise create a custom one.
 *  When a gifPath/wxId is given, it's also backfilled onto an existing name match
 *  that doesn't have one yet, so re-picking the same exercise from search later
 *  unlocks its demo animation. */
export async function resolveExerciseId(
  athleteId: string,
  nombre: string,
  wxId?: string | null,
  gifPath?: string | null,
  instructions?: string | null,
): Promise<string> {
  const all = await db.select({
    id: exercises.id,
    name: exercises.name,
    wxId: exercises.wxId,
    gifPath: exercises.gifPath,
    instructions: exercises.instructions,
  }).from(exercises);
  const match = all.find(e => e.name.trim().toLowerCase() === nombre.trim().toLowerCase());
  if (match) {
    if ((gifPath && !match.gifPath) || (wxId && !match.wxId) || (instructions && !match.instructions)) {
      await db.update(exercises).set({
        ...(gifPath && !match.gifPath ? { gifPath } : {}),
        ...(wxId && !match.wxId ? { wxId } : {}),
        ...(instructions && !match.instructions ? { instructions } : {}),
      }).where(eq(exercises.id, match.id));
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
    gifPath: gifPath ?? null,
    instructions: instructions ?? null,
  });
  return id;
}

export async function addPlanExercise(
  athleteId: string,
  templateId: string,
  data: { nombre: string; target: number; reps: number; peso: number; step: number; wxId?: string | null; gifPath?: string | null; instructions?: string | null },
): Promise<void> {
  const exerciseId = await resolveExerciseId(athleteId, data.nombre, data.wxId, data.gifPath, data.instructions);
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
  data: { nombre: string; target: number; reps: number; peso: number; step: number; wxId?: string | null; gifPath?: string | null; instructions?: string | null },
): Promise<void> {
  const exerciseId = await resolveExerciseId(athleteId, data.nombre, data.wxId, data.gifPath, data.instructions);
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
  gifPath?: string | null;
  instructions?: string | null;
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
    const exerciseId = await resolveExerciseId(athleteId, it.nombre, null, it.gifPath, it.instructions);
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
