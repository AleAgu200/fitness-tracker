import { auth } from "./auth";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

/** Resolve the Better Auth session from a route handler request; null when unauthenticated */
export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  const u = session.user as { id: string; name: string; email: string; role?: string };
  return { id: u.id, name: u.name, email: u.email, role: u.role ?? "athlete" };
}

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export function forbidden(): Response {
  return Response.json({ error: "forbidden" }, { status: 403 });
}
