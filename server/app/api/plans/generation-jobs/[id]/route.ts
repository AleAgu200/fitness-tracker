import { after } from "next/server";

import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { getGenerationJob, runGenerationJob } from "@/lib/generation/jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

function scheduleAfterResponse(jobId: string): void {
  after(async () => {
    try {
      await runGenerationJob(jobId);
    } catch {
      console.error(
        "[plan-generation-job]",
        JSON.stringify({ event: "runner_error", jobId, errorCode: "job_runner_failed" }),
      );
    }
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  const lookup = getGenerationJob(user.id, id);
  // Return the same response for a missing job and a different owner's job.
  if (!lookup.job) {
    return Response.json({ error: "generation_job_not_found" }, { status: 404 });
  }
  if (lookup.shouldSchedule) scheduleAfterResponse(lookup.job.id);
  return Response.json({ job: lookup.job });
}
