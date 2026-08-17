"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";

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
  const [query, setQuery] = useState("");
  const [grams, setGrams] = useState("100");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const matches = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("es");
    return foods.filter(food => !term || food.name.toLocaleLowerCase("es").includes(term)).slice(0, 8);
  }, [foods, query]);
  const selected = foods.find(food => food.id === foodId);

  useEffect(() => {
    function close(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  function choose(food: Food) {
    setFoodId(food.id); setQuery(food.name); setOpen(false); setActiveIndex(0);
  }

  function add() {
    const food = foods.find(item => item.id === foodId);
    const amount = Number(grams);
    if (!food || !(amount > 0)) return;
    onAdd({ foodId: food.id, name: food.name, grams: Math.round(amount) });
    setFoodId(""); setQuery(""); setOpen(false);
  }

  return (
    <div className="mt-3 border-t border-line-soft pt-3" ref={rootRef}>
      <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_100px_auto]">
        <div className="relative">
          <label className="mb-1.5 block font-mono-app text-[9px] tracking-[.7px] text-fg-ter">BUSCAR ALIMENTO</label>
          <div className="relative">
            <input
              role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listboxId}
              value={query}
              onFocus={() => setOpen(true)}
              onChange={event => { setQuery(event.target.value); setFoodId(""); setOpen(true); setActiveIndex(0); }}
              onKeyDown={event => {
                if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActiveIndex(index => Math.min(Math.max(0, matches.length - 1), index + 1)); }
                if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex(index => Math.max(0, index - 1)); }
                if (event.key === "Enter" && open && matches[activeIndex]) { event.preventDefault(); choose(matches[activeIndex]); }
                if (event.key === "Escape") setOpen(false);
              }}
              placeholder="Escribí arroz, pollo, frijol…"
              className={`w-full pl-9 ${inputCls}`}
            />
            <span aria-hidden className="absolute left-3 top-2 text-neon">⌕</span>
          </div>
          {open && <div id={listboxId} role="listbox" className="exercise-combobox-enter absolute z-30 mt-1 max-h-64 w-full overflow-y-auto border border-line bg-card shadow-2xl">
            {matches.map((food, index) => <button key={food.id} type="button" role="option" aria-selected={index === activeIndex} onPointerMove={() => setActiveIndex(index)} onClick={() => choose(food)} className={`grid min-h-14 w-full cursor-pointer grid-cols-[1fr_auto] items-center gap-3 border-b border-line-soft px-3 py-2 text-left last:border-b-0 ${index === activeIndex ? "bg-elev" : "bg-card hover:bg-elev"}`}><span className="min-w-0"><span className="block truncate text-sm text-fg">{food.name}</span><span className="mt-1 block font-mono-app text-[8px] uppercase text-fg-ter">{food.category} · /100 g</span></span><span className="font-mono-app text-[9px] tabular-nums text-fg-sec">{Math.round(food.kcal)} kcal</span></button>)}
            {!matches.length && <div className="p-3"><p className="text-xs text-fg-sec">No está en tu biblioteca.</p><Link href="/portal/alimentos" className="mt-2 inline-block font-mono-app text-[9px] text-volt underline underline-offset-4">CREAR O IMPORTAR ALIMENTO →</Link></div>}
          </div>}
        </div>
        <label><span className="mb-1.5 block font-mono-app text-[9px] tracking-[.7px] text-fg-ter">PORCIÓN</span><div className="relative"><input aria-label="Gramos" type="number" min="1" value={grams} onChange={event => setGrams(event.target.value)} className={`w-full pr-8 tabular-nums ${inputCls}`} /><span className="absolute right-3 top-2 font-mono-app text-[9px] text-fg-ter">g</span></div></label>
        <button type="button" onClick={add} disabled={!selected || !(Number(grams) > 0)} className="min-h-11 cursor-pointer self-end border border-neon px-4 font-mono-app text-[10px] font-bold text-neon transition-colors duration-150 hover:bg-neon hover:text-ink disabled:cursor-not-allowed disabled:border-line disabled:text-fg-ter motion-reduce:transition-none">AGREGAR</button>
      </div>
      {selected && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono-app text-[9px] text-fg-ter"><span className="text-fg-sec">{selected.name}</span><span>{Math.round(selected.kcal * Number(grams || 0) / 100)} kcal en esta porción</span><span className="text-danger">P {Math.round(selected.proteinG * Number(grams || 0) / 100)}</span><span className="text-warn">C {Math.round(selected.carbsG * Number(grams || 0) / 100)}</span><span className="text-volt">G {Math.round(selected.fatG * Number(grams || 0) / 100)}</span></div>}
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
        body: JSON.stringify({ athleteId: athlete.userId, meals: payloadMeals, baseVersion: current?.version ?? 0 }),
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
