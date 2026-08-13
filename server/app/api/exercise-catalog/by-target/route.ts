import { unauthorized, getSessionUser } from "@/lib/api-auth";
import { listByTarget } from "@/lib/exercise-catalog";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const targets = (url.searchParams.get("targets") ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  const limit = Math.min(10, Math.max(1, Number(url.searchParams.get("limit")) || 5));

  if (!targets.length) return Response.json({ exercises: [] });
  return Response.json({ exercises: listByTarget(targets, limit) });
}
