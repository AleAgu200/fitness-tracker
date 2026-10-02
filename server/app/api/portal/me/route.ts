import { getSessionUser, unauthorized } from "@/lib/api-auth";

/** Who the portal is talking to: decides the admin nav and the review screens. */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  return Response.json({
    isSuperAdmin: user.isSuperAdmin,
    role: user.role,
    storedRole: user.storedRole,
    professionalStatus: user.professionalStatus,
  });
}
