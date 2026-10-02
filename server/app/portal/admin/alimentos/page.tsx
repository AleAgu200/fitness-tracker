"use client";

import { useEffect, useState } from "react";

import { api, FOOD_CATEGORIES } from "../../lib";
import {
  AdminHeader,
  buttonGhost,
  buttonPrimary,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  errorMessage,
  inputClass,
  Notice,
  Pill,
  SegmentedFilter,
  useAdminData,
  useDebounced,
} from "../ui";

interface AdminFood {
  id: string;
  name: string;
  category: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  source: string;
  base: boolean;
}

type Scope = "all" | "base" | "custom";

interface Draft { id: string | null; name: string; category: string; kcal: string; proteinG: string; carbsG: string; fatG: string }

const EMPTY: Draft = { id: null, name: "", category: "proteína", kcal: "", proteinG: "", carbsG: "", fatG: "" };

function toDraft(food: AdminFood): Draft {
  return { id: food.id, name: food.name, category: food.category, kcal: String(food.kcal), proteinG: String(food.proteinG), carbsG: String(food.carbsG), fatG: String(food.fatG) };
}

/** Energy from macros (4/4/9). A large gap usually means a typo or a non-100 g label. */
function macroKcal(d: Draft): number {
  return Math.round((Number(d.proteinG) || 0) * 4 + (Number(d.carbsG) || 0) * 4 + (Number(d.fatG) || 0) * 9);
}

