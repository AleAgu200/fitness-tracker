"use client";

import { useCallback, useEffect, useState } from "react";

import { api, Food, FOOD_CATEGORIES } from "../lib";
import { usePortalUser } from "../portal-context";

const EMPTY = { name: "", category: "proteína", kcal: "", proteinG: "", carbsG: "", fatG: "" };

const CATEGORY_COLORS: Record<string, string> = {
  "proteína": "text-danger",
  "carbohidrato": "text-warn",
  "grasa": "text-volt",
  "fruta": "text-neon",
  "verdura": "text-neon",
  "lácteo": "text-fg-mid",
  "otro": "text-fg-sec",
};

export default function AlimentosPage() {
  const { user } = usePortalUser();
  const canEdit = user.role === "nutritionist";
  const [foods, setFoods] = useState<Food[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q = "") => {
    try {
      const res = await api<{ foods: Food[] }>(`/api/library/foods?q=${encodeURIComponent(q)}`);
      setFoods(res.foods);
    } catch {
      setError("No se pudo cargar la biblioteca");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(query), 250);
    return () => clearTimeout(t);
  }, [query, load]);

  function startEdit(f: Food) {
    setEditingId(f.id);
    setForm({
      name: f.name, category: f.category,
      kcal: String(f.kcal), proteinG: String(f.proteinG), carbsG: String(f.carbsG), fatG: String(f.fatG),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setError(null);
    const body = JSON.stringify({
      name: form.name.trim(),
      category: form.category,
      kcal: Number(form.kcal) || 0,
      proteinG: Number(form.proteinG) || 0,
      carbsG: Number(form.carbsG) || 0,
      fatG: Number(form.fatG) || 0,
    });
    try {
      if (editingId) {
        await api(`/api/library/foods/${editingId}`, { method: "PUT", body });
      } else {
        await api("/api/library/foods", { method: "POST", body });
      }
      setForm(EMPTY);
      setEditingId(null);
      await load(query);
    } catch {
      setError(editingId ? "Solo podés editar alimentos propios" : "No se pudo guardar");
    }
  }

  async function remove(f: Food) {
    setError(null);
    try {
      await api(`/api/library/foods/${f.id}`, { method: "DELETE" });
      await load(query);
    } catch {
      setError("Solo podés eliminar alimentos propios");
    }
  }

  const inputCls =
    "border border-line bg-elev px-3 py-2 text-sm text-fg placeholder:text-fg-ter focus:border-volt focus:outline-none";

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-semibold text-fg">Biblioteca de alimentos</h1>
      <p className="mb-6 font-mono-app text-[11px] tracking-[1.4px] text-fg-ter">
        VALORES POR 100 g · {foods.length} ALIMENTOS
        {!canEdit && " · SOLO LECTURA (edición reservada a nutricionistas)"}
      </p>

      {/* form */}
      {canEdit && (
      <form onSubmit={save} className="mb-6 border border-line bg-card p-4">
        <div className="mb-3 font-mono-app text-[10px] tracking-[1.4px] text-volt">
          {editingId ? "EDITAR ALIMENTO" : "NUEVO ALIMENTO"}
        </div>
        <div className="grid grid-cols-[2fr_1.2fr_repeat(4,1fr)_auto] gap-2">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nombre" className={inputCls} />
          <select aria-label="Categoría" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={inputCls}>
            {FOOD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={form.kcal} onChange={e => setForm({ ...form, kcal: e.target.value })} placeholder="kcal" type="number" min="0" className={inputCls} />
          <input value={form.proteinG} onChange={e => setForm({ ...form, proteinG: e.target.value })} placeholder="P g" type="number" min="0" step="0.1" className={inputCls} />
          <input value={form.carbsG} onChange={e => setForm({ ...form, carbsG: e.target.value })} placeholder="C g" type="number" min="0" step="0.1" className={inputCls} />
          <input value={form.fatG} onChange={e => setForm({ ...form, fatG: e.target.value })} placeholder="G g" type="number" min="0" step="0.1" className={inputCls} />
          <div className="flex gap-2">
            {editingId && (
              <button
                type="button"
                onClick={() => { setEditingId(null); setForm(EMPTY); }}
                className="cursor-pointer border border-line px-3 font-mono-app text-[10px] text-fg-sec hover:text-fg"
              >
                CANCELAR
              </button>
            )}
            <button type="submit" className="cursor-pointer bg-volt px-4 font-mono-app text-[11px] font-extrabold text-ink transition hover:brightness-110">
              {editingId ? "GUARDAR" : "AGREGAR"}
            </button>
          </div>
        </div>
        {error && <div className="mt-3 font-mono-app text-xs text-danger">{error}</div>}
      </form>
      )}

      {/* search */}
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Buscar alimento…"
        className={`mb-4 w-full max-w-90 ${inputCls}`}
      />

      {/* table */}
      <div className="overflow-x-auto border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line font-mono-app text-[9px] tracking-[1.4px] text-fg-ter">
              <th className="px-4 py-3 text-left font-normal">ALIMENTO</th>
              <th className="px-4 py-3 text-left font-normal">CATEGORÍA</th>
              <th className="px-4 py-3 text-right font-normal">KCAL</th>
              <th className="px-4 py-3 text-right font-normal">PROTEÍNA</th>
              <th className="px-4 py-3 text-right font-normal">CARBOS</th>
              <th className="px-4 py-3 text-right font-normal">GRASAS</th>
              <th className="px-4 py-3 text-right font-normal">ORIGEN</th>
              <th className="px-4 py-3"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {foods.map(f => (
              <tr key={f.id} className="border-b border-line-soft hover:bg-elev">
                <td className="px-4 py-2.5 text-fg">{f.name}</td>
                <td className={`px-4 py-2.5 font-mono-app text-[11px] ${CATEGORY_COLORS[f.category] ?? "text-fg-sec"}`}>{f.category}</td>
                <td className="px-4 py-2.5 text-right font-mono-app text-fg">{f.kcal}</td>
                <td className="px-4 py-2.5 text-right font-mono-app text-fg-mid">{f.proteinG} g</td>
                <td className="px-4 py-2.5 text-right font-mono-app text-fg-mid">{f.carbsG} g</td>
                <td className="px-4 py-2.5 text-right font-mono-app text-fg-mid">{f.fatG} g</td>
                <td className="px-4 py-2.5 text-right font-mono-app text-[10px] text-fg-ter">
                  {f.createdBy ? <span className="border border-neon px-1.5 py-0.5 text-neon">PROPIO</span> : "base"}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  {canEdit && f.createdBy && (
                    <>
                      <button type="button" onClick={() => startEdit(f)} className="cursor-pointer font-mono-app text-[10px] text-fg-sec hover:text-volt">
                        EDITAR
                      </button>
                      <button type="button" onClick={() => remove(f)} className="ml-3 cursor-pointer font-mono-app text-[10px] text-fg-sec hover:text-danger">
                        BORRAR
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {foods.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center font-mono-app text-xs text-fg-ter">Sin resultados</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
