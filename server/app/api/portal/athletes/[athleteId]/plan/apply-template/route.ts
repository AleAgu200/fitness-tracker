import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { applyTemplateToDraft, parseDiscipline, requirePlanAccess, saveDraftAsTemplate } from "@/lib/plans";

/**
 * POST { templateId } — copy a template into this athlete's draft.
 * POST { saveAs }     — save the current draft back out as a new org template.
 */
export async function POST(request: Request, { params }: { params: Promise<{ athleteId: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  const { athleteId } = await params;

  const discipline = parseDiscipline(new URL(request.url).searchParams.get("discipline"));
  if (!discipline) return Response.json({ error: "invalid_discipline" }, { status: 400 });
  const access = await requirePlanAccess(user.id, athleteId, discipline);
  if (!access) return Response.json({ error: "plan_access_denied" }, { status: 403 });

  let body: { templateId?: unknown; saveAs?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  if (typeof body.saveAs === "string") {
    const name = body.saveAs.trim().slice(0, 120);
    if (!name) return Response.json({ error: "invalid_name" }, { status: 400 });
    const template = await saveDraftAsTemplate(access, athleteId, name);
    if (!template) return Response.json({ error: "draft_not_found" }, { status: 404 });
    return Response.json({ template });
  }

  if (typeof body.templateId !== "string") {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const draft = await applyTemplateToDraft(access, athleteId, body.templateId);
  if (!draft) return Response.json({ error: "template_not_found" }, { status: 404 });
  return Response.json({ draft });
}
