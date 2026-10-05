"use client";

import { useEffect, useState } from "react";

import type { AdFormat, AdFrequency, AdPlacement, AdSettings } from "@/lib/ad-settings-policy";

import { api } from "../../lib";
import {
  AdminHeader,
  buttonGhost,
  buttonPrimary,
  ErrorBanner,
  errorMessage,
  formatDateTime,
  inputClass,
  Notice,
  Pill,
  useAdminData,
} from "../ui";

const PLACEMENTS: { key: AdPlacement; label: string; hint: string }[] = [
  { key: "hoy", label: "HOY", hint: "Pestaña de inicio. Nunca se muestra en la primera pantalla al abrir la app." },
  { key: "dieta", label: "DIETA", hint: "Al entrar a Dieta desde otra pestaña." },
  { key: "entreno", label: "ENTRENO", hint: "Al entrar a Entreno, antes de empezar a registrar." },
  { key: "perfil", label: "PERFIL", hint: "Al entrar a Perfil desde otra pestaña." },
];

const FORMAT_LABEL: Record<AdFormat, string> = {
  interstitial: "Intersticial",
  rewarded_interstitial: "Intersticial bonificado",
};

const ERROR_LABEL: Record<string, string> = {
  invalid_cooldown: "La pausa entre anuncios tiene que ser de 0 a 1440 minutos.",
  invalid_daily_cap: "El máximo diario tiene que ser de 0 a 100.",
};

function saveErrorMessage(cause: unknown): string {
  const code = cause && typeof cause === "object" && "body" in cause
    ? String((cause as { body?: { error?: unknown } }).body?.error ?? "")
    : "";
  const placement = PLACEMENTS.find(item => code.endsWith(`_${item.key}`));
  if (code.startsWith("missing_ad_unit_") && placement) return `${placement.label}: pegá el ID del bloque de anuncios de AdMob para activarla.`;
  if (code.startsWith("invalid_") && placement) return `${placement.label}: revisá el ID del bloque (ca-app-pub-…/…) y la frecuencia (1 a 50).`;
  return ERROR_LABEL[code] ?? errorMessage(cause, "No se pudo guardar. Intentá de nuevo.");
}

