import { forbidden, getSessionUser, unauthorized } from "@/lib/api-auth";
import { createInvite, roleToKind } from "@/lib/supervision";

/** Professional (coach/nutritionist) generates an invite code for an athlete */
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  const kind = roleToKind(user.role);
  if (!kind) return forbidden();

  const code = createInvite(user.id, kind);
  return Response.json({ code, kind });
}
