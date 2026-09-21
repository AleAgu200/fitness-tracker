import { randomBytes } from "crypto";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { auditEvents, planDrafts, planTemplates } from "@/db/schema";
import {
  AssignmentConflictError,
  assignMealPlan,
  assignWorkout,
  currentPlanVersion,
  getActiveMealPlan,
  getActiveWorkout,
  getMealPlanVersion,
  getWorkoutVersion,
  type MealPlanPayload,
  type WorkoutPayload,
} from "@/lib/assignments";
import { normalizePlanPayload } from "@/lib/plan-payload";
import {
  requireCategoryAccess,
  type AccessContext,
  type Discipline,
  type OrganizationActor,
  type SharingCategory,
} from "@/lib/permissions";

function newId(): string {
  return randomBytes(12).toString("hex");
}

const CATEGORY_BY_DISCIPLINE: Record<Discipline, SharingCategory> = {
  coach: "training",
  nutritionist: "nutrition",
};

export function parseDiscipline(value: string | null): Discipline | null {
  return value === "coach" || value === "nutritionist" ? value : null;
}

/** Access to edit an athlete's plan for one discipline, or null. */
export async function requirePlanAccess(
  professionalUserId: string,
  athleteId: string,
  discipline: Discipline,
): Promise<AccessContext | null> {
  const access = await requireCategoryAccess(professionalUserId, athleteId, CATEGORY_BY_DISCIPLINE[discipline]);
  return access && access.discipline === discipline ? access : null;
}

export interface PlanDraft {
  id: string;
  discipline: Discipline;
  baseVersion: number;
  name: string | null;
  payload: unknown;
  effectiveAt: number | null;
  endsAt: number | null;
  sourceTemplateId: string | null;
  authorMembershipId: string;
  createdAt: number;
  updatedAt: number;
  /** True when someone published while this draft was open. */
  stale: boolean;
}

export class DraftConflictError extends Error {
  constructor(public readonly currentVersion: number) {
    super("draft_base_version_stale");
  }
}

async function audit(
  actor: OrganizationActor | AccessContext,
  action: string,
  subjectType: string,
  subjectId: string,
  metadata: Record<string, unknown>,
) {
  await db.insert(auditEvents).values({
    id: newId(),
    organizationId: actor.organizationId,
    actorMembershipId: actor.membershipId,
    action,
    subjectType,
    subjectId,
    metadata,
    occurredAt: Date.now(),
  });
}

function toDraft(row: typeof planDrafts.$inferSelect, currentVersion: number): PlanDraft {
  return {
    id: row.id,
    discipline: row.discipline as Discipline,
    baseVersion: row.baseVersion,
    name: row.name,
    payload: row.payload,
    effectiveAt: row.effectiveAt,
    endsAt: row.endsAt,
    sourceTemplateId: row.sourceTemplateId,
    authorMembershipId: row.authorMembershipId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    stale: row.baseVersion !== currentVersion,
  };
}

/** The payload a new draft starts from: whatever the athlete has in force today. */
async function seedPayload(athleteId: string, discipline: Discipline): Promise<unknown> {
  if (discipline === "coach") {
    const active = await getActiveWorkout(athleteId);
    return active?.payload ?? { coachName: "", exercises: [] } satisfies WorkoutPayload;
  }
  const active = await getActiveMealPlan(athleteId);
  return active?.payload ?? { nutritionistName: "", meals: [] } satisfies MealPlanPayload;
}

export async function getDraft(access: AccessContext, athleteId: string): Promise<PlanDraft | null> {
  const [row] = await db.select().from(planDrafts).where(and(
    eq(planDrafts.organizationClientId, access.organizationClientId),
    eq(planDrafts.discipline, access.discipline),
  )).limit(1);
  if (!row) return null;
  return toDraft(row, await currentPlanVersion(athleteId, access.discipline));
}

