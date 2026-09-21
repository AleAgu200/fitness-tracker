import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { getProfessionalOrganizations } from "@/lib/permissions";
import { PlanPayloadError, normalizePlanPayload } from "@/lib/plan-payload";
import { createTemplate, listTemplates, parseDiscipline } from "@/lib/plans";

/** GET ?discipline= — the organization's reusable plan templates. */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  const discipline = parseDiscipline(new URL(request.url).searchParams.get("discipline"));
  if (!discipline) return Response.json({ error: "invalid_discipline" }, { status: 400 });

  const organizations = await getProfessionalOrganizations(user.id, discipline);
  if (!organizations.length) return Response.json({ templates: [] });

  const templates = (await Promise.all(
    organizations.map(actor => listTemplates(actor.organizationId, discipline)),
  )).flat();
  return Response.json({ templates });
}

/** POST { name, payload } — create a template owned by the organization. */
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  const discipline = parseDiscipline(new URL(request.url).searchParams.get("discipline"));
  if (!discipline) return Response.json({ error: "invalid_discipline" }, { status: 400 });

  let body: { name?: unknown; payload?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) return Response.json({ error: "invalid_name" }, { status: 400 });

  const [actor] = await getProfessionalOrganizations(user.id, discipline);
  if (!actor) return Response.json({ error: "no_organization" }, { status: 403 });

  try {
    const template = await createTemplate(actor, name, normalizePlanPayload(discipline, body.payload));
    return Response.json({ template });
  } catch (error) {
    if (error instanceof PlanPayloadError) return Response.json({ error: error.code }, { status: 400 });
    throw error;
  }
}
