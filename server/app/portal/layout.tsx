"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { startGoogleSignIn, takeGoogleError } from "./google";
import { api, ApiError, SessionUser } from "./lib";
import { PortalContext } from "./portal-context";
import { PortalTour } from "./portal-tour";
import { ProfessionalSignupWizard } from "./signup-wizard";
import { canAccessPortalPath, canFinishProfessionalSignup, canOpenInMode, homeForMode, portalMode, ProfessionalRole } from "@/lib/portal-access";

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

// ── lightning background, reduced-motion fallback ───────────────────────────
// Four static bolts on a slow CSS fade loop, in a normalized 0–100 space.

const BOLTS = [
  { points: "16,-5 30,20 23,27 44,52 37,59 62,86 55,105", color: "#E8FF59", delay: 0,   period: 4.6, peak: 0.65 },
  { points: "84,-5 68,22 76,30 50,56 58,64 30,90 36,105", color: "#3DDCFF", delay: 1.4, period: 5.4, peak: 0.5 },
  { points: "46,-5 56,24 47,32 60,58 51,66 63,105",       color: "#E8FF59", delay: 2.6, period: 6.2, peak: 0.45 },
  { points: "4,-5 14,30 8,38 20,70 13,78 22,105",         color: "#3DDCFF", delay: 3.4, period: 5.8, peak: 0.4 },
];

function LightningBg() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {BOLTS.map((b, i) => (
        <svg
          key={i}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full opacity-0"
          style={{
            animation: `boltFlash ${b.period}s linear ${b.delay}s infinite`,
            filter: `drop-shadow(0 0 14px ${b.color})`,
            ["--bolt-peak" as string]: b.peak,
          }}
        >
          <polyline
            points={b.points}
            stroke={b.color}
            strokeOpacity={0.2}
            strokeWidth={10}
            vectorEffect="non-scaling-stroke"
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <polyline
            points={b.points}
            stroke={b.color}
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      ))}
    </div>
  );
}

// ── real lightning: procedurally-generated strikes on canvas ───────────────
// Midpoint-displacement bolts with branch forks, striking at random intervals.
// Points live in a normalized 0–100 space, scaled to the canvas each frame.

type Point = [number, number];
interface Strike { id: number; born: number; color: string; main: Point[]; branches: Point[][]; }

function displace(x1: number, y1: number, x2: number, y2: number, mag: number, depth: number, out: Point[]) {
  if (depth <= 0 || mag < 0.6) { out.push([x2, y2]); return; }
  const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * mag;
  const my = (y1 + y2) / 2 + (Math.random() - 0.5) * mag * 0.35;
  displace(x1, y1, mx, my, mag * 0.55, depth - 1, out);
  displace(mx, my, x2, y2, mag * 0.55, depth - 1, out);
}

function makeBolt(): { main: Point[]; branches: Point[][] } {
  const x1 = 10 + Math.random() * 80;
  const y1 = -8;
  const x2 = x1 + (Math.random() - 0.5) * 55;
  const y2 = 70 + Math.random() * 40;
  const main: Point[] = [[x1, y1]];
  displace(x1, y1, x2, y2, 14, 6, main);

  const branches: Point[][] = [];
  const branchCount = 1 + Math.floor(Math.random() * 2);
  for (let b = 0; b < branchCount; b++) {
    const startIdx = 3 + Math.floor(Math.random() * Math.max(1, main.length - 6));
    if (startIdx < 1 || startIdx >= main.length - 1) continue;
    const [sx, sy] = main[startIdx];
    const ex = sx + (Math.random() - 0.5) * 30;
    const ey = sy + 15 + Math.random() * 25;
    const branch: Point[] = [[sx, sy]];
    displace(sx, sy, ex, ey, 8, 4, branch);
    branches.push(branch);
  }
  return { main, branches };
}

