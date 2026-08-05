import {
  CALORIE_TOLERANCE,
  DAYS_PER_MEAL_WEEK,
  PROTEIN_TOLERANCE,
  type EligibleExercise,
  type EligibleFood,
  type ExerciseSlot,
  type GenerationInput,
  type ModelOutput,
  type WorkoutDay,
} from "./schema";

// Deterministic repair of model output. Everything here used to be a validation
// *issue* fed back to the model as a correction; each round trip costs a call
// from a two-call budget and the model would usually fail the same way twice.
// Anything the server can decide on its own is decided here instead, so a
// correction call is only ever spent on something that genuinely needs the model
// (too few workout days, too few meals, a meal with no resolvable food).

/** Which weekdays a program of N sessions lands on (1 = Monday). Spread to keep
 *  at least one rest day between blocks wherever the count allows. */
const WEEKDAY_SPREAD: Record<number, readonly number[]> = {
  1: [1],
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 5, 6],
  6: [1, 2, 3, 4, 5, 6],
  7: [1, 2, 3, 4, 5, 6, 7],
};

const FIRST_MEAL_MINUTES = 7 * 60;
const LAST_MEAL_MINUTES = 21 * 60;

/** Grams are only ever proposed in 5 g steps: finer precision is noise a user
 *  cannot act on with a kitchen scale, and it keeps the fitter's search small. */
const GRAM_STEP = 5;
const MIN_GRAMS = 5;
const MAX_GRAMS = 600;

/** Protein counts as "dominant" when it supplies at least this share of a food's
 *  calories. The fitter scales protein-dominant and other foods on separate
 *  knobs, which is what lets it hit a calorie *and* a protein target at once. */
const PROTEIN_DOMINANT_SHARE = 0.4;
const KCAL_PER_PROTEIN_GRAM = 4;

const MIN_SCALE = 0.3;
const MAX_SCALE = 3;

/** Stop descending once comfortably inside tolerance rather than at the exact
 *  optimum — the remaining error is far below what the catalog's own per-100 g
 *  figures are accurate to. */
const TOLERANCE_SAFETY = 0.8;
const MAX_DESCENT_STEPS = 400;

export interface ResolvedMealItem {
  food: EligibleFood;
  grams: number;
}

export interface ResolvedMeal {
  label: string;
  time: string;
  items: ResolvedMealItem[];
}

export interface ResolvedMealDay {
  weekday: number;
  meals: ResolvedMeal[];
}

export interface RepairedPlan {
  days: WorkoutDay[];
  week: ResolvedMealDay[];
}

export type RepairResult =
  | { ok: true; plan: RepairedPlan }
  | { ok: false; issues: string[] };

function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Meal times are the server's call, not the model's: it was returning times an
 *  hour off from the ones the user explicitly picked during onboarding. */
export function assignMealTimes(count: number, preferred: string[] | undefined): string[] {
  const usable = (preferred ?? []).slice(0, count);
  if (usable.length === count) return usable;

  const spread: string[] = [];
  for (let i = 0; i < count; i++) {
    const time = usable[i];
    if (time) {
      spread.push(time);
      continue;
    }
    const offset = count === 1
      ? 0
      : ((LAST_MEAL_MINUTES - FIRST_MEAL_MINUTES) * i) / (count - 1);
    // Round to the nearest quarter hour so generated times read as intentional.
    spread.push(minutesToTime(Math.round((FIRST_MEAL_MINUTES + offset) / 15) * 15));
  }
  return spread;
}

function resolveExercise(
  ref: number,
  catalog: EligibleExercise[],
  usedInDay: Set<string>,
): EligibleExercise | null {
  const direct = catalog[ref - 1];
  if (direct && !usedInDay.has(direct.id)) return direct;
  // An out-of-range or repeated ref is substituted with the nearest unused
  // entry of the same muscle group, then any unused entry at all. Dropping the
  // slot instead would silently shorten the session.
  const preferredGroup = direct?.muscleGroup;
  return (
    catalog.find((e) => e.muscleGroup === preferredGroup && !usedInDay.has(e.id))
    ?? catalog.find((e) => !usedInDay.has(e.id))
    ?? null
  );
}

