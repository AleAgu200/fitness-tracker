import { createHash, randomUUID } from "crypto";

import Database from "better-sqlite3";

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

interface GenerationJobRow {
  id: string;
  userId: string;
  inputHash: string;
  requestJson: string | null;
  status: PlanGenerationJobStatus;
  phase: PlanGenerationJobPhase;
  attempt: number;
  runCount: number;
  upstreamCalls: number;
  resultJson: string | null;
  errorCode: string | null;
  errorRetryable: number | null;
  timingsJson: string;
  leaseOwner: string | null;
  leaseExpiresAt: number | null;
  createdAt: number;
  startedAt: number | null;
  phaseStartedAt: number | null;
  completedAt: number | null;
  updatedAt: number;
  durationMs: number | null;
  consumedAt: number | null;
}

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

const db = new Database("./data/auth.db");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS "plan_generation_jobs" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "userId"         TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "inputHash"      TEXT NOT NULL,
    "requestJson"    TEXT,
    "status"         TEXT NOT NULL CHECK ("status" IN ('queued','running','succeeded','requires_review','failed')),
    "phase"          TEXT NOT NULL CHECK ("phase" IN ('queued','preparing','generating','validating','completed')),
    "attempt"        INTEGER NOT NULL DEFAULT 0,
    "runCount"       INTEGER NOT NULL DEFAULT 0,
    "upstreamCalls"  INTEGER NOT NULL DEFAULT 0,
    "resultJson"     TEXT,
    "errorCode"      TEXT,
    "errorRetryable" INTEGER,
    "timingsJson"    TEXT NOT NULL DEFAULT '[]',
    "leaseOwner"     TEXT,
    "leaseExpiresAt" INTEGER,
    "createdAt"      INTEGER NOT NULL,
    "startedAt"      INTEGER,
    "phaseStartedAt" INTEGER,
    "completedAt"    INTEGER,
    "updatedAt"      INTEGER NOT NULL,
    "durationMs"     INTEGER,
    "consumedAt"     INTEGER,
    CHECK ("requestJson" IS NULL OR json_valid("requestJson")),
    CHECK ("resultJson" IS NULL OR json_valid("resultJson")),
    CHECK (json_valid("timingsJson"))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS "plan_generation_jobs_one_active_user"
    ON "plan_generation_jobs" ("userId")
    WHERE "status" IN ('queued','running');

  CREATE INDEX IF NOT EXISTS "plan_generation_jobs_user_current"
    ON "plan_generation_jobs" ("userId", "consumedAt", "createdAt" DESC);

  CREATE INDEX IF NOT EXISTS "plan_generation_jobs_stale_lease"
    ON "plan_generation_jobs" ("status", "leaseExpiresAt");
