import { effectiveRole, isSuperAdmin } from "./admin-policy";
import { auth } from "./auth";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  /**
   * Role authorization acts on. A coach or nutritionist still under review
   * (or rejected) is "athlete" here; `professionalStatus` keeps the real state.
   */
  role: string;
  /** Role as stored, for screens that explain a pending review. */
  storedRole: string;
  professionalStatus: string | null;
  isSuperAdmin: boolean;
}

/** Resolve the Better Auth session from a route handler request; null when unauthenticated or suspended */
export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  const u = session.user as {
    id: string; name: string; email: string; emailVerified?: boolean; role?: string;
    isSuperAdmin?: boolean; professionalStatus?: string | null; suspendedAt?: Date | string | null;
  };
  // Sessions are revoked on suspension; this covers one created just before.
  if (u.suspendedAt) return null;
  const storedRole = u.role ?? "athlete";
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: effectiveRole(storedRole, u.professionalStatus),
    storedRole,
    professionalStatus: u.professionalStatus ?? null,
    isSuperAdmin: isSuperAdmin({ isSuperAdmin: u.isSuperAdmin, email: u.email, emailVerified: u.emailVerified }),
  };
}

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export function forbidden(): Response {
  return Response.json({ error: "forbidden" }, { status: 403 });
}

/**
 * The discipline a professional may use for their own profile and settings —
 * including while their account is under review, so they can complete it.
 */
export function profileDiscipline(user: SessionUser): "coach" | "nutritionist" | null {
  if (user.role === "coach" || user.role === "nutritionist") return user.role;
  if (user.professionalStatus === "pending" && (user.storedRole === "coach" || user.storedRole === "nutritionist")) return user.storedRole;
  return null;
}

/** The session user when they are a super admin; otherwise the response to return. */
export async function requireSuperAdmin(request: Request): Promise<SessionUser | Response> {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  if (!user.isSuperAdmin) return forbidden();
  return user;
}
