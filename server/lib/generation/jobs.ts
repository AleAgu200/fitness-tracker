import { createHash, randomUUID } from "crypto";

import { and, desc, eq, gte, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { planGenerationJobs } from "@/db/schema";

import {
  assembleAndGenerate,
  rawGenerationRequestSchema,
  type AssembleAndGenerateProgress,
  type AssembleAndGenerateResult,
  type RawGenerationRequest,
} from "./assemble";
import {
  GenerationTimeoutError,
  GenerationValidationError,
  MAX_UPSTREAM_CALLS,
} from "./openrouter";

const LEASE_DURATION_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 10_000;
const MAX_RUN_ATTEMPTS = 3;

export type PlanGenerationJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "requires_review"
  | "failed";

export type PlanGenerationJobPhase =
  | "queued"
  | "preparing"
  | "generating"
  | "validating"
  | "completed";

export interface PublicPlanGenerationJob {
  id: string;
  status: PlanGenerationJobStatus;
  phase: PlanGenerationJobPhase;
  attempt: number;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
  elapsedMs: number;
  durationMs: number | null;
  result: AssembleAndGenerateResult | null;
  error: { code: string; retryable: boolean } | null;
}

type GenerationJobRow = Omit<typeof planGenerationJobs.$inferSelect, "status" | "phase"> & {
  status: PlanGenerationJobStatus;
  phase: PlanGenerationJobPhase;
};

interface TimingEntry {
  phase: Exclude<PlanGenerationJobPhase, "queued" | "completed">;
  attempt: number;
  durationMs: number;
}

export interface GenerationJobLookup {
  job: PublicPlanGenerationJob | null;
  shouldSchedule: boolean;
}

export interface CreateGenerationJobResult extends GenerationJobLookup {
  job: PublicPlanGenerationJob;
  reused: boolean;
}

export type ConsumeGenerationJobResult =
  | { ok: true; job: PublicPlanGenerationJob }
  | { ok: false; reason: "not_found" | "not_terminal" };

class LostGenerationJobLeaseError extends Error {
  constructor() {
    super("generation_job_lease_lost");
    this.name = "LostGenerationJobLeaseError";
  }
}

class StoredGenerationRequestError extends Error {
  constructor() {
    super("stored_generation_request_invalid");
    this.name = "StoredGenerationRequestError";
  }
}

class GenerationCallBudgetExceededError extends Error {
  constructor() {
    super("generation_call_budget_exhausted");
    this.name = "GenerationCallBudgetExceededError";
  }
}

function logJobEvent(
  event: string,
  details: Record<string, string | number | boolean | null>,
): void {
  // Deliberately exclude user IDs, input hashes, prompts, results, provider
  // bodies, and exception messages: onboarding requests contain health data.
  console.info("[plan-generation-job]", JSON.stringify({ event, ...details }));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashInput(input: RawGenerationRequest): string {
  return createHash("sha256")
    .update(`plan-generation-job-v2:${stableJson(input)}`)
    .digest("hex");
}

function parseResult(value: unknown): AssembleAndGenerateResult | null {
  return value == null ? null : (value as AssembleAndGenerateResult);
}

function parseTimings(value: unknown): TimingEntry[] {
  return Array.isArray(value) ? (value as TimingEntry[]) : [];
}

function toPublicJob(row: GenerationJobRow, now = Date.now()): PublicPlanGenerationJob {
  const end = row.completedAt ?? now;
  return {
    id: row.id,
    status: row.status,
    phase: row.phase,
    attempt: row.attempt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    elapsedMs: Math.max(0, end - row.createdAt),
    durationMs: row.completedAt === null ? null : (row.durationMs ?? 0),
    result: parseResult(row.resultJson),
    error: row.errorCode
      ? { code: row.errorCode, retryable: row.errorRetryable === true }
      : null,
  };
}

async function getRowForUser(id: string, userId: string): Promise<GenerationJobRow | null> {
  const [row] = await db.select().from(planGenerationJobs)
    .where(and(eq(planGenerationJobs.id, id), eq(planGenerationJobs.userId, userId)));
  return (row as GenerationJobRow | undefined) ?? null;
}

async function getCurrentRow(userId: string): Promise<GenerationJobRow | null> {
  const [row] = await db.select().from(planGenerationJobs)
    .where(and(eq(planGenerationJobs.userId, userId), isNull(planGenerationJobs.consumedAt)))
    .orderBy(
      sql`case when ${planGenerationJobs.status} in ('queued','running') then 0 else 1 end`,
      desc(planGenerationJobs.createdAt),
    )
    .limit(1);
  return (row as GenerationJobRow | undefined) ?? null;
}

function isStale(row: GenerationJobRow, now = Date.now()): boolean {
  return row.status === "running" && (row.leaseExpiresAt ?? 0) <= now;
}

function shouldSchedule(row: GenerationJobRow, now = Date.now()): boolean {
  return row.status === "queued" || isStale(row, now);
}

async function recoverExhaustedJobs(userId: string, id?: string): Promise<void> {
  const now = Date.now();
  const conditions = [
    eq(planGenerationJobs.userId, userId),
    eq(planGenerationJobs.status, "running"),
    sql`coalesce(${planGenerationJobs.leaseExpiresAt}, 0) <= ${now}`,
    gte(planGenerationJobs.runCount, MAX_RUN_ATTEMPTS),
  ];
  if (id) conditions.push(eq(planGenerationJobs.id, id));

  const rows = await db.update(planGenerationJobs)
    .set({
      status: "failed",
      requestJson: null,
      errorCode: "generation_interrupted",
      errorRetryable: true,
      completedAt: now,
      updatedAt: now,
      durationMs: sql`greatest(0, ${now} - coalesce(${planGenerationJobs.startedAt}, ${planGenerationJobs.createdAt}))`,
      leaseOwner: null,
      leaseExpiresAt: null,
    })
    .where(and(...conditions))
    .returning({ id: planGenerationJobs.id, durationMs: planGenerationJobs.durationMs });

  for (const row of rows) {
    logJobEvent("recovery_exhausted", {
      jobId: row.id,
      status: "failed",
      durationMs: row.durationMs ?? 0,
    });
  }
}

export async function createOrReuseGenerationJob(
  userId: string,
  input: RawGenerationRequest,
): Promise<CreateGenerationJobResult> {
  await recoverExhaustedJobs(userId);
  const inputHash = hashInput(input);
  const now = Date.now();

  async function findActive(): Promise<GenerationJobRow | undefined> {
    const [row] = await db.select().from(planGenerationJobs)
      .where(and(eq(planGenerationJobs.userId, userId), inArray(planGenerationJobs.status, ["queued", "running"])))
      .orderBy(desc(planGenerationJobs.createdAt))
      .limit(1);
    return row as GenerationJobRow | undefined;
  }

  let selected: { row: GenerationJobRow; reused: boolean };
  try {
    selected = await db.transaction(async (tx): Promise<{ row: GenerationJobRow; reused: boolean }> => {
      const [active] = await tx.select().from(planGenerationJobs)
        .where(and(eq(planGenerationJobs.userId, userId), inArray(planGenerationJobs.status, ["queued", "running"])))
        .orderBy(desc(planGenerationJobs.createdAt))
        .limit(1);
      if (active) return { row: active as GenerationJobRow, reused: true };

      const [reusableTerminal] = await tx.select().from(planGenerationJobs)
        .where(and(
          eq(planGenerationJobs.userId, userId),
          eq(planGenerationJobs.inputHash, inputHash),
          isNull(planGenerationJobs.consumedAt),
          inArray(planGenerationJobs.status, ["succeeded", "requires_review"]),
        ))
        .orderBy(desc(planGenerationJobs.createdAt))
        .limit(1);
      if (reusableTerminal) return { row: reusableTerminal as GenerationJobRow, reused: true };

      // Starting a deliberate replacement makes older terminal jobs no longer
      // "current" while preserving them for authenticated lookup by ID.
      await tx.update(planGenerationJobs)
        .set({ consumedAt: sql`coalesce(${planGenerationJobs.consumedAt}, ${now})`, updatedAt: now })
        .where(and(
          eq(planGenerationJobs.userId, userId),
          isNull(planGenerationJobs.consumedAt),
          notInArray(planGenerationJobs.status, ["queued", "running"]),
        ));

      const id = randomUUID();
      await tx.insert(planGenerationJobs).values({
        id,
        userId,
        inputHash,
        requestJson: input,
        status: "queued",
        phase: "queued",
        attempt: 0,
        runCount: 0,
        timingsJson: [],
        createdAt: now,
        updatedAt: now,
      });

      const [row] = await tx.select().from(planGenerationJobs).where(eq(planGenerationJobs.id, id));
      return { row: row as GenerationJobRow, reused: false };
    });
  } catch (error) {
    // A second local Next instance may have inserted after our first read. The
    // partial unique index is the authority; return its active job on collision.
    const active = await findActive();
    if (!active) throw error;
    selected = { row: active, reused: true };
  }

  logJobEvent(selected.reused ? "reused" : "created", {
    jobId: selected.row.id,
    status: selected.row.status,
    phase: selected.row.phase,
    attempt: selected.row.attempt,
  });

  return {
    job: toPublicJob(selected.row),
    reused: selected.reused,
    shouldSchedule: shouldSchedule(selected.row),
  };
}

export async function getCurrentGenerationJob(userId: string): Promise<GenerationJobLookup> {
  await recoverExhaustedJobs(userId);
  const row = await getCurrentRow(userId);
  return {
    job: row ? toPublicJob(row) : null,
    shouldSchedule: row ? shouldSchedule(row) : false,
  };
}

export async function getGenerationJob(userId: string, id: string): Promise<GenerationJobLookup> {
  await recoverExhaustedJobs(userId, id);
  const row = await getRowForUser(id, userId);
  return {
    job: row ? toPublicJob(row) : null,
    shouldSchedule: row ? shouldSchedule(row) : false,
  };
}

export async function consumeGenerationJob(
  userId: string,
  id: string,
): Promise<ConsumeGenerationJobResult> {
  await recoverExhaustedJobs(userId, id);
  const row = await getRowForUser(id, userId);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status === "queued" || row.status === "running") {
    return { ok: false, reason: "not_terminal" };
  }

  const now = Date.now();
  await db.update(planGenerationJobs)
    .set({ consumedAt: sql`coalesce(${planGenerationJobs.consumedAt}, ${now})`, updatedAt: now })
    .where(and(eq(planGenerationJobs.id, id), eq(planGenerationJobs.userId, userId)));

  const consumed = (await getRowForUser(id, userId))!;
  logJobEvent("consumed", {
    jobId: consumed.id,
    status: consumed.status,
    durationMs: consumed.durationMs ?? 0,
  });
  return { ok: true, job: toPublicJob(consumed) };
}

async function claimGenerationJob(id: string, leaseOwner: string): Promise<GenerationJobRow | null> {
  const now = Date.now();
  const [row] = await db.update(planGenerationJobs)
    .set({
      status: "running",
      phase: "preparing",
      attempt: 0,
      runCount: sql`${planGenerationJobs.runCount} + 1`,
      leaseOwner,
      leaseExpiresAt: now + LEASE_DURATION_MS,
      startedAt: sql`coalesce(${planGenerationJobs.startedAt}, ${now})`,
      phaseStartedAt: now,
      updatedAt: now,
    })
    .where(and(
      eq(planGenerationJobs.id, id),
      lt(planGenerationJobs.runCount, MAX_RUN_ATTEMPTS),
      or(
        eq(planGenerationJobs.status, "queued"),
        and(
          eq(planGenerationJobs.status, "running"),
          sql`coalesce(${planGenerationJobs.leaseExpiresAt}, 0) <= ${now}`,
        ),
      ),
    ))
    .returning();
  return (row as GenerationJobRow | undefined) ?? null;
}

async function updateProgress(
  id: string,
  leaseOwner: string,
  progress: AssembleAndGenerateProgress,
  timings: TimingEntry[],
  now: number,
): Promise<void> {
  const rows = await db.update(planGenerationJobs)
    .set({
      phase: progress.phase,
      attempt: progress.attempt,
      phaseStartedAt: now,
      timingsJson: timings,
      leaseExpiresAt: now + LEASE_DURATION_MS,
      updatedAt: now,
    })
    .where(and(
      eq(planGenerationJobs.id, id),
      eq(planGenerationJobs.status, "running"),
      eq(planGenerationJobs.leaseOwner, leaseOwner),
    ))
    .returning({ id: planGenerationJobs.id });
  if (rows.length !== 1) throw new LostGenerationJobLeaseError();
}

/** Reserve the call before contacting OpenRouter. Persisting this counter keeps
 * crash/lease recovery from resetting the two-call budget for the same job. */
async function reserveUpstreamCall(id: string, leaseOwner: string): Promise<boolean> {
  const now = Date.now();
  const rows = await db.update(planGenerationJobs)
    .set({
      upstreamCalls: sql`${planGenerationJobs.upstreamCalls} + 1`,
      leaseExpiresAt: now + LEASE_DURATION_MS,
      updatedAt: now,
    })
    .where(and(
      eq(planGenerationJobs.id, id),
      eq(planGenerationJobs.status, "running"),
      eq(planGenerationJobs.leaseOwner, leaseOwner),
      lt(planGenerationJobs.upstreamCalls, MAX_UPSTREAM_CALLS),
    ))
    .returning({ id: planGenerationJobs.id });
  return rows.length === 1;
}

function classifyJobError(error: unknown): { code: string; retryable: boolean } {
  if (error instanceof GenerationTimeoutError) {
    return { code: "generation_timeout", retryable: true };
  }
  if (error instanceof GenerationValidationError) {
    return { code: "generation_invalid", retryable: true };
  }
  if (error instanceof StoredGenerationRequestError) {
    return { code: "generation_request_invalid", retryable: false };
  }
  if (error instanceof GenerationCallBudgetExceededError) {
    return { code: "generation_interrupted", retryable: true };
  }

  const message = error instanceof Error ? error.message : "";
  if (
    message === "openrouter_key_missing"
    || message === "openrouter_model_missing"
    || message === "openrouter_model_must_be_pinned"
  ) {
    return { code: "generation_unavailable", retryable: false };
  }
  if (message.startsWith("wger_")) {
    return { code: "catalog_unavailable", retryable: true };
  }
  const upstreamStatus = /^openrouter_(\d{3})/.exec(message)?.[1];
  if (upstreamStatus) {
    const status = Number(upstreamStatus);
    return {
      code: status === 429 ? "generation_rate_limited" : "generation_upstream_error",
      retryable: status === 404 || status === 408 || status === 429 || status >= 500,
    };
  }
  if (message.startsWith("openrouter_")) {
    return { code: "generation_upstream_error", retryable: true };
  }
  return { code: "generation_failed", retryable: false };
}

async function completeJob(
  row: GenerationJobRow,
  leaseOwner: string,
  status: Extract<PlanGenerationJobStatus, "succeeded" | "requires_review" | "failed">,
  phase: PlanGenerationJobPhase,
  timings: TimingEntry[],
  result: AssembleAndGenerateResult | null,
  error: { code: string; retryable: boolean } | null,
): Promise<boolean> {
  const now = Date.now();
  const durationMs = Math.max(0, now - (row.startedAt ?? now));
  const rows = await db.update(planGenerationJobs)
    .set({
      status,
      phase,
      requestJson: null,
      resultJson: result,
      errorCode: error?.code ?? null,
      errorRetryable: error ? error.retryable : null,
      timingsJson: timings,
      completedAt: now,
      updatedAt: now,
      durationMs,
      leaseOwner: null,
      leaseExpiresAt: null,
    })
    .where(and(
      eq(planGenerationJobs.id, row.id),
      eq(planGenerationJobs.status, "running"),
      eq(planGenerationJobs.leaseOwner, leaseOwner),
    ))
    .returning({ id: planGenerationJobs.id });
  return rows.length === 1;
}

export async function runGenerationJob(id: string): Promise<void> {
  const leaseOwner = randomUUID();
  const row = await claimGenerationJob(id, leaseOwner);
  if (!row) return;

  logJobEvent(row.runCount > 1 ? "lease_recovered" : "claimed", {
    jobId: row.id,
    status: row.status,
    phase: row.phase,
    runAttempt: row.runCount,
  });

  let leaseLost = false;
  const heartbeat = setInterval(() => {
    const now = Date.now();
    db.update(planGenerationJobs)
      .set({ leaseExpiresAt: now + LEASE_DURATION_MS, updatedAt: now })
      .where(and(
        eq(planGenerationJobs.id, row.id),
        eq(planGenerationJobs.status, "running"),
        eq(planGenerationJobs.leaseOwner, leaseOwner),
      ))
      .returning({ id: planGenerationJobs.id })
      .then((rows) => { if (rows.length !== 1) leaseLost = true; })
      .catch(() => { leaseLost = true; });
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();

  const timings = parseTimings(row.timingsJson);
  let currentPhase: Exclude<PlanGenerationJobPhase, "queued" | "completed"> = "preparing";
  let currentAttempt = 0;
  let phaseStartedAt = Date.now();

  const finishCurrentTiming = (now: number): void => {
    const durationMs = Math.max(0, now - phaseStartedAt);
    timings.push({ phase: currentPhase, attempt: currentAttempt, durationMs });
    logJobEvent("phase_timing", {
      jobId: row.id,
      phase: currentPhase,
      attempt: currentAttempt,
      durationMs,
      runAttempt: row.runCount,
    });
  };

  const onProgress = async (progress: AssembleAndGenerateProgress): Promise<void> => {
    if (leaseLost) throw new LostGenerationJobLeaseError();

    if (progress.phase !== "preparing") {
      const diagnostic = progress.upstream;
      if (!diagnostic) {
        if (!(await reserveUpstreamCall(row.id, leaseOwner))) {
          throw new GenerationCallBudgetExceededError();
        }
        logJobEvent("upstream_started", {
          jobId: row.id,
          attempt: progress.attempt,
          callKind: progress.callKind,
          requestedModel: progress.requestedModel,
          runAttempt: row.runCount,
        });
      } else if (diagnostic.outcome === "failed") {
        logJobEvent("upstream_failed", {
          jobId: row.id,
          attempt: progress.attempt,
          callKind: progress.callKind,
          requestedModel: progress.requestedModel,
          durationMs: diagnostic.durationMs,
          errorCode: diagnostic.errorCode ?? "openrouter_failed",
          status: diagnostic.status ?? null,
          retryAfter: diagnostic.retryAfter ?? null,
          requestId: diagnostic.requestId ?? null,
          runAttempt: row.runCount,
        });
      } else {
        logJobEvent("upstream_completed", {
          jobId: row.id,
          attempt: progress.attempt,
          callKind: progress.callKind,
          requestedModel: progress.requestedModel,
          actualModel: diagnostic.actualModel ?? progress.requestedModel,
          provider: diagnostic.provider ?? null,
          durationMs: diagnostic.durationMs,
          promptTokens: diagnostic.promptTokens ?? null,
          completionTokens: diagnostic.completionTokens ?? null,
          reasoningTokens: diagnostic.reasoningTokens ?? null,
          requestId: diagnostic.requestId ?? null,
          runAttempt: row.runCount,
        });
      }
    }

    if (progress.phase === currentPhase && progress.attempt === currentAttempt) return;

    const now = Date.now();
    finishCurrentTiming(now);
    await updateProgress(row.id, leaseOwner, progress, timings, now);
    currentPhase = progress.phase;
    currentAttempt = progress.attempt;
    phaseStartedAt = now;
  };

  try {
    let input: RawGenerationRequest;
    try {
      input = rawGenerationRequestSchema.parse(row.requestJson ?? null);
    } catch {
      throw new StoredGenerationRequestError();
    }

    const result = await assembleAndGenerate(input, { onProgress });
    if (leaseLost) throw new LostGenerationJobLeaseError();
    finishCurrentTiming(Date.now());

    const status = result.ok ? "succeeded" : "requires_review";
    const completed = await completeJob(
      row,
      leaseOwner,
      status,
      "completed",
      timings,
      result,
      null,
    );
    if (!completed) throw new LostGenerationJobLeaseError();

    logJobEvent("completed", {
      jobId: row.id,
      status,
      phase: "completed",
      attempt: currentAttempt,
      runAttempt: row.runCount,
      durationMs: Math.max(0, Date.now() - (row.startedAt ?? Date.now())),
    });
  } catch (error) {
    if (error instanceof LostGenerationJobLeaseError || leaseLost) {
      logJobEvent("lease_lost", {
        jobId: row.id,
        phase: currentPhase,
        attempt: currentAttempt,
        runAttempt: row.runCount,
      });
      return;
    }

    finishCurrentTiming(Date.now());
    const classified = classifyJobError(error);
    const completed = await completeJob(
      row,
      leaseOwner,
      "failed",
      currentPhase,
      timings,
      null,
      classified,
    );
    if (!completed) {
      logJobEvent("lease_lost", {
        jobId: row.id,
        phase: currentPhase,
        attempt: currentAttempt,
        runAttempt: row.runCount,
      });
      return;
    }

    logJobEvent("failed", {
      jobId: row.id,
      status: "failed",
      phase: currentPhase,
      attempt: currentAttempt,
      runAttempt: row.runCount,
      errorCode: classified.code,
      retryable: classified.retryable,
      durationMs: Math.max(0, Date.now() - (row.startedAt ?? Date.now())),
    });
  } finally {
    clearInterval(heartbeat);
  }
}