`);

// CREATE TABLE IF NOT EXISTS does not add columns to existing local databases.
const generationJobColumns = db.prepare(
  `PRAGMA table_info("plan_generation_jobs")`,
).all() as { name: string }[];
if (!generationJobColumns.some((column) => column.name === "upstreamCalls")) {
  db.exec(
    `ALTER TABLE "plan_generation_jobs" ADD COLUMN "upstreamCalls" INTEGER NOT NULL DEFAULT 0`,
  );
}

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

function parseResult(value: string | null): AssembleAndGenerateResult | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as AssembleAndGenerateResult;
  } catch {
    return null;
  }
}

function parseTimings(value: string): TimingEntry[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as TimingEntry[]) : [];
  } catch {
    return [];
  }
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
      ? { code: row.errorCode, retryable: row.errorRetryable === 1 }
      : null,
  };
}

function getRowForUser(id: string, userId: string): GenerationJobRow | null {
  return (db.prepare(`
    SELECT * FROM "plan_generation_jobs"
    WHERE "id" = ? AND "userId" = ?
  `).get(id, userId) as GenerationJobRow | undefined) ?? null;
}

function getCurrentRow(userId: string): GenerationJobRow | null {
  return (db.prepare(`
    SELECT * FROM "plan_generation_jobs"
    WHERE "userId" = ? AND "consumedAt" IS NULL
    ORDER BY
      CASE WHEN "status" IN ('queued','running') THEN 0 ELSE 1 END,
      "createdAt" DESC
    LIMIT 1
  `).get(userId) as GenerationJobRow | undefined) ?? null;
}

function isStale(row: GenerationJobRow, now = Date.now()): boolean {
  return row.status === "running" && (row.leaseExpiresAt ?? 0) <= now;
}

function shouldSchedule(row: GenerationJobRow, now = Date.now()): boolean {
  return row.status === "queued" || isStale(row, now);
}

function recoverExhaustedJobs(userId: string, id?: string): void {
  const now = Date.now();
  const rows = db.prepare(`
    UPDATE "plan_generation_jobs"
    SET "status" = 'failed',
        "requestJson" = NULL,
        "errorCode" = 'generation_interrupted',
        "errorRetryable" = 1,
        "completedAt" = ?,
        "updatedAt" = ?,
        "durationMs" = MAX(0, ? - COALESCE("startedAt", "createdAt")),
        "leaseOwner" = NULL,
        "leaseExpiresAt" = NULL
    WHERE "userId" = ?
      AND (? IS NULL OR "id" = ?)
      AND "status" = 'running'
      AND COALESCE("leaseExpiresAt", 0) <= ?
      AND "runCount" >= ?
    RETURNING "id", "durationMs"
  `).all(now, now, now, userId, id ?? null, id ?? null, now, MAX_RUN_ATTEMPTS) as {
    id: string;
    durationMs: number;
  }[];

  for (const row of rows) {
    logJobEvent("recovery_exhausted", {
      jobId: row.id,
      status: "failed",
      durationMs: row.durationMs,
    });
  }
}

export function createOrReuseGenerationJob(
  userId: string,
  input: RawGenerationRequest,
): CreateGenerationJobResult {
  recoverExhaustedJobs(userId);
  const inputHash = hashInput(input);
  const now = Date.now();

  const transaction = db.transaction((): { row: GenerationJobRow; reused: boolean } => {
    const active = db.prepare(`
      SELECT * FROM "plan_generation_jobs"
      WHERE "userId" = ? AND "status" IN ('queued','running')
      ORDER BY "createdAt" DESC LIMIT 1
    `).get(userId) as GenerationJobRow | undefined;
    if (active) return { row: active, reused: true };

    const reusableTerminal = db.prepare(`
      SELECT * FROM "plan_generation_jobs"
      WHERE "userId" = ?
        AND "inputHash" = ?
        AND "consumedAt" IS NULL
        AND "status" IN ('succeeded','requires_review')
      ORDER BY "createdAt" DESC LIMIT 1
    `).get(userId, inputHash) as GenerationJobRow | undefined;
    if (reusableTerminal) return { row: reusableTerminal, reused: true };

    // Starting a deliberate replacement makes older terminal jobs no longer
    // "current" while preserving them for authenticated lookup by ID.
    db.prepare(`
      UPDATE "plan_generation_jobs"
      SET "consumedAt" = COALESCE("consumedAt", ?), "updatedAt" = ?
      WHERE "userId" = ?
        AND "consumedAt" IS NULL
        AND "status" NOT IN ('queued','running')
    `).run(now, now, userId);

    const id = randomUUID();
    db.prepare(`
      INSERT INTO "plan_generation_jobs" (
        "id", "userId", "inputHash", "requestJson", "status", "phase",
        "attempt", "runCount", "timingsJson", "createdAt", "updatedAt"
      ) VALUES (?, ?, ?, ?, 'queued', 'queued', 0, 0, '[]', ?, ?)
    `).run(id, userId, inputHash, JSON.stringify(input), now, now);

    return {
      row: db.prepare(`SELECT * FROM "plan_generation_jobs" WHERE "id" = ?`)
        .get(id) as GenerationJobRow,
      reused: false,
    };
  });

  let selected: { row: GenerationJobRow; reused: boolean };
  try {
    selected = transaction();
  } catch (error) {
    // A second local Next instance may have inserted after our first read. The
    // partial unique index is the authority; return its active job on collision.
    const active = db.prepare(`
      SELECT * FROM "plan_generation_jobs"
      WHERE "userId" = ? AND "status" IN ('queued','running')
      ORDER BY "createdAt" DESC LIMIT 1
    `).get(userId) as GenerationJobRow | undefined;
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

export function getCurrentGenerationJob(userId: string): GenerationJobLookup {
  recoverExhaustedJobs(userId);
  const row = getCurrentRow(userId);
  return {
    job: row ? toPublicJob(row) : null,
    shouldSchedule: row ? shouldSchedule(row) : false,
  };
}

export function getGenerationJob(userId: string, id: string): GenerationJobLookup {
  recoverExhaustedJobs(userId, id);
  const row = getRowForUser(id, userId);
  return {
    job: row ? toPublicJob(row) : null,
    shouldSchedule: row ? shouldSchedule(row) : false,
  };
}

export function consumeGenerationJob(
  userId: string,
  id: string,
): ConsumeGenerationJobResult {
  recoverExhaustedJobs(userId, id);
  const row = getRowForUser(id, userId);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status === "queued" || row.status === "running") {
    return { ok: false, reason: "not_terminal" };
  }

  const now = Date.now();
  db.prepare(`
    UPDATE "plan_generation_jobs"
    SET "consumedAt" = COALESCE("consumedAt", ?), "updatedAt" = ?
    WHERE "id" = ? AND "userId" = ?
  `).run(now, now, id, userId);

  const consumed = getRowForUser(id, userId)!;
  logJobEvent("consumed", {
    jobId: consumed.id,
    status: consumed.status,
    durationMs: consumed.durationMs ?? 0,
  });
  return { ok: true, job: toPublicJob(consumed) };
}

function claimGenerationJob(id: string, leaseOwner: string): GenerationJobRow | null {
  const now = Date.now();
  return (db.prepare(`
    UPDATE "plan_generation_jobs"
    SET "status" = 'running',
        "phase" = 'preparing',
        "attempt" = 0,
        "runCount" = "runCount" + 1,
        "leaseOwner" = ?,
        "leaseExpiresAt" = ?,
        "startedAt" = COALESCE("startedAt", ?),
        "phaseStartedAt" = ?,
        "updatedAt" = ?
    WHERE "id" = ?
      AND "runCount" < ?
      AND (
        "status" = 'queued'
        OR (
          "status" = 'running'
          AND COALESCE("leaseExpiresAt", 0) <= ?
        )
      )
    RETURNING *
  `).get(
    leaseOwner,
    now + LEASE_DURATION_MS,
    now,
    now,
    now,
    id,
    MAX_RUN_ATTEMPTS,
    now,
  ) as GenerationJobRow | undefined) ?? null;
}

function updateProgress(
  id: string,
  leaseOwner: string,
  progress: AssembleAndGenerateProgress,
  timings: TimingEntry[],
  now: number,
): void {
  const updated = db.prepare(`
    UPDATE "plan_generation_jobs"
    SET "phase" = ?,
        "attempt" = ?,
        "phaseStartedAt" = ?,
        "timingsJson" = ?,
        "leaseExpiresAt" = ?,
        "updatedAt" = ?
    WHERE "id" = ? AND "status" = 'running' AND "leaseOwner" = ?
  `).run(
    progress.phase,
    progress.attempt,
    now,
    JSON.stringify(timings),
    now + LEASE_DURATION_MS,
    now,
    id,
    leaseOwner,
  );
  if (updated.changes !== 1) throw new LostGenerationJobLeaseError();
}

/** Reserve the call before contacting OpenRouter. Persisting this counter keeps
 * crash/lease recovery from resetting the two-call budget for the same job. */
function reserveUpstreamCall(id: string, leaseOwner: string): boolean {
  const now = Date.now();
  const updated = db.prepare(`
    UPDATE "plan_generation_jobs"
    SET "upstreamCalls" = "upstreamCalls" + 1,
        "leaseExpiresAt" = ?,
        "updatedAt" = ?
    WHERE "id" = ?
      AND "status" = 'running'
      AND "leaseOwner" = ?
      AND "upstreamCalls" < ?
  `).run(
    now + LEASE_DURATION_MS,
    now,
    id,
    leaseOwner,
    MAX_UPSTREAM_CALLS,
  );
  return updated.changes === 1;
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

function completeJob(
  row: GenerationJobRow,
  leaseOwner: string,
  status: Extract<PlanGenerationJobStatus, "succeeded" | "requires_review" | "failed">,
  phase: PlanGenerationJobPhase,
  timings: TimingEntry[],
  result: AssembleAndGenerateResult | null,
  error: { code: string; retryable: boolean } | null,
): boolean {
  const now = Date.now();
  const durationMs = Math.max(0, now - (row.startedAt ?? now));
  const updated = db.prepare(`
    UPDATE "plan_generation_jobs"
    SET "status" = ?,
        "phase" = ?,
        "requestJson" = NULL,
        "resultJson" = ?,
        "errorCode" = ?,
        "errorRetryable" = ?,
        "timingsJson" = ?,
        "completedAt" = ?,
        "updatedAt" = ?,
        "durationMs" = ?,
        "leaseOwner" = NULL,
        "leaseExpiresAt" = NULL
    WHERE "id" = ? AND "status" = 'running' AND "leaseOwner" = ?
  `).run(
    status,
    phase,
    result ? JSON.stringify(result) : null,
    error?.code ?? null,
    error ? (error.retryable ? 1 : 0) : null,
    JSON.stringify(timings),
    now,
    now,
    durationMs,
    row.id,
    leaseOwner,
  );
  return updated.changes === 1;
}

export async function runGenerationJob(id: string): Promise<void> {
  const leaseOwner = randomUUID();
  const row = claimGenerationJob(id, leaseOwner);
  if (!row) return;

  logJobEvent(row.runCount > 1 ? "lease_recovered" : "claimed", {
    jobId: row.id,
    status: row.status,
    phase: row.phase,
    runAttempt: row.runCount,
  });

  let leaseLost = false;
  const heartbeat = setInterval(() => {
    try {
      const now = Date.now();
      const updated = db.prepare(`
        UPDATE "plan_generation_jobs"
        SET "leaseExpiresAt" = ?, "updatedAt" = ?
        WHERE "id" = ? AND "status" = 'running' AND "leaseOwner" = ?
      `).run(now + LEASE_DURATION_MS, now, row.id, leaseOwner);
      if (updated.changes !== 1) leaseLost = true;
    } catch {
      leaseLost = true;
    }
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
        if (!reserveUpstreamCall(row.id, leaseOwner)) {
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
    updateProgress(row.id, leaseOwner, progress, timings, now);
    currentPhase = progress.phase;
    currentAttempt = progress.attempt;
    phaseStartedAt = now;
  };

  try {
    let input: RawGenerationRequest;
    try {
      input = rawGenerationRequestSchema.parse(JSON.parse(row.requestJson ?? "null"));
    } catch {
      throw new StoredGenerationRequestError();
    }

    const result = await assembleAndGenerate(input, { onProgress });
    if (leaseLost) throw new LostGenerationJobLeaseError();
    finishCurrentTiming(Date.now());

    const status = result.ok ? "succeeded" : "requires_review";
    const completed = completeJob(
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
    const completed = completeJob(
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
