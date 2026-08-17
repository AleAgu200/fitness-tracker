"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "../lib";
import { usePortalUser } from "../portal-context";

interface Settings {
  emailNotifications: boolean;
  attentionDigest: boolean;
  weeklySummary: boolean;
  defaultPortalSection: "attention" | "athletes" | "foods" | "exercises";
}

const DEFAULT_SETTINGS: Settings = {
  emailNotifications: true,
  attentionDigest: true,
  weeklySummary: false,
  defaultPortalSection: "attention",
};

export default function ConfiguracionPage() {
  const { user, logout } = usePortalUser();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);

  useEffect(() => {
    api<{ settings: Settings }>("/api/portal/settings")
      .then(result => result.settings && setSettings({
        ...result.settings,
        defaultPortalSection: user.role === "nutritionist" && result.settings.defaultPortalSection === "exercises" ? "foods" : result.settings.defaultPortalSection,
      }))
      .catch(() => setStatus("No se pudo cargar la configuración"))
      .finally(() => setLoading(false));
  }, [user.role]);

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const result = await api<{ settings: Settings }>("/api/portal/settings", { method: "PUT", body: JSON.stringify(settings) });
      setSettings(result.settings);
      setStatus("Configuración guardada");
    } catch {
      setStatus("No se pudo guardar la configuración");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordStatus(null);
    if (newPassword !== confirmPassword) { setPasswordStatus("Las contraseñas nuevas no coinciden"); return; }
    setChangingPassword(true);
    try {
      await api("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword, revokeOtherSessions: true }) });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setPasswordStatus("Contraseña actualizada y otras sesiones cerradas");
    } catch {
      setPasswordStatus("No se pudo cambiar la contraseña. Verificá la contraseña actual");
    } finally {
      setChangingPassword(false);
    }
  }

  const inputClass = "w-full border border-line bg-elev px-3 py-2.5 text-sm text-fg focus:border-volt focus:outline-none";

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><div className="mb-2 font-mono-app text-[10px] tracking-[1.8px] text-volt">PREFERENCIAS DEL PORTAL</div><h1 className="text-2xl font-semibold text-fg">Configuración</h1><p className="mt-2 text-sm text-fg-sec">Notificaciones, acceso y comportamiento de tu espacio profesional.</p></div>
        <Link href="/portal/perfil" className="w-fit border border-line px-4 py-2.5 font-mono-app text-[10px] tracking-[1px] text-fg-sec hover:border-volt hover:text-volt">← VER PERFIL</Link>
      </div>

      <div className="space-y-5">
        <section className="border border-line bg-card">
          <div className="border-b border-line p-5"><h2 className="font-semibold text-fg">Flujo de trabajo</h2><p className="mt-1 text-sm text-fg-sec">Elegí qué información prioriza el portal.</p></div>
          <div className="divide-y divide-line-soft px-5">
            <SettingToggle title="Avisos por email" description="Recibir notificaciones operativas vinculadas a atletas y asignaciones." checked={settings.emailNotifications} disabled={loading} onChange={value => setSettings({ ...settings, emailNotifications: value })} />
            <SettingToggle title="Resumen de atención" description="Agrupar señales pendientes y cambios relevantes en un resumen." checked={settings.attentionDigest} disabled={loading} onChange={value => setSettings({ ...settings, attentionDigest: value })} />
            <SettingToggle title="Resumen semanal" description="Preparar una recapitulación semanal del estado de tu cartera." checked={settings.weeklySummary} disabled={loading} onChange={value => setSettings({ ...settings, weeklySummary: value })} />
          </div>
          <div className="border-t border-line p-5">
            <label className="block"><span className="mb-2 block font-mono-app text-[10px] tracking-[1px] text-fg-sec">SECCIÓN AL ABRIR EL PORTAL</span><select disabled={loading} value={user.role === "nutritionist" && settings.defaultPortalSection === "exercises" ? "foods" : settings.defaultPortalSection} onChange={e => setSettings({ ...settings, defaultPortalSection: e.target.value as Settings["defaultPortalSection"] })} className={`${inputClass} max-w-sm`}><option value="attention">Centro de atención</option><option value="athletes">Atletas</option><option value="foods">Alimentos</option>{user.role === "coach" && <option value="exercises">Ejercicios</option>}</select></label>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><span aria-live="polite" className={`font-mono-app text-[11px] ${status === "Configuración guardada" ? "text-neon" : "text-danger"}`}>{status}</span><button type="button" onClick={save} disabled={loading || saving} className="cursor-pointer bg-volt px-5 py-3 font-mono-app text-[11px] font-extrabold text-ink disabled:opacity-60">{saving ? "GUARDANDO…" : "GUARDAR CAMBIOS"}</button></div>
          </div>
        </section>

        <section className="border border-line bg-card p-5">
          <h2 className="font-semibold text-fg">Seguridad de la cuenta</h2>
          <div className="mt-1 font-mono-app text-[10px] text-fg-ter">SESIÓN ACTUAL · {user.email}</div>
          <form onSubmit={changePassword} className="mt-5 grid gap-3 sm:grid-cols-3">
            <input required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="Contraseña actual" className={inputClass} />
            <input required minLength={6} value={newPassword} onChange={e => setNewPassword(e.target.value)} type="password" autoComplete="new-password" placeholder="Nueva contraseña" className={inputClass} />
            <input required minLength={6} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} type="password" autoComplete="new-password" placeholder="Confirmar nueva" className={inputClass} />
            <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-3"><span aria-live="polite" className={`text-xs ${passwordStatus?.startsWith("Contraseña actualizada") ? "text-neon" : "text-danger"}`}>{passwordStatus}</span><button type="submit" disabled={changingPassword} className="cursor-pointer border border-volt px-4 py-2.5 font-mono-app text-[10px] font-bold text-volt hover:bg-volt hover:text-ink disabled:opacity-60">{changingPassword ? "ACTUALIZANDO…" : "CAMBIAR CONTRASEÑA"}</button></div>
          </form>
        </section>

        <section className="flex flex-col justify-between gap-4 border border-line bg-elev p-5 sm:flex-row sm:items-center">
          <div><h2 className="font-semibold text-fg">Sesión</h2><p className="mt-1 text-sm text-fg-sec">Cerrá esta sesión cuando uses un equipo compartido.</p></div>
          <button type="button" onClick={logout} className="w-fit cursor-pointer border border-danger px-4 py-2.5 font-mono-app text-[10px] text-danger hover:bg-danger hover:text-ink">CERRAR SESIÓN</button>
        </section>
      </div>
    </div>
  );
}

function SettingToggle({ title, description, checked, disabled, onChange }: { title: string; description: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className={`group flex min-h-18 items-center justify-between gap-5 py-4 ${disabled ? "cursor-wait" : "cursor-pointer"}`}>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">{title}</span>
        <span className="mt-1 block max-w-135 text-xs leading-5 text-fg-ter">{description}</span>
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <span aria-hidden className={`hidden w-14 text-right font-mono-app text-[9px] tracking-[.8px] sm:block ${checked ? "text-volt" : "text-fg-ter"}`}>
          {checked ? "ACTIVO" : "PAUSADO"}
        </span>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={event => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className="relative inline-flex h-7 w-12 shrink-0 rounded-full border border-line bg-elev transition-colors duration-200 ease-out after:absolute after:left-[3px] after:top-1/2 after:h-5 after:w-5 after:-translate-y-1/2 after:rounded-full after:bg-fg-sec after:transition-transform after:duration-200 after:ease-out peer-checked:border-volt peer-checked:bg-volt peer-checked:after:translate-x-5 peer-checked:after:bg-ink peer-disabled:opacity-40 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-volt group-active:after:scale-90 motion-reduce:transition-none motion-reduce:after:transition-none"
        />
      </span>
    </label>
  );
}
