import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { acceptInvite } from "@/lib/supervision";

/** Athlete redeems an invite code to link with a professional */
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "athlete") {
    return Response.json({ error: "only_athletes_can_accept" }, { status: 403 });
  }

  let code: unknown;
  try {
    ({ code } = await request.json());
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  if (typeof code !== "string" || code.trim().length < 4) {
    return Response.json({ error: "invalid_code" }, { status: 400 });
  }

  const result = acceptInvite(user.id, code);
  if (!result.ok) {
    const status = result.error === "already_linked" ? 409 : 400;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json({ kind: result.kind, professionalName: result.professionalName });
}
