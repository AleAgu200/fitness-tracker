"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { api, Food, FOOD_CATEGORIES } from "../lib";
import { usePortalUser } from "../portal-context";

interface FoodForm {
  name: string;
  category: string;
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
}

interface CatalogFood {
  id: string;
  source: "pulso" | "usda";
  name: string;
  category: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

const EMPTY: FoodForm = { name: "", category: "proteína", kcal: "", proteinG: "", carbsG: "", fatG: "" };
const PAGE_SIZE = 12;
const inputClass = "border border-line bg-elev px-3 py-2.5 text-sm text-fg placeholder:text-fg-ter transition-colors duration-150 focus:border-volt focus:outline-none focus-visible:ring-2 focus-visible:ring-volt/30 motion-reduce:transition-none";

const CATEGORY_COLORS: Record<string, string> = {
  proteína: "text-danger", carbohidrato: "text-warn", grasa: "text-volt",
  fruta: "text-neon", verdura: "text-neon", lácteo: "text-fg-mid", otro: "text-fg-sec",
};

export default function AlimentosPage() {
  const { user } = usePortalUser();
  const canEdit = user.role === "nutritionist";
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"library" | "catalog">("library");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [source, setSource] = useState("all");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api<{ foods: Food[] }>("/api/library/foods");
      setFoods(result.foods);
    } catch {
      setMessage("No se pudo cargar la biblioteca. Revisá tu conexión e intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("es");
    return foods.filter(food => (!term || food.name.toLocaleLowerCase("es").includes(term))
      && (category === "all" || food.category === category)
      && (source === "all" || (source === "own" ? food.createdBy === user.id : (food.source ?? "base") === source)));
  }, [category, foods, query, source, user.id]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleFoods = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [query, category, source]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  const stats = useMemo(() => ({
    total: foods.length,
    own: foods.filter(food => food.createdBy === user.id).length,
    imported: foods.filter(food => food.createdBy === user.id && food.source === "usda").length,
    categories: new Set(foods.map(food => food.category)).size,
  }), [foods, user.id]);

  function startCreate() {
    setEditingId(null); setForm(EMPTY); setShowForm(true); setMessage(null);
  }

  function startEdit(food: Food) {
    setEditingId(food.id);
    setForm({ name: food.name, category: food.category, kcal: String(food.kcal), proteinG: String(food.proteinG), carbsG: String(food.carbsG), fatG: String(food.fatG) });
    setShowForm(true); setMessage(null); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true); setMessage(null);
    const body = JSON.stringify({ name: form.name.trim(), category: form.category, kcal: Number(form.kcal) || 0, proteinG: Number(form.proteinG) || 0, carbsG: Number(form.carbsG) || 0, fatG: Number(form.fatG) || 0 });
    try {
      if (editingId) await api(`/api/library/foods/${editingId}`, { method: "PUT", body });
      else await api("/api/library/foods", { method: "POST", body });
      const wasEditing = Boolean(editingId);
      setShowForm(false); setEditingId(null); setForm(EMPTY); await load();
      setMessage(wasEditing ? "Alimento actualizado." : "Alimento agregado a tu biblioteca.");
    } catch {
      setMessage(editingId ? "Solo podés editar alimentos creados por vos." : "No se pudo guardar el alimento.");
    } finally { setSaving(false); }
  }

  async function remove(food: Food) {
    setMessage(null);
    try {
      await api(`/api/library/foods/${food.id}`, { method: "DELETE" });
      setPendingDeleteId(null); await load(); setMessage("Alimento eliminado.");
    } catch { setMessage("Solo podés eliminar alimentos creados por vos."); }
  }

  const hasFilters = Boolean(query || category !== "all" || source !== "all");

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><div className="mb-2 font-mono-app text-[10px] tracking-[1.8px] text-volt">CATÁLOGO NUTRICIONAL · BASE 100 g</div><h1 className="text-2xl font-semibold text-fg">Biblioteca de alimentos</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-fg-sec">Creá alimentos propios o importá referencias verificables para reutilizarlas al construir planes de comida.</p></div>
        {canEdit && <button type="button" onClick={startCreate} className="w-fit cursor-pointer bg-volt px-5 py-3 font-mono-app text-[11px] font-extrabold tracking-[1px] text-ink transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[.98] motion-reduce:transition-none">+ NUEVO ALIMENTO</button>}
      </header>