function repairWorkout(
  days: ModelOutput["workout"]["days"],
  catalog: EligibleExercise[],
  daysPerWeek: number,
): { ok: true; days: WorkoutDay[] } | { ok: false; issues: string[] } {
  if (days.length < daysPerWeek) {
    return {
      ok: false,
      issues: [
        `workout.days debe tener exactamente ${daysPerWeek} días (profile.daysPerWeek), tiene ${days.length}. Agrega los días faltantes.`,
      ],
    };
  }

  // Extra days are trimmed rather than bounced back to the model: the first
  // daysPerWeek days are a complete, coherent program on their own.
  const weekdays = WEEKDAY_SPREAD[daysPerWeek] ?? WEEKDAY_SPREAD[7];
  const repaired: WorkoutDay[] = [];

  for (const [index, day] of days.slice(0, daysPerWeek).entries()) {
    const usedInDay = new Set<string>();
    const exercises: ExerciseSlot[] = [];

    for (const slot of day.exercises) {
      const exercise = resolveExercise(slot.exerciseRef, catalog, usedInDay);
      if (!exercise) continue; // catalog exhausted — the day keeps what it has
      usedInDay.add(exercise.id);
      exercises.push({
        exerciseId: exercise.id,
        sets: slot.sets,
        // A model that inverts a range means the range, not the order.
        repsMin: Math.min(slot.repsMin, slot.repsMax),
        repsMax: Math.max(slot.repsMin, slot.repsMax),
        rirMin: Math.min(slot.rirMin, slot.rirMax),
        rirMax: Math.max(slot.rirMin, slot.rirMax),
        restSeconds: slot.restSeconds,
        progressionIncrementKg: slot.progressionIncrementKg,
      });
    }

    if (exercises.length === 0) {
      return {
        ok: false,
        issues: [`workout.days.${index} se quedó sin ejercicios válidos del catálogo`],
      };
    }

    repaired.push({
      weekday: weekdays[index]!,
      order: index + 1,
      name: day.name,
      exercises,
    });
  }

  return { ok: true, days: repaired };
}

function isProteinDominant(food: EligibleFood): boolean {
  if (food.kcal <= 0) return false;
  return (food.proteinG * KCAL_PER_PROTEIN_GRAM) / food.kcal >= PROTEIN_DOMINANT_SHARE;
}

function snapGrams(grams: number): number {
  const stepped = Math.round(grams / GRAM_STEP) * GRAM_STEP;
  return Math.max(MIN_GRAMS, Math.min(MAX_GRAMS, stepped));
}

interface Totals {
  kcal: number;
  protein: number;
}

function totalsFor(items: ResolvedMealItem[]): Totals {
  return items.reduce<Totals>(
    (acc, item) => ({
      kcal: acc.kcal + (item.food.kcal * item.grams) / 100,
      protein: acc.protein + (item.food.proteinG * item.grams) / 100,
    }),
    { kcal: 0, protein: 0 },
  );
}

interface Cost {
  kcal: number;
  protein: number;
}

/** Squared error per objective, in units of that objective's own tolerance and
 *  clamped to zero once inside it. */
function toleranceCost(totals: Totals, target: Totals): Cost {
  const excess = (actual: number, wanted: number, tolerance: number): number => {
    const over = Math.max(0, Math.abs(actual - wanted) / (wanted * tolerance * TOLERANCE_SAFETY) - 1);
    return over * over;
  };
  return {
    kcal: excess(totals.kcal, target.kcal, CALORIE_TOLERANCE),
    protein: excess(totals.protein, target.protein, PROTEIN_TOLERANCE),
  };
}

/** Calories first, protein second — strictly, not as a weighted sum.
 *
 *  A weighted sum lets an objective the catalog cannot reach dominate one it
 *  can: given only rice and apples against a 150 g protein target, the protein
 *  term stays enormous no matter what, so every calorie-improving move looks
 *  like a regression and the descent stalls with calories 8% out. Ranking
 *  lexicographically instead means an unreachable protein target simply stops
 *  competing. Because the cost is zero across the whole tolerance band rather
 *  than at a single point, protein is still optimised freely once calories are
 *  in band — the ordering only bites when the two genuinely conflict. */
function isBetter(candidate: Cost, incumbent: Cost): boolean {
  if (candidate.kcal !== incumbent.kcal) return candidate.kcal < incumbent.kcal;
  return candidate.protein < incumbent.protein;
}

function clampScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

