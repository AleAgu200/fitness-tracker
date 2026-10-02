import { AdminActionError } from "@/lib/admin";

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function badRequest(error: string, status = 400): Response {
  return Response.json({ error }, { status });
}

export function pageParam(value: string | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** Map a known admin rule violation to a 409; anything else is a real failure. */
export function adminErrorResponse(error: unknown): Response {
  if (error instanceof AdminActionError) {
    return Response.json({ error: error.message }, { status: error.message.endsWith("not_found") ? 404 : 409 });
  }
  throw error;
}