      <div className="mb-6 grid grid-cols-2 gap-2 lg:grid-cols-4"><Stat label="TOTAL" value={stats.total} /><Stat label="PROPIOS" value={stats.own} /><Stat label="IMPORTADOS" value={stats.imported} /><Stat label="CATEGORÍAS" value={stats.categories} /></div>

      {showForm && canEdit && <FoodEditor form={form} editing={Boolean(editingId)} saving={saving} onChange={setForm} onSave={save} onCancel={() => { setShowForm(false); setEditingId(null); setForm(EMPTY); }} />}

      <div className="mb-4 flex border-b border-line" role="tablist" aria-label="Fuente de alimentos"><Tab active={view === "library"} onClick={() => setView("library")}>MI BIBLIOTECA</Tab><Tab active={view === "catalog"} onClick={() => setView("catalog")}>EXPLORAR CATÁLOGO</Tab></div>
      {message && <div role="status" className={`mb-4 border px-4 py-3 font-mono-app text-[11px] ${message.startsWith("No") || message.startsWith("Solo") ? "border-danger/50 text-danger" : "border-neon/40 text-neon"}`}>{message}</div>}

      {view === "catalog" ? <CatalogExplorer canImport={canEdit} onImported={load} /> : <>
        <div className="mb-4 grid gap-2 border border-line bg-card p-3 sm:grid-cols-2 lg:grid-cols-[minmax(240px,2fr)_1fr_1fr_auto]">
          <label className="relative"><span className="sr-only">Buscar alimento</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar alimento por nombre…" className={`w-full pl-10 ${inputClass}`} /><span aria-hidden className="absolute left-3 top-2.5 text-volt">⌕</span></label>
          <Filter label="Categoría" value={category} onChange={setCategory} options={FOOD_CATEGORIES} />
          <Filter label="Origen" value={source} onChange={setSource} options={["base", "own", "usda"]} labels={{ own: "propios", usda: "USDA" }} />
          {hasFilters && <button type="button" onClick={() => { setQuery(""); setCategory("all"); setSource("all"); }} className="min-h-11 cursor-pointer px-3 font-mono-app text-[9px] text-fg-ter hover:text-volt">LIMPIAR</button>}
        </div>
        <div className="mb-2 flex justify-between gap-3 font-mono-app text-[9px] tracking-[1px] text-fg-ter"><span>{filtered.length} RESULTADOS</span>{!canEdit && <span>CONSULTA NUTRICIONAL · SOLO LECTURA</span>}</div>
        {loading ? <FoodSkeleton /> : <FoodList foods={visibleFoods} userId={user.id} canEdit={canEdit} pendingDeleteId={pendingDeleteId} onEdit={startEdit} onAskDelete={setPendingDeleteId} onDelete={remove} />}
        {pageCount > 1 && <Pagination page={page} pageCount={pageCount} total={filtered.length} onChange={setPage} />}
      </>}
    </div>
  );
}