/** Real branching lightning that strikes at random intervals, with a background-only shake. */
function LightningStrikes() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let width = 0, height = 0, dpr = 1;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas!.clientWidth;
      height = canvas!.clientHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
    }
    resize();
    window.addEventListener("resize", resize);

    const strikes: Strike[] = [];
    let nextId = 0;
    let nextStrikeAt = performance.now() + 900 + Math.random() * 1400;
    const shake = { x: 0, y: 0, mag: 0 };
    let rafId: number;

    function drawPath(pts: Point[], color: string, alpha: number, lineWidth: number) {
      if (pts.length < 2) return;
      ctx!.save();
      ctx!.globalAlpha = alpha;
      ctx!.strokeStyle = color;
      ctx!.lineWidth = lineWidth;
      ctx!.lineJoin = "round";
      ctx!.lineCap = "round";
      ctx!.shadowColor = color;
      ctx!.shadowBlur = 18;
      ctx!.beginPath();
      pts.forEach(([px, py], i) => {
        const x = (px / 100) * width;
        const y = (py / 100) * height;
        if (i === 0) ctx!.moveTo(x, y); else ctx!.lineTo(x, y);
      });
      ctx!.stroke();
      ctx!.restore();
    }

    function frame(now: number) {
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, width, height);

      if (now >= nextStrikeAt) {
        const { main, branches } = makeBolt();
        strikes.push({ id: nextId++, born: now, color: Math.random() < 0.5 ? "#E8FF59" : "#3DDCFF", main, branches });
        shake.mag = 3.2;
        nextStrikeAt = now + 1800 + Math.random() * 3400;
      }

      for (let i = strikes.length - 1; i >= 0; i--) {
        if (now - strikes[i].born > 620) strikes.splice(i, 1);
      }
      for (const s of strikes) {
        const age = now - s.born;
        let alpha: number;
        if (age < 40) alpha = age / 40;
        else if (age < 90) alpha = 1;
        else if (age < 160) alpha = 0.35 + Math.random() * 0.5; // flicker, like a real strike
        else alpha = Math.max(0, 1 - (age - 160) / 380) * 0.7;
        drawPath(s.main, s.color, alpha, 2.4);
        for (const br of s.branches) drawPath(br, s.color, alpha * 0.6, 1.3);
      }

      if (shake.mag > 0.02) {
        shake.x = (Math.random() - 0.5) * shake.mag;
        shake.y = (Math.random() - 0.5) * shake.mag * 0.6;
        shake.mag *= 0.82;
      } else {
        shake.x = 0; shake.y = 0; shake.mag = 0;
      }
      canvas!.style.transform = `translate(${shake.x}px, ${shake.y}px)`;

      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}

// ── login success: a bright flash masks the swap into the authenticated shell ──

function PowerSurgeFlash({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[100]"
      style={{ background: "#E8FF59", animation: "surgeFlash 620ms ease-out forwards" }}
    />
  );
}

// ── login ────────────────────────────────────────────────────────────────────

type Discipline = "coach" | "nutritionist";

function DisciplinePicker({ value, onChange }: { value: Discipline; onChange: (value: Discipline) => void }) {
  return (
    <div className="mb-3 grid grid-cols-2 gap-2" role="group" aria-label="Disciplina profesional">
      {(["coach", "nutritionist"] as const).map(option => (
        <button key={option} type="button" onClick={() => onChange(option)} aria-pressed={value === option} className={`cursor-pointer border px-3 py-3 text-left transition ${value === option ? "border-volt bg-card text-fg" : "border-line bg-elev text-fg-sec hover:border-fg-ter"}`}>
          <span className="block font-mono-app text-[10px] tracking-[1px] text-volt">{option === "coach" ? "ENTRENAMIENTO" : "NUTRICIÓN"}</span>
          <span className="mt-1 block text-sm">{option === "coach" ? "Entrenador/a" : "Nutricionista"}</span>
        </button>
      ))}
    </div>
  );
}

