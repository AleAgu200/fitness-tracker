"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { api } from "../lib";
import { usePortalUser } from "../portal-context";

interface Profile {
  name: string;
  email: string;
  role: "coach" | "nutritionist";
  headline: string | null;
  bio: string | null;
  phone: string | null;
  location: string | null;
  timezone: string | null;
  credentials: string | null;
  organizationName: string | null;
  organizationRole: string | null;
}

const TIMEZONES = [
  "America/Tegucigalpa",
  "America/Mexico_City",
  "America/Bogota",
  "America/Lima",
  "America/Argentina/Buenos_Aires",
  "America/New_York",
  "Europe/Madrid",
];

export default function PerfilPage() {
  const { refreshUser } = usePortalUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api<{ profile: Profile }>("/api/portal/profile")
      .then(result => setProfile(result.profile))
      .catch(() => setMessage("No se pudo cargar tu perfil"))
      .finally(() => setLoading(false));
  }, []);

  const completion = useMemo(() => {
    if (!profile) return 0;
    const values = [profile.name, profile.organizationName, profile.headline, profile.bio, profile.phone, profile.location, profile.credentials];
    return Math.round((values.filter(Boolean).length / values.length) * 100);
  }, [profile]);

  function update<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile(current => current ? { ...current, [key]: value } : current);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await api<{ profile: Profile }>("/api/portal/profile", {
        method: "PUT",
        body: JSON.stringify({
          name: profile.name,
          organizationName: profile.organizationName,
          headline: profile.headline ?? "",
          bio: profile.bio ?? "",
          phone: profile.phone || null,
          location: profile.location || null,
          timezone: profile.timezone || "America/Tegucigalpa",
          credentials: profile.credentials ?? "",
        }),
      });
      setProfile(result.profile);
      await refreshUser();
      setMessage("Perfil actualizado");
    } catch {
      setMessage("No se pudieron guardar los cambios");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full border border-line bg-elev px-3 py-2.5 text-sm text-fg placeholder:text-fg-ter focus:border-volt focus:outline-none";

  if (loading) return <ProfileSkeleton />;

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 font-mono-app text-[10px] tracking-[1.8px] text-volt">IDENTIDAD PROFESIONAL</div>
          <h1 className="text-2xl font-semibold text-fg">Tu perfil</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-sec">Esta información identifica quién atiende al atleta y mantiene consistente tu espacio de trabajo.</p>
        </div>
        <Link href="/portal/configuracion" className="w-fit border border-line px-4 py-2.5 font-mono-app text-[10px] tracking-[1px] text-fg-sec hover:border-volt hover:text-volt">CONFIGURACIÓN →</Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <form onSubmit={save} className="border border-line bg-card p-4 sm:p-6">
          <section>
            <h2 className="mb-4 font-mono-app text-[10px] tracking-[1.4px] text-fg-mid">DATOS PRINCIPALES</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre completo"><input required minLength={2} maxLength={80} value={profile?.name ?? ""} onChange={e => update("name", e.target.value)} className={inputClass} /></Field>
              <Field label="Email"><input value={profile?.email ?? ""} disabled className={`${inputClass} cursor-not-allowed opacity-60`} /><span className="mt-1 block text-[11px] text-fg-ter">El email de acceso no se modifica desde el perfil.</span></Field>
              <Field label="Organización / consultorio"><input required minLength={2} maxLength={100} value={profile?.organizationName ?? ""} onChange={e => update("organizationName", e.target.value)} className={inputClass} /></Field>
              <Field label="Título breve"><input maxLength={120} value={profile?.headline ?? ""} onChange={e => update("headline", e.target.value)} placeholder="Ej. Entrenamiento de fuerza y retorno al deporte" className={inputClass} /></Field>
            </div>
          </section>

          <section className="mt-7 border-t border-line pt-6">
            <h2 className="mb-4 font-mono-app text-[10px] tracking-[1.4px] text-fg-mid">EXPERIENCIA Y CONTACTO</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Teléfono"><input maxLength={30} value={profile?.phone ?? ""} onChange={e => update("phone", e.target.value)} placeholder="+504 0000-0000" className={inputClass} /></Field>
              <Field label="Ubicación"><input maxLength={100} value={profile?.location ?? ""} onChange={e => update("location", e.target.value)} placeholder="Ciudad, país" className={inputClass} /></Field>
              <Field label="Zona horaria"><select value={profile?.timezone ?? "America/Tegucigalpa"} onChange={e => update("timezone", e.target.value)} className={inputClass}>{TIMEZONES.map(zone => <option key={zone}>{zone}</option>)}</select></Field>
              <Field label="Credenciales"><input maxLength={500} value={profile?.credentials ?? ""} onChange={e => update("credentials", e.target.value)} placeholder="Certificaciones, matrícula o especialidad" className={inputClass} /></Field>
              <div className="sm:col-span-2"><Field label="Acerca de tu práctica"><textarea rows={5} maxLength={1200} value={profile?.bio ?? ""} onChange={e => update("bio", e.target.value)} placeholder="Enfoque de trabajo, población que atendés y aspectos relevantes de tu práctica." className={`${inputClass} resize-y`} /><span className="mt-1 block text-right font-mono-app text-[9px] text-fg-ter">{profile?.bio?.length ?? 0}/1200</span></Field></div>
            </div>
          </section>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <span aria-live="polite" className={`font-mono-app text-[11px] ${message === "Perfil actualizado" ? "text-neon" : "text-danger"}`}>{message}</span>
            <button type="submit" disabled={!profile || saving} className="cursor-pointer bg-volt px-5 py-3 font-mono-app text-[11px] font-extrabold tracking-[1px] text-ink hover:brightness-110 disabled:cursor-wait disabled:opacity-60">{saving ? "GUARDANDO…" : "GUARDAR PERFIL"}</button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="border border-line bg-elev p-5">
            <div className="mb-4 flex h-14 w-14 items-center justify-center bg-volt font-mono-app text-xl font-black text-ink">{initials(profile?.name)}</div>
            <div className="text-lg font-semibold text-fg">{profile?.name}</div>
            <div className="mt-1 text-sm text-fg-sec">{profile?.headline || (profile?.role === "coach" ? "Profesional de entrenamiento" : "Profesional de nutrición")}</div>
            <div className="mt-4 border-t border-line pt-4 font-mono-app text-[9px] leading-5 text-fg-ter">ROL EN EL ESPACIO · {(profile?.organizationRole ?? "owner").toUpperCase()}</div>
          </div>
          <div className="border border-line bg-card p-5">
            <div className="flex items-end justify-between"><span className="font-mono-app text-[10px] tracking-[1px] text-fg-mid">PERFIL COMPLETO</span><strong className="text-xl text-volt">{completion}%</strong></div>
            <div className="mt-3 h-1.5 bg-elev"><div className="h-full bg-volt transition-all" style={{ width: `${completion}%` }} /></div>
            <p className="mt-3 text-xs leading-5 text-fg-ter">Completá especialidad, credenciales y presentación para mantener contexto en tu equipo.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block font-mono-app text-[10px] tracking-[.8px] text-fg-sec">{label.toUpperCase()}</span>{children}</label>;
}

function initials(name?: string) {
  return (name ?? "P").split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function ProfileSkeleton() {
  return <div className="mx-auto max-w-5xl animate-pulse p-6"><div className="mb-7 h-8 w-56 bg-card" /><div className="grid gap-5 lg:grid-cols-[1fr_260px]"><div className="h-145 border border-line bg-card" /><div className="h-64 border border-line bg-card" /></div></div>;
}