function FoodEditor({ form, editing, saving, onChange, onSave, onCancel }: { form: FoodForm; editing: boolean; saving: boolean; onChange: (form: FoodForm) => void; onSave: (event: React.FormEvent) => void; onCancel: () => void }) {
  const calculatedKcal = Math.round((Number(form.proteinG) || 0) * 4 + (Number(form.carbsG) || 0) * 4 + (Number(form.fatG) || 0) * 9);
  const declaredKcal = Number(form.kcal) || 0;
  const mismatch = declaredKcal > 0 && Math.abs(declaredKcal - calculatedKcal) > Math.max(10, declaredKcal * 0.12);
  return <form onSubmit={onSave} className="food-panel-enter mb-6 border border-volt/50 bg-card p-4 sm:p-5">
    <div className="mb-5 flex items-start justify-between gap-4"><div><div className="font-mono-app text-[10px] tracking-[1.4px] text-volt">{editing ? "EDITAR ALIMENTO" : "CREAR ALIMENTO PROPIO"}</div><p className="mt-1 text-xs leading-5 text-fg-ter">Ingresá valores por cada 100 g de porción comestible.</p></div><button type="button" onClick={onCancel} className="min-h-11 min-w-11 cursor-pointer text-fg-ter hover:text-fg" aria-label="Cerrar formulario">×</button></div>
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
      <label className="md:col-span-2 lg:col-span-3"><FieldLabel>NOMBRE DEL ALIMENTO</FieldLabel><input autoFocus required maxLength={120} value={form.name} onChange={event => onChange({ ...form, name: event.target.value })} placeholder="Ej. Frijoles rojos cocidos" className={`w-full ${inputClass}`} /></label>
      <label className="lg:col-span-2"><FieldLabel>CATEGORÍA</FieldLabel><select value={form.category} onChange={event => onChange({ ...form, category: event.target.value })} className={`w-full ${inputClass}`}>{FOOD_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label>
      <label><FieldLabel>ENERGÍA</FieldLabel><NumberInput value={form.kcal} onChange={value => onChange({ ...form, kcal: value })} suffix="kcal" /></label>
      <label className="lg:col-span-2"><FieldLabel>PROTEÍNA</FieldLabel><NumberInput value={form.proteinG} onChange={value => onChange({ ...form, proteinG: value })} suffix="g" /></label>
      <label className="lg:col-span-2"><FieldLabel>CARBOHIDRATOS</FieldLabel><NumberInput value={form.carbsG} onChange={value => onChange({ ...form, carbsG: value })} suffix="g" /></label>
      <label className="lg:col-span-2"><FieldLabel>GRASAS</FieldLabel><NumberInput value={form.fatG} onChange={value => onChange({ ...form, fatG: value })} suffix="g" /></label>
    </div>
    <div className={`mt-4 flex flex-col justify-between gap-3 border px-3 py-2.5 sm:flex-row sm:items-center ${mismatch ? "border-warn/50 bg-warn/5" : "border-line-soft bg-elev"}`}><div className="font-mono-app text-[10px] text-fg-sec"><span className={mismatch ? "text-warn" : "text-neon"}>CÁLCULO POR MACROS: {calculatedKcal} kcal</span><span className="ml-2 text-fg-ter">· referencia 4/4/9</span></div>{mismatch && <button type="button" onClick={() => onChange({ ...form, kcal: String(calculatedKcal) })} className="w-fit cursor-pointer font-mono-app text-[9px] font-bold text-warn underline underline-offset-4 hover:text-fg">USAR VALOR CALCULADO</button>}</div>
    <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onCancel} className="min-h-11 cursor-pointer border border-line px-4 font-mono-app text-[10px] text-fg-sec hover:text-fg">CANCELAR</button><button type="submit" disabled={saving} className="min-h-11 cursor-pointer bg-volt px-5 font-mono-app text-[10px] font-extrabold text-ink disabled:opacity-60">{saving ? "GUARDANDO…" : editing ? "GUARDAR CAMBIOS" : "AGREGAR A BIBLIOTECA"}</button></div>
  </form>;
}

function NumberInput({ value, onChange, suffix }: { value: string; onChange: (value: string) => void; suffix: string }) { return <div className="relative"><input required type="number" min="0" step="0.1" value={value} onChange={event => onChange(event.target.value)} placeholder="0" className={`w-full pr-12 tabular-nums ${inputClass}`} /><span className="pointer-events-none absolute right-3 top-3 font-mono-app text-[9px] text-fg-ter">{suffix}</span></div>; }

