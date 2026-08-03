"use client";

import { useEffect, useState } from "react";

import { api, Athlete, Food } from "./lib";

interface Item {
  foodId: string;
  name: string;
  grams: number;
}

interface MealDraft {
  label: string;
  time: string;
  items: Item[];
}

interface MealPayload {
  label: string;
  time: string;
  n: string;
  kcal: number;
  p: number;
  c: number;
  g: number;
  items?: Item[];
}

interface MealAssignment {
  version: number;
  payload: { nutritionistName: string; meals: MealPayload[] };
  createdAt: number;
}

const inputCls =
  "min-w-0 border border-line bg-elev px-2 py-1.5 text-sm text-fg placeholder:text-fg-ter focus:border-neon focus:outline-none";

/** Macros of a meal, computed from library foods (per 100 g) */
function mealMacros(items: Item[], foodsById: Map<string, Food>) {
  return items.reduce(
    (acc, it) => {
      const f = foodsById.get(it.foodId);
      if (!f) return acc;
      const k = it.grams / 100;
      return {
        kcal: acc.kcal + f.kcal * k,
        p: acc.p + f.proteinG * k,
        c: acc.c + f.carbsG * k,
        g: acc.g + f.fatG * k,
      };
    },
    { kcal: 0, p: 0, c: 0, g: 0 },
  );
}

function AddFoodRow({ foods, onAdd }: { foods: Food[]; onAdd: (item: Item) => void }) {
  const [foodId, setFoodId] = useState("");
  const [grams, setGrams] = useState("100");

  return (
    <div className="mt-2 flex gap-2">
      <select aria-label="Alimento" value={foodId} onChange={e => setFoodId(e.target.value)} className={`flex-1 ${inputCls}`}>
        <option value="">— agregar alimento —</option>
        {foods.map(f => (
          <option key={f.id} value={f.id}>{f.name} · {f.kcal} kcal/100g</option>
        ))}
      </select>
      <input
        aria-label="Gramos"
        type="number"
        min="1"
        value={grams}
        onChange={e => setGrams(e.target.value)}
        className={`w-20 ${inputCls}`}
      />
      <span className="self-center font-mono-app text-[10px] text-fg-ter">g</span>
      <button
        type="button"
        onClick={() => {
          const f = foods.find(x => x.id === foodId);
          const g = Number(grams);
          if (!f || !(g > 0)) return;
          onAdd({ foodId: f.id, name: f.name, grams: Math.round(g) });
          setFoodId("");
        }}
        className="cursor-pointer border border-neon px-3 font-mono-app text-[10px] font-bold text-neon hover:bg-neon hover:text-ink"
      >
        AGREGAR
      </button>
    </div>
  );
}

