import type { ReactNode } from "react";

/** Minimal frame for the pages email links open: one message, one action. */
export function AccountShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12 bg-ink">
      <div className="w-full max-w-md border border-line bg-card p-6 sm:p-8">
        <p className="font-mono-app text-[11px] tracking-[0.2em] text-volt mb-3">PULSO</p>
        <h1 className="text-2xl font-semibold text-fg mb-4" style={{ fontFamily: "var(--font-pulso-display)" }}>{title}</h1>
        {children}
      </div>
    </main>
  );
}