/** The second half of a Google sign-up: the account exists, the workspace doesn't yet. */
function FinishSignup({ user, onDone, onCancel }: { user: SessionUser; onDone: () => void; onCancel: () => void }) {
  const [discipline, setDiscipline] = useState<Discipline>("coach");
  const [organizationName, setOrganizationName] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [requiresCode, setRequiresCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ requiresCode: boolean }>("/api/portal/signup")
      .then(result => setRequiresCode(result.requiresCode))
      .catch(() => undefined);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/portal/signup", {
        method: "PUT",
        body: JSON.stringify({ discipline, organizationName, signupCode }),
      });
      onDone();
    } catch (cause) {
      const status = cause instanceof Error ? cause.message : "";
      setError(status === "403" && requiresCode
        ? "El código de registro no es válido"
        : "No se pudo crear tu espacio profesional. Probá de nuevo");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-105 px-5 py-[8vh]">
      <img src="/brand/pulso-mark.png" alt="PULSO" width={48} height={32} className="mb-4 block" />
      <div className="mb-2.5 font-mono-app text-[11px] tracking-[2.4px] text-volt">PULSO · PORTAL PROFESIONAL</div>
      <h1 className="mb-2 text-[28px] font-semibold text-fg">Completá tu cuenta</h1>
      <p className="mb-6 text-sm leading-6 text-fg-sec">Entraste con Google como {user.email}. Elegí tu disciplina para crear tu espacio profesional.</p>
      <DisciplinePicker value={discipline} onChange={setDiscipline} />
      <input value={organizationName} onChange={e => setOrganizationName(e.target.value)} maxLength={100} placeholder="Nombre de tu consultorio o equipo (opcional)" className="mb-3 w-full border border-line bg-elev p-3 text-sm text-fg placeholder:text-fg-ter focus:border-volt focus:outline-none" />
      {requiresCode && <input required value={signupCode} onChange={e => setSignupCode(e.target.value)} placeholder="Código de registro profesional" className="mb-3 w-full border border-line bg-elev p-3 text-sm text-fg placeholder:text-fg-ter focus:border-volt focus:outline-none" />}
      {error && <div className="mb-3 font-mono-app text-xs text-danger">{error}</div>}
      <button type="submit" disabled={busy} className="w-full cursor-pointer bg-volt p-3.5 font-mono-app text-xs font-extrabold tracking-[1px] text-ink transition hover:brightness-110 disabled:opacity-60">
        {busy ? "PROCESANDO…" : "CREAR MI ESPACIO"}
      </button>
      <button type="button" onClick={onCancel} className="mt-4 w-full cursor-pointer py-2 text-sm text-fg-sec hover:text-volt">
        Usar otra cuenta
      </button>
    </form>
  );
}