/** Exposes unsaved-edit state to the parent so it can guard against losing work on athlete switch. */
export function AssignMeals({ athlete, onDirtyChange }: { athlete: Athlete; onDirtyChange?: (dirty: boolean) => void }) {
  const [foods, setFoods] = useState<Food[]>([]);
  const [meals, setMeals] = useState<MealDraft[]>([{ label: "DESAYUNO", time: "07:30", items: [] }]);
  const [baseline, setBaseline] = useState<MealDraft[]>([{ label: "DESAYUNO", time: "07:30", items: [] }]);
  const [current, setCurrent] = useState<MealAssignment | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingOverwrite, setConfirmingOverwrite] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const foodsById = new Map(foods.map(f => [f.id, f]));

  const dirty = JSON.stringify(meals) !== JSON.stringify(baseline);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const lib = await api<{ foods: Food[] }>("/api/library/foods");
        const asg = await api<{ mealPlan: MealAssignment | null }>(`/api/assignments?athleteId=${encodeURIComponent(athlete.userId)}`);
        if (!alive) return;
        setFoods(lib.foods);
        setCurrent(asg.mealPlan);
        const loaded = asg.mealPlan
          ? asg.mealPlan.payload.meals.map(m => ({ label: m.label, time: m.time, items: m.items ?? [] }))
          : [{ label: "DESAYUNO", time: "07:30", items: [] }];
        setMeals(loaded);
        setBaseline(loaded);
        setStatus(null);
        setError(null);
        setConfirmingOverwrite(false);
        setLoadFailed(false);
      } catch {
        if (alive) setLoadFailed(true);
      }
    };
    load();
    return () => { alive = false; };
  }, [athlete.userId]);

  function patchMeal(i: number, patch: Partial<MealDraft>) {
    setMeals(m => m.map((meal, idx) => (idx === i ? { ...meal, ...patch } : meal)));
    setConfirmingOverwrite(false);
  }

  async function assign() {
    const valid = meals.filter(m => m.label.trim() && m.items.length > 0);
    if (valid.length === 0) {
      setError("Cada comida necesita nombre y al menos un alimento antes de asignar");
      return;
    }
    setConfirmingOverwrite(false);
    setBusy(true);
    setError(null);
    try {
      const payloadMeals = valid.map(m => {
        const mac = mealMacros(m.items, foodsById);
        return {
          label: m.label.trim().toUpperCase(),
          time: m.time.trim(),
          n: m.items.map(it => `${it.name} ${it.grams}g`).join(" + "),
          kcal: Math.round(mac.kcal),
          p: Math.round(mac.p),
          c: Math.round(mac.c),
          g: Math.round(mac.g),
          items: m.items,
        };
      });
      const res = await api<{ version: number }>("/api/assignments/meal-plan", {
        method: "POST",
        body: JSON.stringify({ athleteId: athlete.userId, meals: payloadMeals }),
      });
      setStatus(`✓ Dieta v${res.version} asignada — ${athlete.name.split(" ")[0]} la recibe al abrir la app`);
      setCurrent({ version: res.version, payload: { nutritionistName: "", meals: payloadMeals }, createdAt: Date.now() });
      setBaseline(meals);
    } catch {
      setError("No se pudo asignar la dieta — revisá tu conexión e intentá de nuevo");
    } finally {
      setBusy(false);
    }
  }

  function handleAssignClick() {
    if (current) {
      setConfirmingOverwrite(true);
    } else {
      assign();
    }
  }

  const dayTotal = meals.reduce(
    (acc, m) => {
      const mac = mealMacros(m.items, foodsById);
      return { kcal: acc.kcal + mac.kcal, p: acc.p + mac.p, c: acc.c + mac.c, g: acc.g + mac.g };
    },
    { kcal: 0, p: 0, c: 0, g: 0 },
  );

  return (
    <div className="border border-line bg-card">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="font-mono-app text-[10px] tracking-[1.4px] text-fg-ter">PLAN DE COMIDAS ASIGNADO</span>
        <span className="font-mono-app text-[10px] text-fg-sec">
          DÍA: <span className="text-neon">{Math.round(dayTotal.kcal)} kcal</span> · P {Math.round(dayTotal.p)} · C {Math.round(dayTotal.c)} · G {Math.round(dayTotal.g)}
          {current && <span className="ml-3 text-neon">v{current.version}</span>}
        </span>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {loadFailed && (
          <div className="flex items-center justify-between border border-warn/40 bg-warn/10 px-3 py-2 font-mono-app text-[11px] text-warn">
            <span>No se pudo cargar el plan actual — puede que estés viendo datos desactualizados</span>
            <button type="button" onClick={() => setLoadFailed(false)} className="cursor-pointer underline hover:text-fg">
              CERRAR
            </button>
          </div>
        )}

        {meals.map((meal, i) => {
          const mac = mealMacros(meal.items, foodsById);
          return (
            <div key={i} className="border border-line-soft bg-elev p-3">
              <div className="flex gap-2">
                <input
                  aria-label="Nombre de la comida"
                  value={meal.label}
                  onChange={e => patchMeal(i, { label: e.target.value.toUpperCase() })}
                  placeholder="DESAYUNO"
                  className={`flex-1 ${inputCls}`}
                />
                <input
                  aria-label="Hora"
                  value={meal.time}
                  onChange={e => patchMeal(i, { time: e.target.value })}
                  placeholder="07:30"
                  className={`w-24 ${inputCls}`}
                />
                <span className="self-center font-mono-app text-[10px] text-fg-sec">
                  {Math.round(mac.kcal)} kcal · P {Math.round(mac.p)} · C {Math.round(mac.c)} · G {Math.round(mac.g)}
                </span>
                <button
                  type="button"
                  onClick={() => setMeals(m => m.filter((_, idx) => idx !== i))}
                  className="cursor-pointer px-1 text-fg-ter hover:text-danger"
                  aria-label="Quitar comida"
                >
                  ✕
                </button>
              </div>

              {meal.items.map((it, j) => (
                <div key={j} className="mt-1.5 flex items-center gap-2 text-sm">
                  <span className="flex-1 text-fg">{it.name}</span>
                  <span className="font-mono-app text-[11px] text-fg-sec">{it.grams} g</span>
                  <button
                    type="button"
                    onClick={() => patchMeal(i, { items: meal.items.filter((_, idx) => idx !== j) })}
                    className="cursor-pointer text-fg-ter hover:text-danger"
                    aria-label="Quitar alimento"
                  >
                    ✕
                  </button>
                </div>
              ))}

              <AddFoodRow foods={foods} onAdd={item => patchMeal(i, { items: [...meal.items, item] })} />
            </div>
          );
        })}

        {confirmingOverwrite && current && (
          <div className="flex items-center justify-between border border-warn/40 bg-warn/10 px-3 py-2 font-mono-app text-[11px] text-warn">
            <span>Reemplazás la dieta v{current.version} ({current.payload.meals.length} comidas) — ¿confirmar?</span>
            <div className="flex gap-3">
              <button type="button" onClick={() => setConfirmingOverwrite(false)} className="cursor-pointer text-fg-sec hover:text-fg">
                CANCELAR
              </button>
              <button type="button" onClick={assign} className="cursor-pointer font-bold text-warn hover:text-fg">
                SÍ, REEMPLAZAR →
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMeals(m => [...m, { label: "", time: "", items: [] }])}
            className="cursor-pointer border border-dashed border-line px-4 py-2 font-mono-app text-[10px] tracking-[1px] text-fg-sec hover:text-fg"
          >
            + COMIDA
          </button>
          <button
            type="button"
            onClick={handleAssignClick}
            disabled={busy}
            className="cursor-pointer bg-neon px-5 py-2 font-mono-app text-[11px] font-extrabold tracking-[1px] text-ink transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? "..." : "ASIGNAR DIETA →"}
          </button>
          {status && <span className="font-mono-app text-[11px] text-neon">{status}</span>}
          {error && (
            <span className="font-mono-app text-[11px] text-danger">
              {error}{" "}
              <button type="button" onClick={assign} className="cursor-pointer underline hover:text-fg">
                Reintentar
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