function FoodEditor({ draft, onCancel, onSaved }: { draft: Draft; onCancel: () => void; onSaved: (message: string) => void }) {
  const [form, setForm] = useState(draft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setForm(draft); setError(null); }, [draft]);

  const estimated = macroKcal(form);
  const declared = Number(form.kcal) || 0;
  const mismatch = declared > 0 && estimated > 0 && Math.abs(declared - estimated) / declared > 0.2;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const body = JSON.stringify({
      name: form.name,
      category: form.category,
      kcal: Number(form.kcal),
      proteinG: Number(form.proteinG),
      carbsG: Number(form.carbsG),
      fatG: Number(form.fatG),
    });
    try {
      if (form.id) await api(`/api/admin/foods/${form.id}`, { method: "PUT", body });
      else await api("/api/admin/foods", { method: "POST", body });
      onSaved(form.id ? `“${form.name}” actualizado` : `“${form.name}” agregado a la base`);
    } catch (cause) {
      setError(errorMessage(cause, "No se pudo guardar. Intentá de nuevo."));
    } finally {
      setSaving(false);
    }
  }

  const numberField = (key: "kcal" | "proteinG" | "carbsG" | "fatG", label: string) => (
    <label>
      <span className="mb-1 block font-mono-app text-[9.5px] tracking-[1.2px] text-fg-ter">{label}</span>
      <input required type="number" inputMode="decimal" min={0} max={1000} step="0.1" value={form[key]} onChange={event => set(key, event.target.value)} className={`${inputClass} tabular-nums`} />
    </label>
  );

  return (
    <form onSubmit={save} className="food-panel-enter space-y-4 border border-neon/40 bg-card p-5">
      <h2 className="font-mono-app text-[11px] tracking-[1.4px] text-neon">{form.id ? "EDITAR ALIMENTO" : "NUEVO ALIMENTO DE LA BASE"}</h2>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label>
          <span className="mb-1 block font-mono-app text-[9.5px] tracking-[1.2px] text-fg-ter">NOMBRE *</span>
          <input required maxLength={120} value={form.name} onChange={event => set("name", event.target.value)} className={inputClass} placeholder="Ej.: Frijoles rojos cocidos" />
        </label>
        <label>
          <span className="mb-1 block font-mono-app text-[9.5px] tracking-[1.2px] text-fg-ter">CATEGORÍA</span>
          <select value={form.category} onChange={event => set("category", event.target.value)} className={inputClass}>
            {FOOD_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
      </div>
      <div>
        <div className="mb-2 font-mono-app text-[9.5px] tracking-[1.2px] text-fg-sec">VALORES POR 100 G</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {numberField("kcal", "KCAL *")}
          {numberField("proteinG", "PROTEÍNA (G) *")}
          {numberField("carbsG", "CARBOHIDRATOS (G) *")}
          {numberField("fatG", "GRASA (G) *")}
        </div>
        {mismatch && (
          <p className="mt-2 text-xs text-warn">
            Los macros suman ≈{estimated} kcal y declaraste {declared}. Revisá que los valores sean por 100 g.
          </p>
        )}
      </div>
      {error && <div role="alert" className="text-sm text-danger">{error}</div>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={buttonGhost}>CANCELAR</button>
        <button type="submit" disabled={saving} className={buttonPrimary}>{saving ? "GUARDANDO…" : form.id ? "GUARDAR CAMBIOS" : "AGREGAR"}</button>
      </div>
    </form>
  );
}

export default function AdminFoodsPage() {
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<AdminFood | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const query = useDebounced(q);
  const { data, error, loading, reload } = useAdminData<{ foods: AdminFood[] }>(`/api/admin/foods?${new URLSearchParams({ q: query, scope })}`);

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setActionError(null);
    try {
      await api(`/api/admin/foods/${deleting.id}`, { method: "DELETE" });
      setNotice(`“${deleting.name}” eliminado`);
      setDeleting(null);
      await reload();
    } catch (cause) {
      setActionError(errorMessage(cause, "No se pudo eliminar."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <AdminHeader
        eyebrow="CATÁLOGO"
        title="Base de alimentos"
        description="Los alimentos de la base los ven todos los nutricionistas y la generación de planes. Los creados por cada nutricionista también se pueden corregir aquí."
        actions={<button type="button" onClick={() => setDraft(EMPTY)} className={buttonPrimary}>+ NUEVO ALIMENTO</button>}
      />
      <div className="space-y-4 px-5 py-6 md:px-8">
        {draft && <FoodEditor draft={draft} onCancel={() => setDraft(null)} onSaved={message => { setDraft(null); setNotice(message); void reload(); }} />}

        <div className="flex flex-wrap gap-3">
          <input type="search" value={q} onChange={event => setQ(event.target.value)} placeholder="Buscar alimento…" aria-label="Buscar alimentos" className={`${inputClass} max-w-sm`} />
          <SegmentedFilter label="Origen" value={scope} onChange={setScope} options={[
            { value: "all", label: "TODOS" },
            { value: "base", label: "BASE PULSO" },
            { value: "custom", label: "DE NUTRICIONISTAS" },
          ]} />
        </div>

        {error && <ErrorBanner message={error} onRetry={reload} />}
        {data && <div className="font-mono-app text-[10px] text-fg-ter">{data.foods.length}{data.foods.length === 300 ? "+" : ""} ALIMENTOS{loading ? " · ACTUALIZANDO…" : ""}</div>}
        {data && data.foods.length === 0 ? <EmptyState title="Sin resultados" /> : (
          <div className="overflow-x-auto border border-line">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-line font-mono-app text-[9.5px] tracking-[1.2px] text-fg-ter">
                <tr>
                  <th className="px-4 py-2.5 font-normal">ALIMENTO</th>
                  <th className="px-4 py-2.5 text-right font-normal">KCAL</th>
                  <th className="px-4 py-2.5 text-right font-normal">PROT</th>
                  <th className="px-4 py-2.5 text-right font-normal">CARB</th>
                  <th className="px-4 py-2.5 text-right font-normal">GRASA</th>
                  <th className="px-4 py-2.5 font-normal"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {data?.foods.map(food => (
                  <tr key={food.id}>
                    <td className="px-4 py-2.5">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-fg">{food.name}</span>
                        {!food.base && <Pill tone="info">{food.source === "usda" ? "USDA" : "NUTRICIONISTA"}</Pill>}
                      </span>
                      <span className="text-xs text-fg-sec">{food.category}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-fg">{Math.round(food.kcal)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-fg-mid">{food.proteinG}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-fg-mid">{food.carbsG}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-fg-mid">{food.fatG}</td>
                    <td className="px-4 py-2.5 text-right font-mono-app text-[10px]">
                      <button type="button" onClick={() => setDraft(toDraft(food))} className="mr-3 cursor-pointer text-neon hover:underline">EDITAR</button>
                      <button type="button" onClick={() => { setActionError(null); setDeleting(food); }} className="cursor-pointer text-fg-sec hover:text-danger">ELIMINAR</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleting && (
        <ConfirmDialog
          title={`Eliminar “${deleting.name}”`}
          body="Deja de estar disponible para armar planes. Los planes que ya lo incluyen conservan su nombre y gramos."
          confirmLabel="ELIMINAR"
          danger
          busy={busy}
          error={actionError}
          onConfirm={() => void remove()}
          onCancel={() => setDeleting(null)}
        />
      )}
      {notice && <Notice message={notice} onClose={() => setNotice(null)} />}
    </div>
  );
}
