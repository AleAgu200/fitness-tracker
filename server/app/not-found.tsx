import type { Metadata } from "next";
import Link from "next/link";

import styles from "./not-found.module.css";

export const metadata: Metadata = {
  title: "Ruta no encontrada",
  description: "Esta ruta no existe en PULSO.",
};

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  );
}

export default function NotFound() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.wordmark} aria-label="PULSO, inicio">
          <svg aria-hidden="true" viewBox="0 0 42 24" fill="none">
            <path d="M1 13h8l3-8 6 17 5-13 3 4h15" />
          </svg>
          <span>PULSO</span>
        </Link>
        <span className={styles.routeStatus}>ESTADO / 404</span>
      </header>

      <section className={styles.errorStage}>
        <div className={styles.errorNumber} aria-hidden="true">404</div>
        <div className={styles.brokenSignal} aria-hidden="true">
          <svg viewBox="0 0 1200 260" preserveAspectRatio="none" fill="none">
            <path className={styles.glow} d="M0 142h238l20-42 34 88 42-126 34 80h162" />
            <path className={styles.line} d="M0 142h238l20-42 34 88 42-126 34 80h162" />
            <path className={styles.glow} d="M688 142h512" />
            <path className={styles.line} d="M688 142h512" />
            <circle cx="608" cy="142" r="6" />
            <circle cx="662" cy="142" r="6" />
          </svg>
        </div>

        <div className={styles.copy}>
          <p>Serie interrumpida</p>
          <h1>Te saliste de la ruta.</h1>
          <p className={styles.body}>
            Esta página no existe o cambió de lugar. Vuelve al inicio y retoma
            desde una ruta que sí está en el plan.
          </p>
          <div className={styles.actions}>
            <Link className={styles.primary} href="/">
              Volver al inicio <ArrowIcon />
            </Link>
            <Link className={styles.secondary} href="/portal">
              Entrar al portal
            </Link>
          </div>
        </div>

        <p className={styles.footerNote}>
          La constancia también es saber cuándo volver al punto correcto.
        </p>
      </section>
    </main>
  );
}
