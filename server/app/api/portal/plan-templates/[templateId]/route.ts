import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { getProfessionalOrganizations } from "@/lib/permissions";
import { archiveTemplate, parseDiscipline } from "@/lib/plans";

/** DELETE — archive a template. Plans already published from it are untouched. */
export async function DELETE(request: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  const { templateId } = await params;

  const discipline = parseDiscipline(new URL(request.url).searchParams.get("discipline"));
  if (!discipline) return Response.json({ error: "invalid_discipline" }, { status: 400 });

  const organizations = await getProfessionalOrganizations(user.id, discipline);
  for (const actor of organizations) {
    if (await archiveTemplate(actor, templateId)) return Response.json({ ok: true });
  }
  return Response.json({ error: "template_not_found" }, { status: 404 });
}
