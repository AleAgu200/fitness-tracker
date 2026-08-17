import { forbidden, unauthorized, getSessionUser } from "@/lib/api-auth";
import { searchCatalogPage } from "@/lib/exercise-catalog";

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role === "nutritionist") return forbidden();

  const params = new URL(request.url).searchParams;
  const q = params.get("q") ?? "";
  const page = positiveInteger(params.get("page"), 1);
  const pageSize = positiveInteger(params.get("pageSize"), 10);

  return Response.json(searchCatalogPage(q, page, pageSize));
}
