import Link from "next/link";

import styles from "./page.module.css";

function PulseMark({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={compact ? styles.markCompact : styles.mark}
      viewBox="0 0 42 24"
      fill="none"
    >
      <path d="M1 13h8l3-8 6 17 5-13 3 4h15" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="m3 8 3 3 7-7" />
    </svg>
  );
}

const daySteps = [
  {
    time: "06:10",
    title: "Entrena con intención",
    copy: "Series, cargas, repeticiones y descansos. El plan está listo antes de que llegues al gym.",
    color: "volt",
  },
  {
    time: "12:40",
    title: "Come dentro del plan",
    copy: "Registra lo que comes, sigue tus objetivos y deja una nota cuando la vida exige un cambio.",
    color: "cyan",
  },
  {
    time: "21:30",
    title: "Cierra el día con evidencia",
    copy: "Peso, medidas y check-in. Menos memoria selectiva; más contexto para ajustar mañana.",
    color: "orange",
  },
];

const professionalTools = [
  ["Plantillas", "Crea entrenamientos y asígnalos sin rehacer el trabajo."],
  ["Adherencia", "Lee tendencias y resúmenes sin invadir el registro privado."],
  ["Nutrición", "Entrega planes de comida claros y fáciles de seguir."],
  ["Mensajes", "Da contexto dentro del mismo sistema donde sucede el trabajo."],
];