function FoodList({ foods, userId, canEdit, pendingDeleteId, onEdit, onAskDelete, onDelete }: { foods: Food[]; userId: string; canEdit: boolean; pendingDeleteId: string | null; onEdit: (food: Food) => void; onAskDelete: (id: string | null) => void; onDelete: (food: Food) => void }) {
  if (!foods.length) return <div className="border border-dashed border-line p-10 text-center"><div className="text-sm text-fg-sec">No hay alimentos que coincidan.</div><div className="mt-2 font-mono-app text-[10px] text-fg-ter">AJUSTÁ LOS FILTROS O CREÁ UN ALIMENTO PROPIO</div></div>;
  return <div className="overflow-hidden border border-line bg-card">{foods.map(food => { const own = food.createdBy === userId; return <article key={food.id} className="border-b border-line-soft last:border-b-0">
    <div className="grid gap-4 p-4 sm:grid-cols-[minmax(190px,2fr)_minmax(260px,1.4fr)_auto] sm:items-center"><div className="min-w-0"><h2 className="truncate text-sm font-medium text-fg">{food.name}</h2><div className={`mt-1 font-mono-app text-[9px] ${CATEGORY_COLORS[food.category] ?? "text-fg-sec"}`}>{food.category.toUpperCase()} · {sourceLabel(food, own)}</div></div><div className="grid grid-cols-4 gap-2"><Macro label="KCAL" value={format(food.kcal)} accent="text-fg" /><Macro label="P" value={`${format(food.proteinG)} g`} accent="text-danger" /><Macro label="C" value={`${format(food.carbsG)} g`} accent="text-warn" /><Macro label="G" value={`${format(food.fatG)} g`} accent="text-volt" /></div><div className="flex min-h-11 items-center justify-end gap-3">{canEdit && own && <><button type="button" onClick={() => onEdit(food)} className="cursor-pointer font-mono-app text-[9px] text-fg-sec hover:text-volt">EDITAR</button><button type="button" onClick={() => onAskDelete(food.id)} className="cursor-pointer font-mono-app text-[9px] text-fg-sec hover:text-danger">BORRAR</button></>}</div></div>
    {pendingDeleteId === food.id && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-danger/30 bg-danger/5 px-4 py-3"><span className="text-xs text-danger">¿Eliminar “{food.name}”? Dejará de estar disponible para nuevos planes.</span><div className="flex gap-2"><button type="button" onClick={() => onAskDelete(null)} className="min-h-11 cursor-pointer px-3 font-mono-app text-[9px] text-fg-sec">CONSERVAR</button><button type="button" onClick={() => onDelete(food)} className="min-h-11 cursor-pointer bg-danger px-3 font-mono-app text-[9px] font-bold text-ink">ELIMINAR ALIMENTO</button></div></div>}
  </article>; })}</div>;
}

function CatalogExplorer({ canImport, onImported }: { canImport: boolean; onImported: () => Promise<void> }) {
  const [query, setQuery] = useState(""); const [results, setResults] = useState<CatalogFood[]>([]); const [searching, setSearching] = useState(false); const [importingId, setImportingId] = useState<string | null>(null); const [note, setNote] = useState("Escribí al menos 2 caracteres. Buscamos primero en PULSO y luego ampliamos con USDA.");
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setResults([]); setNote("Escribí al menos 2 caracteres. Buscamos primero en PULSO y luego ampliamos con USDA."); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => { setSearching(true); setNote(""); try { const response = await api<{ foods: CatalogFood[] }>(`/api/library/foods/search?q=${encodeURIComponent(term)}`, { signal: controller.signal }); setResults(response.foods); if (!response.foods.length) setNote("No encontramos alimentos con esa búsqueda. Podés crearlo manualmente desde tu biblioteca."); } catch { if (!controller.signal.aborted) { setResults([]); setNote("El catálogo externo no está disponible. Tu biblioteca PULSO sigue funcionando."); } } finally { if (!controller.signal.aborted) setSearching(false); } }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);
  async function importFood(food: CatalogFood) {
    if (food.source !== "usda") return;
    setImportingId(food.id); setNote("");
    try { const response = await api<{ duplicate?: boolean }>("/api/library/foods", { method: "POST", body: JSON.stringify({ ...food, source: "usda", externalId: food.id }) }); await onImported(); setNote(response.duplicate ? `“${food.name}” ya estaba en tu biblioteca.` : `“${food.name}” se agregó con valores por 100 g.`); } catch { setNote("No se pudo importar el alimento. Intentá de nuevo."); } finally { setImportingId(null); }
  }
  return <section className="food-panel-enter border border-line bg-card p-4 sm:p-5"><div className="mb-4"><div className="font-mono-app text-[10px] tracking-[1.3px] text-neon">PULSO + USDA · CATÁLOGO NUTRICIONAL</div><p className="mt-2 max-w-2xl text-sm leading-6 text-fg-sec">Compará energía y macros por 100 g antes de importar. Las referencias PULSO ya forman parte de tu biblioteca.</p></div><div className="relative"><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Ej. pechuga de pollo, arroz integral, yogur…" className={`w-full pl-10 pr-24 ${inputClass}`} /><span aria-hidden className="absolute left-3 top-2.5 text-neon">⌕</span>{searching && <span className="absolute right-3 top-3 font-mono-app text-[9px] text-fg-ter">BUSCANDO…</span>}</div>{note && <div role="status" className="mt-3 font-mono-app text-[10px] leading-5 text-fg-sec">{note}</div>}{results.length > 0 && <div className="mt-3 flex justify-between font-mono-app text-[9px] text-fg-ter"><span>{results.length} COINCIDENCIAS</span><span>VALORES / 100 g</span></div>}<div className="mt-3 grid gap-2 lg:grid-cols-2">{results.map(food => <article key={`${food.source}-${food.id}`} className="flex flex-col justify-between gap-4 border border-line-soft bg-elev p-4 transition-colors duration-150 hover:border-line sm:flex-row sm:items-center motion-reduce:transition-none"><div className="min-w-0"><h3 className="line-clamp-2 text-sm font-medium leading-5 text-fg">{food.name}</h3><div className="mt-1 font-mono-app text-[9px] text-fg-ter">{food.category.toUpperCase()} · {food.source === "pulso" ? "BIBLIOTECA PULSO" : "USDA"}</div><div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-mono-app text-[10px]"><span className="text-fg">{format(food.kcal)} kcal</span><span className="text-danger">P {format(food.proteinG)}</span><span className="text-warn">C {format(food.carbsG)}</span><span className="text-volt">G {format(food.fatG)}</span></div></div><div className="shrink-0">{food.source === "pulso" ? <span className="inline-flex min-h-11 items-center border border-line px-3 font-mono-app text-[9px] text-fg-ter">YA DISPONIBLE</span> : canImport ? <button type="button" disabled={importingId === food.id} onClick={() => importFood(food)} className="min-h-11 cursor-pointer border border-volt px-3 font-mono-app text-[9px] font-bold text-volt transition-colors duration-150 hover:bg-volt hover:text-ink disabled:opacity-50 motion-reduce:transition-none">{importingId === food.id ? "IMPORTANDO…" : "IMPORTAR"}</button> : <span className="font-mono-app text-[9px] text-fg-ter">SOLO NUTRICIÓN</span>}</div></article>)}</div></section>;
}