/** Rescale the model's proposed grams to hit the calorie and protein targets.
 *
 *  Two stages. First a closed-form solve for a pair of multipliers — one for
 *  protein-dominant foods, one for everything else — which is exactly enough
 *  freedom to satisfy two simultaneous targets while preserving the relative
 *  portions the model chose. Then coordinate descent in 5 g steps to absorb the
 *  rounding and the per-item gram clamps.
 *
 *  This replaces asking the model to land within ±5% of a calorie target by
 *  arithmetic, which it cannot do. */
export function fitMacros(items: ResolvedMealItem[], target: Totals): ResolvedMealItem[] {
  if (items.length === 0) return items;

  const proteinGroup = items.filter((item) => isProteinDominant(item.food));
  const otherGroup = items.filter((item) => !isProteinDominant(item.food));

  const p = totalsFor(proteinGroup);
  const o = totalsFor(otherGroup);

  let proteinScale = 1;
  let otherScale = 1;

  const determinant = p.kcal * o.protein - o.kcal * p.protein;
  if (proteinGroup.length > 0 && otherGroup.length > 0 && Math.abs(determinant) > 1e-6) {
    proteinScale = clampScale((target.kcal * o.protein - o.kcal * target.protein) / determinant);
    otherScale = clampScale((p.kcal * target.protein - target.kcal * p.protein) / determinant);
  } else {
    // One group only (or a degenerate system): a single multiplier can satisfy
    // calories, and the descent below does what it can for protein.
    const singleScale = clampScale(target.kcal / (p.kcal + o.kcal));
    proteinScale = singleScale;
    otherScale = singleScale;
  }

  const fitted = items.map((item) => ({
    food: item.food,
    grams: snapGrams(item.grams * (isProteinDominant(item.food) ? proteinScale : otherScale)),
  }));

  const inBounds = (index: number, delta: number): boolean => {
    const grams = fitted[index]!.grams + delta;
    return grams >= MIN_GRAMS && grams <= MAX_GRAMS;
  };

  let totals = totalsFor(fitted);
  for (let step = 0; step < MAX_DESCENT_STEPS; step++) {
    const best: { cost: Cost; move: [number, number][] | null } = {
      cost: toleranceCost(totals, target),
      move: null,
    };
    if (best.cost.kcal === 0 && best.cost.protein === 0) break; // both in tolerance

    const consider = (moves: [number, number][]): void => {
      let kcal = totals.kcal;
      let protein = totals.protein;
      for (const [index, delta] of moves) {
        const { food } = fitted[index]!;
        kcal += (food.kcal * delta) / 100;
        protein += (food.proteinG * delta) / 100;
      }
      const cost = toleranceCost({ kcal, protein }, target);
      if (isBetter(cost, best.cost)) {
        best.cost = cost;
        best.move = moves;
      }
    };

    for (let i = 0; i < fitted.length; i++) {
      for (const delta of [GRAM_STEP, -GRAM_STEP]) {
        if (!inBounds(i, delta)) continue;
        consider([[i, delta]]);
        // Exchange grams between two foods. Single-coordinate moves stall
        // whenever calories sit at the edge of their band and the only way to
        // fix protein is to trade a starch for a protein source: each half of
        // that trade looks like a regression on its own.
        for (let j = 0; j < fitted.length; j++) {
          if (j !== i && inBounds(j, -delta)) consider([[i, delta], [j, -delta]]);
        }
      }
    }

    if (!best.move) break; // local optimum, or the targets are out of reach
    for (const [index, delta] of best.move) {
      fitted[index] = { food: fitted[index]!.food, grams: fitted[index]!.grams + delta };
    }
    totals = totalsFor(fitted);
  }

  return fitted;
}

/** Which option a given meal slot uses on a given day.
 *
 *  Two properties have to hold at once, and the obvious formulas give up one or
 *  the other:
 *
 *  - **Days must differ.** `(day + slot) % count` repeats with period `count`,
 *    so with three options Thursday comes out an exact copy of Monday and a
 *    "weekly" plan really holds three days. Any function of the day alone has
 *    that problem, because its period divides `count`.
 *  - **Every slot must rotate.** Reading the day's digits in base `count`
 *    guarantees distinct days, but the high-order digits barely move across
 *    seven days — dinner would be identical all week.
 *
 *  Combining them gives both: the positional digit separates the days, and the
 *  `dayIndex` term keeps every slot cycling through all of its options. Adding
 *  `dayIndex` to all slots equally could in principle collapse two days back
 *  together, so the whole (slots × options) domain is verified exhaustively
 *  rather than argued.
 *
 *  With fewer combinations than days some repetition is unavoidable; this hits
 *  the `optionCount ** slots` ceiling rather than promising seven. */
