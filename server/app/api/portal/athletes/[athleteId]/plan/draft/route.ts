import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { PlanPayloadError } from "@/lib/plan-payload";
import { discardDraft, openDraft, parseDiscipline, requirePlanAccess, saveDraft } from "@/lib/plans";

async function resolve(request: Request, athleteId: string) {
  const user = await getSessionUser(request);
  if (!user) return { error: unauthorized() } as const;
  const discipline = parseDiscipline(new URL(request.url).searchParams.get("discipline"));
  if (!discipline) return { error: Response.json({ error: "invalid_discipline" }, { status: 400 }) } as const;
  const access = await requirePlanAccess(user.id, athleteId, discipline);
  if (!access) return { error: Response.json({ error: "plan_access_denied" }, { status: 403 }) } as const;
  return { user, access } as const;
}

/** GET — open (or reopen) the draft for this athlete + discipline. */
export async function GET(request: Request, { params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = await params;
  const resolved = await resolve(request, athleteId);
  if ("error" in resolved) return resolved.error;
  return Response.json({ draft: await openDraft(resolved.access, athleteId) });
}

/** PATCH — autosave the draft. Payload is normalized here, never at publish time. */
export async function PATCH(request: Request, { params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = await params;
  const resolved = await resolve(request, athleteId);
  if ("error" in resolved) return resolved.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const draft = await saveDraft(resolved.access, athleteId, {
      ...(body.payload !== undefined ? { payload: body.payload } : {}),
      ...(body.name !== undefined ? { name: typeof body.name === "string" ? body.name.trim().slice(0, 120) : null } : {}),
      ...(body.effectiveAt !== undefined ? { effectiveAt: typeof body.effectiveAt === "number" ? body.effectiveAt : null } : {}),
      ...(body.endsAt !== undefined ? { endsAt: typeof body.endsAt === "number" ? body.endsAt : null } : {}),
    });
    if (!draft) return Response.json({ error: "draft_not_found" }, { status: 404 });
    return Response.json({ draft });
  } catch (error) {
    if (error instanceof PlanPayloadError) return Response.json({ error: error.code }, { status: 400 });
    throw error;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = await params;
  const resolved = await resolve(request, athleteId);
  if ("error" in resolved) return resolved.error;
  const discarded = await discardDraft(resolved.access, athleteId);
  if (!discarded) return Response.json({ error: "draft_not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