export default function AdminAdsPage() {
  const { data, error, reload } = useAdminData<{ settings: AdSettings; updatedAt: number | null }>("/api/admin/ads");
  const [draft, setDraft] = useState<AdSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (data) setDraft(structuredClone(data.settings));
  }, [data]);

  const dirty = Boolean(data && draft && JSON.stringify(data.settings) !== JSON.stringify(draft));

  function setPlacement(key: AdPlacement, patch: Partial<AdSettings["placements"][AdPlacement]>) {
    setDraft(current => current && { ...current, placements: { ...current.placements, [key]: { ...current.placements[key], ...patch } } });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api("/api/admin/ads", { method: "PUT", body: JSON.stringify(draft) });
      setNotice("Guardado. La app toma los cambios en los próximos minutos o al volver a abrirse.");
      await reload();
    } catch (cause) {
      setSaveError(saveErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <AdminHeader
        eyebrow="ANUNCIOS"
        title="Anuncios en la app"
        description="Elegí en qué pestañas se muestran y cada cuánto. Los suscriptores de PULSO Plus nunca ven anuncios, y si un anuncio no carga la app sigue sin esperar."
      />
      <div className="space-y-6 px-5 py-6 md:px-8">
        {error && <ErrorBanner message={error} onRetry={reload} />}

        {draft && (
          <>
            <section className="space-y-4 border border-line bg-card p-4">
              <label className="flex items-center justify-between gap-4">
                <span>
                  <span className="block font-semibold text-fg">Mostrar anuncios</span>
                  <span className="text-sm text-fg-sec">Apagado, nadie ve anuncios. La configuración de cada pestaña se conserva.</span>
                </span>
                <input type="checkbox" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} className="h-5 w-5 accent-[var(--color-volt)]" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block font-mono-app text-[10px] tracking-[1.2px] text-fg-ter">PAUSA MÍNIMA ENTRE ANUNCIOS (MINUTOS)</span>
                  <input type="number" min={0} max={1440} value={draft.cooldownMinutes} onChange={event => setDraft({ ...draft, cooldownMinutes: Number(event.target.value) })} className={inputClass} />
                  <span className="mt-1 block text-xs text-fg-ter">Entre todas las pestañas. 0 = sin pausa.</span>
                </label>
                <label className="block">
                  <span className="mb-1.5 block font-mono-app text-[10px] tracking-[1.2px] text-fg-ter">MÁXIMO POR DÍA (POR TELÉFONO)</span>
                  <input type="number" min={0} max={100} value={draft.dailyCap} onChange={event => setDraft({ ...draft, dailyCap: Number(event.target.value) })} className={inputClass} />
                  <span className="mt-1 block text-xs text-fg-ter">0 = sin límite.</span>
                </label>
              </div>
            </section>

            <ul className={`space-y-3 ${draft.enabled ? "" : "opacity-50"}`}>
              {PLACEMENTS.map(({ key, label, hint }) => {
                const placement = draft.placements[key];
                return (
                  <li key={key} className="space-y-3 border border-line bg-card p-4">
                    <label className="flex items-center justify-between gap-4">
                      <span>
                        <span className="flex items-center gap-2">
                          <span className="font-mono-app text-xs tracking-[1.2px] text-fg">{label}</span>
                          <Pill tone={placement.enabled ? "ok" : "muted"}>{placement.enabled ? "ACTIVO" : "APAGADO"}</Pill>
                        </span>
                        <span className="mt-1 block text-sm text-fg-sec">{hint}</span>
                      </span>
                      <input type="checkbox" checked={placement.enabled} onChange={event => setPlacement(key, { enabled: event.target.checked })} className="h-5 w-5 accent-[var(--color-volt)]" />
                    </label>
                    <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
                      <label className="block">
                        <span className="mb-1.5 block font-mono-app text-[10px] tracking-[1.2px] text-fg-ter">FRECUENCIA</span>
                        <div className="flex gap-2">
                          <select value={placement.frequency} onChange={event => setPlacement(key, { frequency: event.target.value as AdFrequency })} className={inputClass}>
                            <option value="session">1 vez por sesión</option>
                            <option value="opens">Cada N aperturas</option>
                          </select>
                          {placement.frequency === "opens" && (
                            <input type="number" min={1} max={50} value={placement.every} onChange={event => setPlacement(key, { every: Number(event.target.value) })} aria-label={`${label}: cada cuántas aperturas`} className={`${inputClass} w-20`} />
                          )}
                        </div>
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block font-mono-app text-[10px] tracking-[1.2px] text-fg-ter">BLOQUE DE ANUNCIOS DE ADMOB</span>
                        <div className="flex gap-2">
                          <select value={placement.format} onChange={event => setPlacement(key, { format: event.target.value as AdFormat })} className={`${inputClass} max-w-48`}>
                            {(Object.keys(FORMAT_LABEL) as AdFormat[]).map(format => <option key={format} value={format}>{FORMAT_LABEL[format]}</option>)}
                          </select>
                          <input value={placement.adUnitId} onChange={event => setPlacement(key, { adUnitId: event.target.value })} placeholder="ca-app-pub-0000000000000000/0000000000" className={`${inputClass} font-mono-app text-xs`} />
                        </div>
                      </label>
                    </div>
                    {placement.format === "rewarded_interstitial" && (
                      <p className="text-xs leading-5 text-warn">
                        El intersticial bonificado exige ofrecer una recompensa y la opción de saltearlo. Para anuncios al cambiar de pestaña usá un bloque intersticial.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>

            <p className="text-xs leading-5 text-fg-ter">
              El formato tiene que coincidir con el tipo del bloque creado en AdMob. Las versiones de desarrollo siempre usan los anuncios de prueba de Google.
              {data?.updatedAt ? ` Último cambio: ${formatDateTime(data.updatedAt)}.` : " Todavía con los valores de fábrica."}
            </p>

            {saveError && <div role="alert" className="text-sm text-danger">{saveError}</div>}
            <div className="flex gap-2">
              <button type="button" onClick={() => void save()} disabled={!dirty || saving} className={buttonPrimary}>{saving ? "GUARDANDO…" : "GUARDAR"}</button>
              <button type="button" onClick={() => { setSaveError(null); setDraft(data ? structuredClone(data.settings) : null); }} disabled={!dirty || saving} className={buttonGhost}>DESHACER</button>
            </div>
          </>
        )}
      </div>
      {notice && <Notice message={notice} onClose={() => setNotice(null)} />}
    </div>
  );
}
