import { unauthorized, getSessionUser } from "@/lib/api-auth";
import { searchCatalog } from "@/lib/exercise-catalog";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  const q = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ exercises: searchCatalog(q) });
}