export function optionIndexFor(dayIndex: number, slotIndex: number, optionCount: number): number {
  if (optionCount <= 1) return 0;

  // How many base-`optionCount` digits it takes to tell seven days apart: 3 for
  // two options, 2 for three. Slots past that reuse a digit — the days are
  // already separated by then, and a slot pinned to a digit that never moves in
  // seven days would serve the same dinner all week.
  const digits = Math.ceil(Math.log(DAYS_PER_MEAL_WEEK) / Math.log(optionCount));
  const digit = Math.floor(dayIndex / optionCount ** (slotIndex % digits)) % optionCount;

  // Slot 0's digit is itself `dayIndex % optionCount`, so a stride of 1 would
  // add up to `2 * dayIndex` and, with two options, pin that slot to a single
  // option forever. An even count needs an even stride to stay coprime.
  const stride = optionCount % 2 === 0 ? 2 : 1;
  return (digit + dayIndex * stride + slotIndex) % optionCount;
}

/** Resolve refs, assign times, and fit grams. Returns issues only for the cases
 *  a server-side repair genuinely cannot cover. */
export function repairModelOutput(input: GenerationInput, output: ModelOutput): RepairResult {
  const workout = repairWorkout(
    output.workout.days,
    input.eligibleExercises,
    input.profile.daysPerWeek,
  );
  if (!workout.ok) return { ok: false, issues: workout.issues };

  if (output.meals.length < input.profile.mealsPerDay) {
    return {
      ok: false,
      issues: [
        `meals debe tener exactamente ${input.profile.mealsPerDay} comidas (profile.mealsPerDay), tiene ${output.meals.length}. Agrega las comidas faltantes.`,
      ],
    };
  }

  const proposedMeals = output.meals.slice(0, input.profile.mealsPerDay);
  const times = assignMealTimes(proposedMeals.length, input.profile.preferredMealTimes);

  const resolveItems = (
    items: { foodRef: number; grams: number }[],
  ): ResolvedMealItem[] => {
    const resolved: ResolvedMealItem[] = [];
    for (const item of items) {
      const food = input.eligibleFoods[item.foodRef - 1];
      // An unresolvable ref is dropped, not bounced back: the gram fitter
      // rebalances what remains onto the targets anyway.
      if (food) resolved.push({ food, grams: item.grams });
    }
    return resolved;
  };

  // Each slot keeps only the options that survived ref resolution. A slot needs
  // at least one; the rotation below repeats what it has when it has fewer than
  // MEAL_OPTIONS_PER_SLOT.
  const slots: { label: string; time: string; options: ResolvedMealItem[][] }[] = [];
  for (const [index, meal] of proposedMeals.entries()) {
    const options = meal.options
      .map((option) => resolveItems(option.items))
      .filter((items) => items.length > 0);
    if (options.length === 0) {
      return {
        ok: false,
        issues: [`meals.${index}.options se quedó sin alimentos válidos del catálogo`],
      };
    }
    slots.push({ label: meal.label, time: times[index]!, options });
  }

  const target = {
    kcal: input.targets.dailyCalories,
    protein: input.targets.proteinGrams,
  };

  const week: ResolvedMealDay[] = [];
  for (let weekday = 1; weekday <= DAYS_PER_MEAL_WEEK; weekday++) {
    const meals: ResolvedMeal[] = slots.map((slot, slotIndex) => ({
      label: slot.label,
      time: slot.time,
      items: slot.options[optionIndexFor(weekday - 1, slotIndex, slot.options.length)]!,
    }));

    // Fit each day independently and across all of its meals at once: the
    // targets are daily, and the fitter needs the whole day to trade grams
    // between items. Options differ in calorie density, so a day built from a
    // different combination needs its own fit.
    const fitted = fitMacros(meals.flatMap((meal) => meal.items), target);

    let cursor = 0;
    for (const meal of meals) {
      const count = meal.items.length;
      meal.items = fitted.slice(cursor, cursor + count);
      cursor += count;
    }

    week.push({ weekday, meals });
  }

  return { ok: true, plan: { days: workout.days, week } };
}
