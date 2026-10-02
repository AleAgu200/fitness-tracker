"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "../lib";
import { usePortalUser } from "../portal-context";

interface Profile {
  name: string;
  role: "coach" | "nutritionist";
  headline: string | null;
  bio: string | null;
  phone: string | null;
  location: string | null;
  credentials: string | null;
  organizationName: string | null;
}

type StepState = "done" | "current" | "todo";

function Step({ index, state, title, children }: { index: number; state: StepState; title: string; children: React.ReactNode }) {
  const marker = state === "done" ? "border-volt bg-volt text-ink" : state === "current" ? "border-warn text-warn" : "border-line text-fg-ter";
  return (
    <li className="relative flex gap-4 pb-7 last:pb-0">
      <span aria-hidden className="absolute left-[15px] top-8 bottom-0 w-px bg-line last:hidden" />
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center border font-mono-app text-[11px] ${marker}`}>
        {state === "done" ? "✓" : index}
      </span>
      <div className="pt-1">
        <div className={`text-[15px] font-semibold ${state === "todo" ? "text-fg-sec" : "text-fg"}`}>
          {title}
          {state === "current" && <span className="ml-2 font-mono-app text-[9.5px] tracking-[1px] text-warn">EN CURSO</span>}
        </div>
        <div className="mt-1 text-sm leading-6 text-fg-sec">{children}</div>
      </div>
    </li>
  );
}

/** Where a professional waits between signing up and being approved. */
export default function ReviewStatusPage() {
  const { user, refreshUser } = usePortalUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    api<{ profile: Profile }>("/api/portal/profile").then(result => setProfile(result.profile)).catch(() => undefined);
  }, []);

  const missing = profile
    ? [
        !profile.headline && "titular",
        !profile.bio && "presentación",
        !profile.credentials && "credenciales",
        !profile.location && "ubicación",
      ].filter(Boolean) as string[]
    : [];
  const profileReady = profile != null && missing.length === 0;
  const discipline = (user.storedRole ?? profile?.role) === "nutritionist" ? "nutricionista" : "entrenador/a";

  async function checkAgain() {
    setChecking(true);
    await refreshUser();
    setChecking(false);
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-10 md:px-8">
      <div className="mb-2 font-mono-app text-[11px] tracking-[2.4px] text-warn">SOLICITUD EN REVISIÓN</div>
      <h1 className="text-[28px] font-semibold leading-tight text-fg">Hola {user.name.split(" ")[0]}, estamos revisando tu cuenta de {discipline}</h1>
      <p className="mt-3 text-sm leading-6 text-fg-sec">
        Verificamos a cada profesional antes de que pueda ver datos de atletas. Suele tomar menos de un día hábil.
        Te escribimos a <span className="text-fg">{user.email}</span> apenas tengamos una respuesta.
      </p>

      <ol className="mt-9">
        <Step index={1} state="done" title="Cuenta creada">Tu acceso ya funciona con el método que elegiste.</Step>
        <Step index={2} state={profileReady ? "done" : "current"} title="Perfil profesional">
          {profileReady ? "Completo. Es lo que verán tus atletas y lo que usamos para verificarte." : (
            <>
              Un perfil completo agiliza la revisión.{profile && <> Falta: {missing.join(", ")}.</>}
              <Link href="/portal/perfil" className="mt-2 block font-mono-app text-[11px] tracking-[1px] text-volt hover:underline">COMPLETAR PERFIL →</Link>
            </>
          )}
        </Step>
        <Step index={3} state={profileReady ? "current" : "todo"} title="Revisión del equipo PULSO">
          Confirmamos identidad y credenciales. Si necesitamos algo más, te lo pedimos por correo.
        </Step>
        <Step index={4} state="todo" title="Tu espacio de trabajo">
          Invitás atletas, armás planes y das seguimiento desde aquí.
        </Step>
      </ol>

      <div className="mt-10 border border-line bg-card p-4">
        <div className="font-mono-app text-[10px] tracking-[1.4px] text-fg-sec">MIENTRAS TANTO</div>
        <ul className="mt-2 space-y-1.5 text-sm text-fg-mid">
          <li>· Prepará tu titular y una presentación breve: es lo primero que leen tus atletas.</li>
          <li>· Si trabajás en equipo, tené a mano los correos de tus colegas para invitarlos después.</li>
          <li>· Tu cuenta también funciona en la app de PULSO para tu propio entrenamiento.</li>
        </ul>
      </div>

      <button type="button" onClick={() => void checkAgain()} disabled={checking} className="mt-6 cursor-pointer border border-line px-4 py-2.5 font-mono-app text-[11px] tracking-[1px] text-fg-sec transition hover:border-fg-ter hover:text-fg disabled:opacity-50">
        {checking ? "COMPROBANDO…" : "¿YA TE APROBARON? COMPROBAR"}
      </button>
    </div>
  );
}