/** Idempotent: reopening the editor returns the draft already in progress. */
export async function openDraft(access: AccessContext, athleteId: string): Promise<PlanDraft> {
  const existing = await getDraft(access, athleteId);
  if (existing) return existing;

  const baseVersion = await currentPlanVersion(athleteId, access.discipline);
  const now = Date.now();
  const row = {
    id: newId(),
    organizationId: access.organizationId,
    organizationClientId: access.organizationClientId,
    athleteId,
    discipline: access.discipline,
    authorMembershipId: access.membershipId,
    sourceTemplateId: null,
    baseVersion,
    name: null,
    payload: await seedPayload(athleteId, access.discipline),
    effectiveAt: null,
    endsAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(planDrafts).values(row).onConflictDoNothing({
    target: [planDrafts.organizationClientId, planDrafts.discipline],
  });
  // A concurrent open wins the unique index; return whatever is there now.
  return (await getDraft(access, athleteId))!;
}

export interface SaveDraftInput {
  payload?: unknown;
  name?: string | null;
  effectiveAt?: number | null;
  endsAt?: number | null;
  sourceTemplateId?: string | null;
}

export async function saveDraft(
  access: AccessContext,
  athleteId: string,
  input: SaveDraftInput,
): Promise<PlanDraft | null> {
  const draft = await getDraft(access, athleteId);
  if (!draft) return null;

  await db.update(planDrafts).set({
    ...(input.payload !== undefined
      ? { payload: normalizePlanPayload(access.discipline, input.payload) }
      : {}),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.effectiveAt !== undefined ? { effectiveAt: input.effectiveAt } : {}),
    ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
    ...(input.sourceTemplateId !== undefined ? { sourceTemplateId: input.sourceTemplateId } : {}),
    updatedAt: Date.now(),
  }).where(eq(planDrafts.id, draft.id));

  return getDraft(access, athleteId);
}

export async function discardDraft(access: AccessContext, athleteId: string): Promise<boolean> {
  const draft = await getDraft(access, athleteId);
  if (!draft) return false;
  await db.delete(planDrafts).where(eq(planDrafts.id, draft.id));
  await audit(access, "plan_draft_discarded", "plan_draft", draft.id, { athleteId, discipline: draft.discipline });
  return true;
}

export interface PublishResult {
  version: number;
  effectiveAt: number;
}

/**
 * Move the draft into the athlete-facing tables. The draft's `baseVersion` is
 * passed through as the optimistic-concurrency token, so a plan published by
 * someone else while this draft was open raises rather than overwriting.
 */
export async function publishDraft(
  access: AccessContext,
  athleteId: string,
  professionalUserId: string,
  professionalName: string,
): Promise<PublishResult | null> {
  const draft = await getDraft(access, athleteId);
  if (!draft) return null;

  const now = Date.now();
  const effectiveAt = draft.effectiveAt != null && draft.effectiveAt > now ? draft.effectiveAt : now;
  const options = {
    access,
    baseVersion: draft.baseVersion,
    effectiveAt,
    endsAt: draft.endsAt,
    name: draft.name,
    sourceTemplateId: draft.sourceTemplateId,
  };

  let version: number;
  try {
    version = draft.discipline === "coach"
      ? await assignWorkout(professionalUserId, athleteId, {
          ...(draft.payload as WorkoutPayload),
          coachName: professionalName,
        }, options)
      : await assignMealPlan(professionalUserId, athleteId, {
          ...(draft.payload as MealPlanPayload),
          nutritionistName: professionalName,
        }, options);
  } catch (error) {
    if (error instanceof AssignmentConflictError) {
      throw new DraftConflictError(error.currentVersion);
    }
    throw error;
  }

  await db.delete(planDrafts).where(eq(planDrafts.id, draft.id));
  await audit(access, "plan_published", "plan", `${athleteId}:${draft.discipline}:${version}`, {
    athleteId,
    discipline: draft.discipline,
    version,
    effectiveAt,
    endsAt: draft.endsAt,
    scheduled: effectiveAt > now,
  });

  return { version, effectiveAt };
}

/**
 * Reverting never republishes behind the athlete's back: it loads the old
 * payload into a draft so the professional reviews and publishes it as a new
 * version, preserving the "no silent overwrite" rule.
 */