/** Sign in without a password: the email carries a one-time link back to /portal. */
function MagicLinkForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/sign-in/magic-link", {
        method: "POST",
        body: JSON.stringify({ email, callbackURL: "/portal", errorCallbackURL: "/portal" }),
      });
      setSentTo(email);
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 429
        ? "Pediste varios enlaces seguidos. Esperá unos minutos y revisá tu correo."
        : "No se pudo enviar el enlace. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div className="relative z-10 mx-auto max-w-105 px-5 py-[8vh]">
        <img src="/brand/pulso-mark.png" alt="PULSO" width={48} height={32} className="mb-4 block" />
        <div className="mb-2.5 font-mono-app text-[11px] tracking-[2.4px] text-volt">PULSO · PORTAL PROFESIONAL</div>
        <h1 className="mb-2 text-[28px] font-semibold text-fg">Revisá tu correo</h1>
        <p className="mb-6 text-sm leading-6 text-fg-sec">
          Si {sentTo} tiene una cuenta, le llega un enlace para entrar. Vence en 10 minutos y sirve una sola vez.
          Abrilo en este mismo navegador.
        </p>
        <button type="button" onClick={() => setSentTo(null)} className="w-full cursor-pointer border border-line p-3 font-mono-app text-xs text-fg-sec hover:border-fg-ter hover:text-fg">
          USAR OTRO CORREO
        </button>
        <button type="button" onClick={onBack} className="mt-4 w-full cursor-pointer py-2 text-sm text-fg-sec hover:text-volt">Volver a ingresar con contraseña</button>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="relative z-10 mx-auto max-w-105 px-5 py-[8vh]">
      <img src="/brand/pulso-mark.png" alt="PULSO" width={48} height={32} className="mb-4 block" />
      <div className="mb-2.5 font-mono-app text-[11px] tracking-[2.4px] text-volt">PULSO · PORTAL PROFESIONAL</div>
      <h1 className="mb-2 text-[28px] font-semibold text-fg">Entrar con un enlace</h1>
      <p className="mb-6 text-sm leading-6 text-fg-sec">Te enviamos un enlace de acceso. Sin contraseña.</p>
      <input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" className="mb-3 w-full border border-line bg-elev p-3 text-sm text-fg placeholder:text-fg-ter focus:border-volt focus:outline-none" />
      {error && <div role="alert" className="mb-3 font-mono-app text-xs text-danger">{error}</div>}
      <button type="submit" disabled={busy} className="w-full cursor-pointer bg-volt p-3.5 font-mono-app text-xs font-extrabold tracking-[1px] text-ink transition hover:brightness-110 disabled:opacity-60">
        {busy ? "ENVIANDO…" : "ENVIARME EL ENLACE"}
      </button>
      <button type="button" onClick={onBack} className="mt-4 w-full cursor-pointer py-2 text-sm text-fg-sec hover:text-volt">Volver a ingresar con contraseña</button>
    </form>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"login" | "signup" | "magic">("login");
  const [magicEnabled, setMagicEnabled] = useState(false);
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [requiresCode, setRequiresCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [charging, setCharging] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    api<{ requiresCode: boolean; google?: boolean; magicLink?: boolean; requiresApproval?: boolean }>("/api/portal/signup")
      .then(result => {
        setRequiresCode(result.requiresCode);
        setRequiresApproval(result.requiresApproval !== false);
        setGoogleEnabled(Boolean(result.google));
        setMagicEnabled(Boolean(result.magicLink));
      })
      .catch(() => undefined);
    // Coming back from Google or a magic link with an error (expired, unlinked…).
    const returnError = takeGoogleError();
    if (returnError) setError(returnError);
  }, []);

  async function signInWithGoogle() {
    setBusy(true);
    setError(null);
    try {
      await startGoogleSignIn("/portal");
    } catch {
      setError("No se pudo abrir el acceso con Google. Probá de nuevo.");
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email, password }) });
      if (reducedMotion) {
        onDone();
      } else {
        setCharging(true);
        window.setTimeout(onDone, 320);
      }
    } catch (cause) {
      const suspended = cause instanceof ApiError && cause.body?.code === "ACCOUNT_SUSPENDED";
      setError(suspended
        ? "Tu cuenta está suspendida. Respondé el correo que te enviamos para más información."
        : cause instanceof ApiError && cause.status === 429
          ? "Demasiados intentos. Esperá unos minutos."
          : "Email o contraseña incorrectos");
      setBusy(false);
    }
  }

  const backToLogin = () => { setMode("login"); setError(null); };

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {reducedMotion ? <LightningBg /> : <LightningStrikes />}
      {mode === "signup" ? (
        <ProfessionalSignupWizard
          requiresCode={requiresCode}
          requiresApproval={requiresApproval}
          googleEnabled={googleEnabled}
          onDone={onDone}
          onGoogle={() => void signInWithGoogle()}
          onBack={backToLogin}
        />
      ) : mode === "magic" ? (
        <MagicLinkForm onBack={backToLogin} />
      ) : (
        <form onSubmit={submit} className="relative z-10 mx-auto max-w-105 px-5 py-[8vh]">
          <img src="/brand/pulso-mark.png" alt="PULSO" width={48} height={32} className="mb-4 block" />
          <div className="mb-2.5 font-mono-app text-[11px] tracking-[2.4px] text-volt">PULSO · PORTAL PROFESIONAL</div>
          <h1 className="mb-2 text-[28px] font-semibold text-fg">Ingresar</h1>
          <p className="mb-6 text-sm leading-6 text-fg-sec">Accedé a tu espacio de trabajo clínico.</p>
          <input required value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="tu@email.com" className="mb-3 w-full border border-line bg-elev p-3 text-sm text-fg placeholder:text-fg-ter focus:border-volt focus:outline-none" />
          <input required minLength={6} value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="Contraseña" className="mb-3 w-full border border-line bg-elev p-3 text-sm text-fg placeholder:text-fg-ter focus:border-volt focus:outline-none" />
          {error && <div role="alert" className="mb-3 font-mono-app text-xs text-danger">{error}</div>}
          <button
            type="submit"
            disabled={busy}
            className={`w-full cursor-pointer bg-volt p-3.5 font-mono-app text-xs font-extrabold tracking-[1px] text-ink transition hover:brightness-110 disabled:opacity-60 ${
              charging ? "animate-[chargeUp_320ms_ease-out_forwards]" : ""
            }`}
          >
            {busy ? "PROCESANDO…" : "INGRESAR"}
          </button>
          <a href="/cuenta/recuperar" className="mt-2 block py-1 text-center text-xs text-fg-ter hover:text-fg-sec">¿Olvidaste tu contraseña?</a>
          {(googleEnabled || magicEnabled) && (
            <div className="my-4 flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-line" />
              <span className="font-mono-app text-[9px] tracking-[1.4px] text-fg-ter">O</span>
              <span className="h-px flex-1 bg-line" />
            </div>
          )}
          {googleEnabled && (
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              disabled={busy}
              className="flex w-full cursor-pointer items-center justify-center gap-2.5 border border-[#747775] bg-white p-3 text-sm font-semibold text-[#1F1F1F] transition hover:bg-[#f2f2f2] disabled:opacity-60"
            >
              <span aria-hidden className="text-base font-bold">G</span>
              Continuar con Google
            </button>
          )}
          {magicEnabled && (
            <button type="button" onClick={() => { setMode("magic"); setError(null); }} className="mt-3 w-full cursor-pointer border border-line p-3 font-mono-app text-[11px] tracking-[1px] text-fg-sec transition hover:border-fg-ter hover:text-fg">
              ENTRAR CON UN ENLACE POR CORREO
            </button>
          )}
          <button type="button" onClick={() => { setMode("signup"); setError(null); }} className="mt-4 w-full cursor-pointer py-2 text-sm text-fg-sec hover:text-volt">
            ¿Primera vez? Crear cuenta profesional
          </button>
        </form>
      )}
    </div>
  );
}