function Pagination({ page, pageCount, total, onChange }: { page: number; pageCount: number; total: number; onChange: (page: number) => void }) { return <nav aria-label="Páginas de alimentos" className="mt-4 flex items-center justify-between border-t border-line-soft pt-4"><button type="button" disabled={page === 1} onClick={() => onChange(page - 1)} className="min-h-11 cursor-pointer border border-line px-4 font-mono-app text-[9px] text-fg-mid hover:border-volt hover:text-volt disabled:cursor-not-allowed disabled:opacity-40">← ANTERIOR</button><span className="font-mono-app text-[9px] text-fg-ter">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} DE {total}</span><button type="button" disabled={page === pageCount} onClick={() => onChange(page + 1)} className="min-h-11 cursor-pointer border border-line px-4 font-mono-app text-[9px] text-fg-mid hover:border-volt hover:text-volt disabled:cursor-not-allowed disabled:opacity-40">SIGUIENTE →</button></nav>; }
function Macro({ label, value, accent }: { label: string; value: string; accent: string }) { return <div><div className="font-mono-app text-[8px] tracking-[.8px] text-fg-ter">{label}</div><div className={`mt-1 font-mono-app text-[11px] tabular-nums ${accent}`}>{value}</div></div>; }
function Stat({ label, value }: { label: string; value: number }) { return <div className="border border-line bg-card p-4"><div className="font-mono-app text-[9px] tracking-[1px] text-fg-ter">{label}</div><div className="mt-2 text-2xl font-semibold tabular-nums text-fg">{value}</div></div>; }
function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`min-h-11 cursor-pointer border-b-2 px-4 py-3 font-mono-app text-[10px] tracking-[1px] ${active ? "border-volt text-volt" : "border-transparent text-fg-ter hover:text-fg"}`}>{children}</button>; }
function Filter({ label, value, onChange, options, labels = {} }: { label: string; value: string; onChange: (value: string) => void; options: readonly string[]; labels?: Record<string, string> }) { return <select aria-label={label} value={value} onChange={event => onChange(event.target.value)} className={inputClass}><option value="all">{label}: todos</option>{options.map(option => <option key={option} value={option}>{label}: {labels[option] ?? option}</option>)}</select>; }
function FieldLabel({ children }: { children: React.ReactNode }) { return <span className="mb-1.5 block font-mono-app text-[9px] tracking-[.7px] text-fg-ter">{children}</span>; }
function sourceLabel(food: Food, own: boolean) { if (food.source === "usda") return "USDA · IMPORTADO"; if (own) return "PROPIO · EDITABLE"; return "CATÁLOGO BASE"; }
function format(value: number) { return Number.isInteger(value) ? String(value) : value.toFixed(1); }
function FoodSkeleton() { return <div className="animate-pulse border border-line bg-card">{[1, 2, 3, 4, 5].map(value => <div key={value} className="grid gap-4 border-b border-line-soft p-4 sm:grid-cols-3"><span className="h-4 bg-elev" /><span className="h-4 bg-elev" /><span className="h-4 bg-elev" /></div>)}</div>; }