export async function revertToVersion(
  access: AccessContext,
  athleteId: string,
  version: number,
): Promise<PlanDraft | null> {
  const row = access.discipline === "coach"
    ? await getWorkoutVersion(athleteId, version)
    : await getMealPlanVersion(athleteId, version);
  if (!row) return null;

  await openDraft(access, athleteId);
  const draft = await saveDraft(access, athleteId, {
    payload: row.payload,
    name: row.name ? `${row.name} (revertido)` : `Revertido a v${version}`,
    sourceTemplateId: row.sourceTemplateId,
  });
  if (draft) {
    await audit(access, "plan_reverted_to_draft", "plan_draft", draft.id, { athleteId, fromVersion: version });
  }
  return draft;
}

export interface PlanTemplateSummary {
  id: string;
  name: string;
  discipline: Discipline;
  createdAt: number;
  updatedAt: number;
}

export async function listTemplates(organizationId: string, discipline: Discipline): Promise<PlanTemplateSummary[]> {
  const rows = await db.select({
    id: planTemplates.id,
    name: planTemplates.name,
    discipline: planTemplates.discipline,
    createdAt: planTemplates.createdAt,
    updatedAt: planTemplates.updatedAt,
  })
    .from(planTemplates)
    .where(and(
      eq(planTemplates.organizationId, organizationId),
      eq(planTemplates.discipline, discipline),
      isNull(planTemplates.archivedAt),
    ))
    .orderBy(desc(planTemplates.updatedAt));
  return rows.map(row => ({ ...row, discipline: row.discipline as Discipline }));
}

export async function getTemplate(organizationId: string, templateId: string) {
  const [row] = await db.select().from(planTemplates).where(and(
    eq(planTemplates.id, templateId),
    eq(planTemplates.organizationId, organizationId),
    isNull(planTemplates.archivedAt),
  )).limit(1);
  return row ?? null;
}

export async function createTemplate(
  actor: OrganizationActor | AccessContext,
  name: string,
  payload: unknown,
): Promise<PlanTemplateSummary> {
  const now = Date.now();
  const id = newId();
  await db.insert(planTemplates).values({
    id,
    organizationId: actor.organizationId,
    discipline: actor.discipline,
    name,
    payload,
    createdByMembershipId: actor.membershipId,
    createdAt: now,
    updatedAt: now,
  });
  await audit(actor, "plan_template_created", "plan_template", id, { name, discipline: actor.discipline });
  return { id, name, discipline: actor.discipline, createdAt: now, updatedAt: now };
}

export async function archiveTemplate(
  actor: OrganizationActor | AccessContext,
  templateId: string,
): Promise<boolean> {
  const rows = await db.update(planTemplates)
    .set({ archivedAt: Date.now() })
    .where(and(
      eq(planTemplates.id, templateId),
      eq(planTemplates.organizationId, actor.organizationId),
      isNull(planTemplates.archivedAt),
    ))
    .returning({ id: planTemplates.id });
  if (!rows.length) return false;
  await audit(actor, "plan_template_archived", "plan_template", templateId, {});
  return true;
}

/**
 * Copy a template into the athlete's draft. The template is the source, never
 * the live object — later edits to the draft or the published plan leave the
 * master template untouched.
 */
export async function applyTemplateToDraft(
  access: AccessContext,
  athleteId: string,
  templateId: string,
): Promise<PlanDraft | null> {
  const template = await getTemplate(access.organizationId, templateId);
  if (!template || template.discipline !== access.discipline) return null;

  await openDraft(access, athleteId);
  return saveDraft(access, athleteId, {
    payload: template.payload,
    name: template.name,
    sourceTemplateId: template.id,
  });
}

/** Save the athlete's current draft back out as a reusable org template. */
export async function saveDraftAsTemplate(
  access: AccessContext,
  athleteId: string,
  name: string,
): Promise<PlanTemplateSummary | null> {
  const draft = await getDraft(access, athleteId);
  if (!draft) return null;
  return createTemplate(access, name, draft.payload);
}