// ── nav ──────────────────────────────────────────────────────────────────────

const NAV = [
  { href: "/portal/atencion", label: "ATENCIÓN", icon: "⚡" },
  { href: "/portal/atletas", label: "ATLETAS", icon: "◆" },
  { href: "/portal/equipo", label: "EQUIPO", icon: "⬡" },
  { href: "/portal/alimentos", label: "ALIMENTOS", icon: "✚" },
  { href: "/portal/ejercicios", label: "EJERCICIOS", icon: "▲" },
];

const ADMIN_NAV = [
  { href: "/portal/admin", label: "RESUMEN", icon: "◎" },
  { href: "/portal/admin/usuarios", label: "USUARIOS", icon: "◇" },
  { href: "/portal/admin/profesionales", label: "PROFESIONALES", icon: "✓" },
  { href: "/portal/admin/reportes", label: "REPORTES", icon: "!" },
  { href: "/portal/admin/suscripciones", label: "SUSCRIPCIONES", icon: "$" },
  { href: "/portal/admin/ejercicios", label: "CATÁLOGO EJERCICIOS", icon: "▲" },
  { href: "/portal/admin/alimentos", label: "CATÁLOGO ALIMENTOS", icon: "✚" },
  { href: "/portal/admin/actividad", label: "ACTIVIDAD", icon: "≡" },
];

const PENDING_NAV = [
  { href: "/portal/revision", label: "TU SOLICITUD", icon: "◷" },
];

const ACCOUNT_NAV = [
  { href: "/portal/perfil", label: "PERFIL" },
  { href: "/portal/configuracion", label: "CONFIGURACIÓN" },
];

interface PortalMe {
  role: string;
  storedRole: string;
  professionalStatus: string | null;
  isSuperAdmin: boolean;
}

