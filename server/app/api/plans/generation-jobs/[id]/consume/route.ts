import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { consumeGenerationJob } from "@/lib/generation/jobs";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  const consumed = consumeGenerationJob(user.id, id);
  if (!consumed.ok) {
    if (consumed.reason === "not_found") {
      return Response.json({ error: "generation_job_not_found" }, { status: 404 });
    }
    return Response.json({ error: "generation_job_not_terminal" }, { status: 409 });
  }
  return Response.json({ ok: true });
}
