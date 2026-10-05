import Link from "next/link";
import type { ReactNode } from "react";

/** Readable frame for the public legal pages (privacy, terms, account deletion). */
export function LegalShell({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-ink px-4 py-12">
      <article className="mx-auto w-full max-w-3xl">
        <Link href="/" className="font-mono-app text-[11px] tracking-[0.2em] text-volt">PULSO</Link>
        <h1 className="mt-3 text-3xl font-semibold text-fg" style={{ fontFamily: "var(--font-pulso-display)" }}>{title}</h1>
        <p className="mt-2 font-mono-app text-[11px] tracking-[0.12em] text-fg-ter">ÚLTIMA ACTUALIZACIÓN · {updated}</p>
        <div className="legal mt-8 space-y-6 text-[15px] leading-7 text-fg-mid">{children}</div>
        <nav className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-6 font-mono-app text-[11px] tracking-[0.12em] text-fg-sec">
          <Link href="/privacidad">PRIVACIDAD</Link>
          <Link href="/terminos">TÉRMINOS</Link>
          <Link href="/eliminar-cuenta">BORRAR MI CUENTA</Link>
          <a href="mailto:pulso@pulsofitness.tech">PULSO@PULSOFITNESS.TECH</a>
        </nav>
      </article>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      {children}
    </section>
  );
}
