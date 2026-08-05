import { getSessionUser, unauthorized } from "@/lib/api-auth";
import { listFoods } from "@/lib/library";
import { searchUsdaFoods } from "@/lib/usda";

// Food lookup for the app's meal logger, so an athlete picks a food and a
// weight instead of typing kcal/protein/carbs/fat by hand.
//
// PULSO's own curated catalog always comes first and always answers: it is
// local, in Spanish, and covers the Honduran/Latin staples. USDA is a
// best-effort widening for anything the catalog does not carry — its query and
// result names are translated ES<->EN in usda.ts (dictionary-based, USDA has no
// localized endpoint), but coverage outside common food vocabulary is
// imperfect, which is why it never feeds plan generation.

const MAX_LOCAL = 12;
const MAX_USDA = 8;

interface FoodSearchResult {
  id: string;
  source: "pulso" | "usda";
  name: string;
  /** per 100 g */
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** USDA returns the same food under several fdcIds ("pupusas con frijoles" came
 *  back twice), and it can also restate something the curated catalog already
 *  has. Local entries are added first, so keeping the first occurrence keeps the
 *  Spanish, curated one. */
function dedupe(foods: FoodSearchResult[]): FoodSearchResult[] {
  const seenNames = new Set<string>();
  const seenIds = new Set<string>();
  return foods.filter((food) => {
    const name = normalize(food.name);
    if (seenNames.has(name) || seenIds.has(food.id)) return false;
    seenNames.add(name);
    seenIds.add(food.id);
    return true;
  });
}

/** `listFoods` matches anywhere in the name, so searching "pollo" ranks
 *  "Repollo" alongside "Pechuga de pollo". Word-start matches come first. */
function rankByRelevance(foods: FoodSearchResult[], query: string): FoodSearchResult[] {
  const q = normalize(query);
  const score = (name: string): number => {
    const n = normalize(name);
    if (n === q) return 0;
    if (n.startsWith(q)) return 1;
    if (n.includes(` ${q}`)) return 2;
    return 3;
  };
  return [...foods].sort(
    (a, b) => score(a.name) - score(b.name) || a.name.localeCompare(b.name, "es"),
  );
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return Response.json({ foods: [] });

  const local: FoodSearchResult[] = listFoods(q).map((food) => ({
    id: food.id,
    source: "pulso",
    name: food.name,
    kcal: food.kcal,
    proteinG: food.proteinG,
    carbsG: food.carbsG,
    fatG: food.fatG,
  }));

  // A USDA outage, a missing key, or a spent quota must not break the picker —
  // the curated catalog alone is already a usable answer.
  let usda: FoodSearchResult[] = [];
  try {
    usda = (await searchUsdaFoods(q, MAX_USDA)).map((food) => ({
      id: food.id,
      source: "usda" as const,
      name: food.name,
      kcal: food.kcal,
      proteinG: food.proteinG,
      carbsG: food.carbsG,
      fatG: food.fatG,
    }));
  } catch {
    usda = [];
  }

  const foods = dedupe([
    ...rankByRelevance(local, q).slice(0, MAX_LOCAL),
    ...rankByRelevance(usda, q),
  ]);

  return Response.json({ foods });
}
