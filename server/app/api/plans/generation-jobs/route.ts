import { after } from "next/server";

import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { rawGenerationRequestSchema } from "@/lib/generation/assemble";
import {
  createOrReuseGenerationJob,
  getCurrentGenerationJob,
  runGenerationJob,
} from "@/lib/generation/jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

function scheduleAfterResponse(jobId: string): void {
  after(async () => {
    try {
      await runGenerationJob(jobId);
    } catch {
      // The persisted lease makes the job recoverable on a later poll. Keep the
      // log free of request data and raw exception/provider messages.
      console.error(
        "[plan-generation-job]",
        JSON.stringify({ event: "runner_error", jobId, errorCode: "job_runner_failed" }),
      );
    }
  });
}

/** Return the authenticated user's latest unconsumed generation job. */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  const lookup = await getCurrentGenerationJob(user.id);
  if (lookup.job && lookup.shouldSchedule) {
    scheduleAfterResponse(lookup.job.id);
  }
  return Response.json({ job: lookup.job });
}

/** Validate, persist, and asynchronously start an onboarding plan generation. */
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsedInput = rawGenerationRequestSchema.safeParse(body);
  if (!parsedInput.success) {
    return Response.json(
      {
        error: "invalid_input",
        issues: parsedInput.error.issues.map(
          (issue) => `${issue.path.join(".")}: ${issue.message}`,
        ),
      },
      { status: 400 },
    );
  }

  try {
    const created = await createOrReuseGenerationJob(user.id, parsedInput.data);
    if (created.shouldSchedule) scheduleAfterResponse(created.job.id);
    return Response.json(
      { job: created.job, reused: created.reused },
      { status: 202 },
    );
  } catch {
    console.error(
      "[plan-generation-job]",
      JSON.stringify({ event: "create_error", errorCode: "job_create_failed" }),
    );
    return Response.json({ error: "generation_job_unavailable" }, { status: 500 });
  }
}