function isActive(pathname: string, href: string): boolean {
  // The admin home is a prefix of every admin route; match it exactly.
  return href === "/portal/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** A professional sign-up the PULSO team declined. The account itself keeps working in the app. */
function RejectedNotice({ email, onLogout }: { email: string; onLogout: () => void }) {
  return (
    <div className="mx-auto mt-[14vh] max-w-115 px-5">
      <div className="mb-2.5 font-mono-app text-[11px] tracking-[2.4px] text-danger">SOLICITUD NO APROBADA</div>
      <h1 className="mb-3 text-[26px] font-semibold text-fg">No pudimos aprobar tu cuenta profesional</h1>
      <p className="mb-2 text-sm leading-6 text-fg-sec">Te enviamos el motivo a {email}. Si podés aportar más información (título, certificaciones, experiencia), respondé ese correo y volvemos a revisarla.</p>
      <p className="mb-6 text-sm leading-6 text-fg-sec">Tu cuenta sigue activa en la app de PULSO como atleta.</p>
      <button type="button" onClick={onLogout} className="cursor-pointer border border-line px-5 py-2.5 font-mono-app text-xs text-fg-sec hover:border-danger hover:text-danger">CERRAR SESIÓN</button>
    </div>
  );
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [surging, setSurging] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const reducedMotion = useReducedMotion();

  const loadSession = useCallback(async () => {
    try {
      const data = await api<{ user?: SessionUser } | null>("/api/auth/get-session");
      if (!data?.user) { setUser(null); return; }
      // The session carries the stored role; access follows the effective one.
      const me = await api<PortalMe>("/api/portal/me");
      setUser({ ...data.user, ...me });
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => { loadSession(); }, [loadSession]);
  const mode = user ? portalMode({
    role: user.role ?? "athlete",
    storedRole: user.storedRole ?? user.role ?? "athlete",
    professionalStatus: user.professionalStatus ?? null,
    isSuperAdmin: Boolean(user.isSuperAdmin),
  }) : null;
  const routeAllowed = Boolean(user && mode && canOpenInMode(mode, user.role ?? "athlete", pathname, Boolean(user.isSuperAdmin)));

  useEffect(() => {
    if (!user || !mode || mode === "none" || mode === "rejected" || routeAllowed) return;
    router.replace(mode === "professional" && pathname.startsWith("/portal/ejercicios") ? "/portal/alimentos" : homeForMode(mode));
  }, [mode, pathname, routeAllowed, router, user]);

  /** Bridges Login unmounting into the authenticated shell mounting: the flash
      (rendered here, outside either branch) survives the swap and masks the cut. */
  const completeLogin = useCallback(() => {
    if (reducedMotion) {
      loadSession();
      return;
    }
    setSurging(true);
    window.setTimeout(() => {
      const withNewSession = "startViewTransition" in document
        ? () => (document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(loadSession)
        : loadSession;
      withNewSession();
    }, 160);
    window.setTimeout(() => setSurging(false), 700);
  }, [loadSession, reducedMotion]);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/sign-out", { method: "POST", body: "{}" });
    } catch {
      // session may already be gone
    }
    setUser(null);
  }, []);

  let content: React.ReactNode = null;
  if (user === undefined) {
    content = null;
  } else if (!user) {
    content = <Login onDone={completeLogin} />;
  } else if (mode === "none" && user.createdAt
    && canFinishProfessionalSignup(user.storedRole ?? user.role ?? "athlete", new Date(user.createdAt))) {
    content = <FinishSignup user={user} onDone={loadSession} onCancel={logout} />;
  } else if (mode === "rejected") {
    content = <RejectedNotice email={user.email} onLogout={logout} />;
  } else if (mode === "none") {
    content = (
      <div className="mx-auto mt-[16vh] max-w-115 px-5 text-center">
        <img src="/brand/pulso-mark.png" alt="PULSO" width={48} height={32} className="mb-4 block" />
        <div className="mb-2.5 font-mono-app text-[11px] tracking-[2.4px] text-volt">PULSO · PORTAL PROFESIONAL</div>
        <p className="mb-2 text-lg font-semibold text-fg">{user.email} es una cuenta de atleta</p>
        <p className="text-sm leading-6 text-fg-sec">El portal es para entrenadores y nutricionistas. Tu progreso, planes y mensajes están en la app de PULSO. Si sos profesional, creá una cuenta profesional con otro correo o escribinos para convertir esta.</p>
        <button type="button" onClick={logout} className="mt-6 cursor-pointer border border-line px-5 py-2.5 font-mono-app text-xs text-fg-sec hover:border-danger hover:text-danger">
          CERRAR SESIÓN
        </button>
      </div>
    );
  } else {
    const role = (mode === "professional" ? user.role : "coach") as ProfessionalRole;
    const visibleNav = mode === "professional" ? NAV.filter(item => canAccessPortalPath(role, item.href))
      : mode === "pending" ? PENDING_NAV : [];
    const adminNav = user.isSuperAdmin ? ADMIN_NAV : [];
    const accountNav = mode === "professional" ? ACCOUNT_NAV : mode === "pending" ? ACCOUNT_NAV.slice(0, 1) : [];
    const roleLabel = mode === "admin" ? "SUPER ADMIN"
      : mode === "pending" ? "EN REVISIÓN"
        : user.role === "coach" ? "ENTRENADOR" : "NUTRICIONISTA";
    const mobileNav = [...visibleNav, ...adminNav];
    content = (
      <PortalContext.Provider value={{ user, logout, refreshUser: loadSession }}>
        <div className="min-h-screen md:flex md:h-screen">
          {/* sidebar */}
          <aside className="hidden w-60 shrink-0 flex-col border-r border-line md:flex">
            <div className="border-b border-line p-4.5">
              <img src="/brand/pulso-mark.png" alt="PULSO" width={42} height={28} className="mb-3 block" />
              <div className={`mb-1.5 font-mono-app text-[10px] tracking-[2px] ${mode === "pending" ? "text-warn" : "text-volt"}`}>
                PULSO · {roleLabel}{mode === "professional" && user.isSuperAdmin ? " · ADMIN" : ""}
              </div>
              <div className="font-semibold text-fg">{user.name}</div>
              <div className="font-mono-app text-[10px] text-fg-ter">{user.email}</div>
            </div>

            <nav className="flex-1 overflow-y-auto py-2">
              {visibleNav.map(item => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 border-l-3 px-4.5 py-3 font-mono-app text-[11px] tracking-[1.4px] transition ${
                      active
                        ? "border-volt bg-card text-volt"
                        : "border-transparent text-fg-sec hover:bg-card hover:text-fg"
                    }`}
                  >
                    <span aria-hidden>{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
              {adminNav.length > 0 && (
                <>
                  <div className={`px-4.5 pb-1.5 font-mono-app text-[9px] tracking-[1.8px] text-fg-ter ${visibleNav.length ? "mt-4 border-t border-line-soft pt-4" : "pt-2"}`}>ADMINISTRACIÓN</div>
                  {adminNav.map(item => {
                    const active = isActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-3 border-l-3 px-4.5 py-2.5 font-mono-app text-[10.5px] tracking-[1.2px] transition ${
                          active ? "border-neon bg-card text-neon" : "border-transparent text-fg-sec hover:bg-card hover:text-fg"
                        }`}
                      >
                        <span aria-hidden className="w-3 text-center">{item.icon}</span>
                        {item.label}
                      </Link>
                    );
                  })}
                </>
              )}
            </nav>

            <nav className="border-t border-line py-2">
              {accountNav.map(item => {
                const active = pathname === item.href;
                return (
                  <Link key={item.href} href={item.href} className={`block px-4.5 py-2.5 font-mono-app text-[10px] tracking-[1.2px] transition ${active ? "text-volt" : "text-fg-sec hover:text-fg"}`}>
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <button
              type="button"
              onClick={logout}
              className="m-3.5 cursor-pointer border border-line px-4 py-2.5 font-mono-app text-[11px] tracking-[1px] text-fg-sec transition hover:border-danger hover:text-danger"
            >
              CERRAR SESIÓN →
            </button>
          </aside>

          <div className="min-w-0 flex-1 md:overflow-y-auto">
            <header className="sticky top-0 z-40 border-b border-line bg-ink/95 md:hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <img src="/brand/pulso-mark.png" alt="PULSO" width={36} height={24} className="block" />
                  <div>
                    <div className="font-mono-app text-[9px] tracking-[1.8px] text-volt">PULSO · {roleLabel}</div>
                    <div className="text-sm font-semibold text-fg">{user.name}</div>
                  </div>
                </div>
                {accountNav.length > 0
                  ? <Link href="/portal/perfil" className="border border-line px-3 py-2 font-mono-app text-[10px] text-fg-sec">PERFIL</Link>
                  : <button type="button" onClick={logout} className="cursor-pointer border border-line px-3 py-2 font-mono-app text-[10px] text-fg-sec">SALIR</button>}
              </div>
              <nav className="flex overflow-x-auto border-t border-line-soft px-2">
                {mobileNav.map(item => {
                  const active = isActive(pathname, item.href);
                  return <Link key={item.href} href={item.href} className={`shrink-0 border-b-2 px-3 py-2.5 font-mono-app text-[9px] tracking-[1px] ${active ? "border-volt text-volt" : "border-transparent text-fg-ter"}`}>{item.label}</Link>;
                })}
              </nav>
            </header>
            <main className="min-w-0">{routeAllowed ? children : <div className="p-8 font-mono-app text-xs text-fg-ter">ABRIENDO…</div>}</main>
            {mode === "professional" && <PortalTour userId={user.id} role={user.role ?? "coach"} />}
          </div>
        </div>
      </PortalContext.Provider>
    );
  }

  return (
    <>
      {content}
      <PowerSurgeFlash active={surging} />
    </>
  );
}