export default function Home() {
  return (
    <main className={styles.page}>
      <a className={styles.skipLink} href="#contenido">
        Saltar al contenido
      </a>

      <header className={styles.header}>
        <Link className={styles.wordmark} href="/" aria-label="PULSO, inicio">
          <PulseMark compact />
          <span>PULSO</span>
        </Link>

        <nav className={styles.nav} aria-label="Navegación principal">
          <a href="#sistema">El sistema</a>
          <a href="#privacidad">Tus datos</a>
          <a href="#profesionales">Profesionales</a>
        </nav>

        <Link className={styles.headerCta} href="/portal">
          Entrar al portal
          <ArrowIcon />
        </Link>
      </header>

      <section className={styles.hero} id="contenido">
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <p className={styles.heroSignal}>
              <span /> Un sistema para el día real
            </p>
            <h1>
              Entrena como la persona que dijiste que <em>serías.</em>
            </h1>
            <p className={styles.heroBody}>
              PULSO reúne tu entrenamiento, nutrición, mediciones y la guía de
              profesionales reales. Funciona sin señal. Tus datos completos se
              quedan contigo.
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primaryCta} href="#sistema">
                Ver cómo funciona
                <ArrowIcon />
              </a>
              <Link className={styles.textCta} href="/portal">
                Soy profesional
              </Link>
            </div>
            <p className={styles.accessNote}>
              PULSO se habilita a través de tu coach o nutricionista.
            </p>
          </div>

          <div className={styles.deviceStage} aria-label="Vista previa de la aplicación PULSO">
            <div className={styles.stagePulse} aria-hidden="true">
              <svg viewBox="0 0 720 280" preserveAspectRatio="none" fill="none">
                <path className={styles.pulseGlow} d="M0 156h108l20-46 34 92 42-136 34 90h86l16-31 30 59 34-28h316" />
                <path className={styles.pulseCore} d="M0 156h108l20-46 34 92 42-136 34 90h86l16-31 30 59 34-28h316" />
              </svg>
            </div>

            <div className={styles.phone}>
              <div className={styles.phoneTop}>
                <span>06:08</span>
                <span className={styles.dynamicIsland} />
                <span>84%</span>
              </div>
              <div className={styles.phoneHeader}>
                <div>
                  <span>HOY · SÁB 15</span>
                  <strong>Buenos días, Alex.</strong>
                </div>
                <span className={styles.avatar}>AL</span>
              </div>

              <div className={styles.readinessRow}>
                <div className={styles.readinessScore}>
                  <span className={styles.scoreRing}>82</span>
                  <div>
                    <small>DISPOSICIÓN</small>
                    <strong>Listo para entrenar</strong>
                  </div>
                </div>
                <span className={styles.liveDot}>EN LÍNEA</span>
              </div>

              <div className={styles.workoutPanel}>
                <div className={styles.panelMeta}>
                  <span>FUERZA · PIERNA A</span>
                  <span>55 MIN</span>
                </div>
                <strong>El trabajo de hoy</strong>
                <div className={styles.exerciseLine}>
                  <span>Sentadilla trasera</span>
                  <b>4 × 6</b>
                </div>
                <div className={styles.progressTrack}><span /></div>
                <div className={styles.panelFooter}>
                  <span>2 de 7 ejercicios</span>
                  <span>Continuar →</span>
                </div>
              </div>

              <div className={styles.dailyStats}>
                <div><span>COMIDAS</span><strong>2 / 4</strong></div>
                <div><span>AGUA</span><strong>1.8 L</strong></div>
                <div><span>RACHA</span><strong>11 días</strong></div>
              </div>

              <div className={styles.phoneNav}>
                <span className={styles.activeNav}><i />Hoy</span>
                <span><i />Entrenar</span>
                <span><i />Progreso</span>
              </div>
            </div>

            <div className={styles.coachNote}>
              <div className={styles.noteTop}>
                <span className={styles.noteAvatar}>C</span>
                <div><strong>Tu coach</strong><small>Hoy, 07:14</small></div>
                <span className={styles.noteStatus} />
              </div>
              <p>Controla la bajada. No regales la última repetición.</p>
              <span className={styles.sampleLabel}>EJEMPLO DE MENSAJE</span>
            </div>

            <div className={styles.offlineTag}>
              <span className={styles.offlineIcon}>↯</span>
              <div><strong>Sin señal</strong><small>Todo sigue guardándose</small></div>
            </div>
          </div>
        </div>

        <div className={styles.capabilityRail} aria-label="Capacidades principales">
          <span>Entrenamiento</span>
          <i />
          <span>Nutrición</span>
          <i />
          <span>Check-ins</span>
          <i />
          <span>Mediciones</span>
          <i />
          <span>Guía profesional</span>
        </div>
      </section>

      <section className={styles.systemSection} id="sistema">
        <div className={styles.sectionHeading} aria-label="La diferencia entre entrenar con información dispersa y usar PULSO">
          <div className={styles.comparisonPulse} aria-hidden="true">
            <svg viewBox="0 0 1400 160" preserveAspectRatio="none" fill="none">
              <path
                className={styles.brokenPulse}
                d="M0 84h94m34 0h118m42 0h76m52 0h126m46 0h112"
              />
              <path
                className={styles.strongPulseGlow}
                d="M700 84h78l20-20 22 43 31-91 34 68h54l18-28 24 54 30-94 33 68h64l17-18 19 36 25-66 27 48h204"
              />
              <path
                className={styles.strongPulse}
                d="M700 84h78l20-20 22 43 31-91 34 68h54l18-28 24 54 30-94 33 68h64l17-18 19 36 25-66 27 48h204"
              />
              <path
                className={styles.comparisonSweep}
                d="M700 84h78l20-20 22 43 31-91 34 68h54l18-28 24 54 30-94 33 68h64l17-18 19 36 25-66 27 48h204"
              />
              <circle className={styles.pulseSwitch} cx="700" cy="84" r="7" />
            </svg>
          </div>

          <article className={`${styles.comparisonSide} ${styles.problemSide}`}>
            <p className={styles.comparisonLabel}>
              <span /> Sin un sistema
            </p>
            <h2>Todo queda suelto.</h2>
            <p className={styles.comparisonBody}>
              La rutina en una app. Las comidas en otra. El seguimiento perdido
              entre mensajes, notas y memoria.
            </p>
          </article>

          <article className={`${styles.comparisonSide} ${styles.solutionSide}`}>
            <p className={styles.comparisonLabel}>
              <span /> Con PULSO
            </p>
            <h2>Todo tiene su lugar.</h2>
            <p className={styles.comparisonBody}>
              Entrenamiento, nutrición, check-ins y guía profesional conectados
              en un solo sistema.
            </p>
          </article>
        </div>

        <div className={styles.dayLayout}>
          <div className={styles.dayStatement}>
            <span className={styles.giantDay}>24H</span>
            <p>
              Un día completo, conectado. Cada registro alimenta una imagen más
              honesta de tu progreso.
            </p>
          </div>

          <ol className={styles.dayTimeline}>
            {daySteps.map((step) => (
              <li key={step.time} className={styles[step.color]}>
                <time>{step.time}</time>
                <div className={styles.timelineMarker}><span /></div>
                <div className={styles.timelineCopy}>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={styles.privacySection} id="privacidad">
        <div className={styles.privacyIntro}>
          <div className={styles.lockBadge}><LockIcon /></div>
          <h2>Tu esfuerzo es personal. Tus datos también.</h2>
          <p>
            PULSO fue diseñado local-first: el detalle de tus entrenamientos,
            comidas y medidas vive en tu teléfono. La supervisión suma contexto,
            no se adueña de tu información.
          </p>
        </div>

        <div className={styles.dataFlow} aria-label="Flujo privado de datos entre atleta y profesional">
          <div className={styles.dataNodePrimary}>
            <span className={styles.nodeIcon}>▣</span>
            <small>EN TU TELÉFONO</small>
            <strong>El registro completo</strong>
            <ul>
              <li><CheckIcon /> Series y cargas</li>
              <li><CheckIcon /> Comidas y notas</li>
              <li><CheckIcon /> Peso y medidas</li>
            </ul>
          </div>

          <div className={styles.transferLine}>
            <span>Solo resúmenes</span>
            <div><i /><i /><i /></div>
            <small>Sincroniza cuando vuelve la señal</small>
          </div>

          <div className={styles.dataNodeSecondary}>
            <span className={styles.nodeIcon}>◎</span>
            <small>EN EL PORTAL</small>
            <strong>La señal que importa</strong>
            <ul>
              <li><CheckIcon /> Adherencia</li>
              <li><CheckIcon /> Tonelaje y PRs</li>
              <li><CheckIcon /> Peso y racha</li>
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.offlineSection}>
        <div className={styles.ecgBackdrop} aria-hidden="true">
          <svg viewBox="0 0 1600 420" preserveAspectRatio="none" fill="none">
            <defs>
              <linearGradient id="offline-ecg-fade" x1="0" y1="0" x2="1600" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="currentColor" stopOpacity="0.54" />
                <stop offset="0.55" stopColor="currentColor" stopOpacity="0.3" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0.12" />
              </linearGradient>
            </defs>

            <path
              className={styles.ecgGlow}
              d="M0 235H90l30-15 22 35 23-60 25 40h35l25-85 25 165L330 52l55 183h90l25-25 22 50 28-110 35 85h90l25-17 24 32 26-70 30 55h85l23-11 22 21 22-40 23 30h85l15-6 15 12 18-23 17 17h95l10-3 10 6 12-12 13 9h95l6-1 8 2 6-5 10 4h230"
            />
            <path
              className={styles.ecgTrace}
              stroke="url(#offline-ecg-fade)"
              d="M0 235H90l30-15 22 35 23-60 25 40h35l25-85 25 165L330 52l55 183h90l25-25 22 50 28-110 35 85h90l25-17 24 32 26-70 30 55h85l23-11 22 21 22-40 23 30h85l15-6 15 12 18-23 17 17h95l10-3 10 6 12-12 13 9h95l6-1 8 2 6-5 10 4h230"
            />
            <path
              className={styles.ecgSweep}
              d="M0 235H90l30-15 22 35 23-60 25 40h35l25-85 25 165L330 52l55 183h90l25-25 22 50 28-110 35 85h90l25-17 24 32 26-70 30 55h85l23-11 22 21 22-40 23 30h85l15-6 15 12 18-23 17 17h95l10-3 10 6 12-12 13 9h95l6-1 8 2 6-5 10 4h230"
            />

            <g className={styles.ecgData}>
              <line x1="330" y1="52" x2="330" y2="22" />
              <circle cx="330" cy="52" r="5" />
              <text x="330" y="13" textAnchor="middle">82%</text>

              <line x1="550" y1="150" x2="550" y2="117" />
              <circle cx="550" cy="150" r="4" />
              <text x="550" y="107" textAnchor="middle">4 × 6</text>

              <line x1="750" y1="180" x2="750" y2="148" />
              <circle cx="750" cy="180" r="3.5" />
              <text x="750" y="138" textAnchor="middle">RPE 8</text>
            </g>
          </svg>
        </div>

        <div className={styles.offlineCopy}>
          <span className={styles.offlineCondition}>SIN WI-FI. SIN DATOS.</span>
          <span className={styles.offlinePromise}>PULSO SIGUE FUNCIONANDO.</span>
        </div>
        <p>
          Aunque no tengas conexión, puedes abrir tu rutina, registrar cada serie
          y consultar tu plan de comidas. Todo queda guardado en tu teléfono.
        </p>
      </section>

      <section className={styles.professionalSection} id="profesionales">
        <div className={styles.professionalIntro}>
          <p>Para coaches y nutricionistas</p>
          <h2>Menos hilos perdidos. Más contexto para decidir.</h2>
          <div>
            <p className={styles.professionalBody}>
              Reúne planes, seguimiento y conversaciones en un portal creado para
              acompañar personas reales, no para administrar números anónimos.
            </p>
            <Link className={styles.primaryCta} href="/portal">
              Abrir portal profesional
              <ArrowIcon />
            </Link>
          </div>
        </div>

        <div className={styles.portalWindow} aria-label="Vista previa del portal profesional">
          <div className={styles.windowBar}>
            <div><i /><i /><i /></div>
            <span>portal.pulso / atleta</span>
            <b>↗</b>
          </div>
          <div className={styles.portalBody}>
            <aside>
              <div className={styles.portalLogo}><PulseMark compact /> PULSO</div>
              <span className={styles.portalActive}>Resumen</span>
              <span>Atletas</span>
              <span>Plantillas</span>
              <span>Mensajes <b>2</b></span>
            </aside>
            <div className={styles.portalContent}>
              <div className={styles.portalHeader}>
                <div><small>ATLETA</small><strong>Alex R.</strong></div>
                <span>Últimos 7 días⌄</span>
              </div>
              <div className={styles.adherenceStrip}>
                <div><small>ADHERENCIA</small><strong>86%</strong></div>
                <div className={styles.weekBars}>
                  {[72, 90, 84, 100, 62, 88, 94].map((height, index) => (
                    <span key={index} style={{ height: `${height}%` }} />
                  ))}
                </div>
              </div>
              <div className={styles.portalLower}>
                <div className={styles.trendPanel}>
                  <small>VOLUMEN SEMANAL</small>
                  <svg viewBox="0 0 360 100" preserveAspectRatio="none" fill="none" aria-hidden="true">
                    <path d="M2 83C42 84 42 61 81 64s49 15 81 2 43-37 80-29 46 20 65 5 31-17 51-21" />
                  </svg>
                </div>
                <div className={styles.alertPanel}>
                  <span>LISTO PARA REVISAR</span>
                  <strong>Check-in semanal</strong>
                  <small>Enviado hace 18 min</small>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.toolList}>
          {professionalTools.map(([title, copy]) => (
            <div key={title}>
              <span>+</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <div className={styles.finalPulse} aria-hidden="true"><PulseMark /></div>
        <p>El cambio no necesita otro lunes.</p>
        <h2>Necesita tu siguiente repetición.</h2>
        <Link className={styles.finalButton} href="/portal">
          Entrar a PULSO
          <ArrowIcon />
        </Link>
      </section>

      <footer className={styles.footer}>
        <Link className={styles.wordmark} href="/" aria-label="PULSO, inicio">
          <PulseMark compact />
          <span>PULSO</span>
        </Link>
        <p>Entrenamiento. Nutrición. Seguimiento. Una sola señal.</p>
        <div>
          <span>pulsofitness</span>
          <Link href="/portal">Portal profesional</Link>
        </div>
      </footer>
    </main>
  );
}
