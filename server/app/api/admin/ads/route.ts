import { getAdSettings, saveAdSettings } from "@/lib/ad-settings";
import { parseAdSettings } from "@/lib/ad-settings-policy";
import { badRequest, readJson } from "@/lib/admin-http";
import { requireSuperAdmin } from "@/lib/api-auth";

export async function GET(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (admin instanceof Response) return admin;
  return Response.json(await getAdSettings());
}

export async function PUT(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (admin instanceof Response) return admin;
  const parsed = parseAdSettings(await readJson(request));
  if (!parsed.ok) return badRequest(parsed.error);
  const updatedAt = await saveAdSettings(admin, parsed.settings);
  return Response.json({ settings: parsed.settings, updatedAt });
}
