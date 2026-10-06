---
format: 1920x1080
duration: 30s
message: "Todo tu entreno y tu nutrición, con pulso: PULSO"
arc: Hook (línea plana → latido) → Valor → Demo en cadena (serie → récord → comida y agua → sueño → entrenador) → Pausa → Logo → Cierre que empalma con el inicio
audience: personas que entrenan y cuidan lo que comen, y llegan a pulsofitness.tech
mode: collaborative
music: none
version: v2
---

## Decisiones

- **Mensaje:** "Todo tu día tiene pulso: entreno, comida y descanso en un solo lugar."
- **Audiencia y arco:** quien entra a la web; hook visual (una línea plana que late) → valor por el beat 2 → cinco pruebas encadenadas sobre la misma línea → pausa → logo → cierre que vuelve a la línea plana (loop).
- **Formato:** 1920×1080, ~30.5 s, sin voz, sin música (autoplay silenciado, loop). Versión vertical 1080×1920 después de cerrar esta.
- **Columna (spine):** la línea de latido naranja del logo. Siempre presente, a la altura del tercio inferior; recorre la pantalla hacia la izquierda como un monitor. Cada pico "abre" la pantalla de la app de ese beat; al final se enrolla y forma el corredor del logo.
- **Marca (del código de la app, `pulso/src/constants/colors.ts`):** fondo #0A0A0B · texto #FAFAFA · secundario #8A8A93 · tarjetas #141416 con borde #26262A · naranja del logo #F49B35 (la línea, la marca) · volt #E8FF59 (el dato destacado, como en la app) · cian #3DDCFF solo para el agua (como en la app). Tipos: Space Grotesk 700 (titulares 110–140 px) · JetBrains Mono (etiquetas 22–26 px, números) · Inter (texto de apoyo 32–40 px). Curva por defecto: power3.out, salidas power2.in.
- **Prohibido:** degradados en el texto; rebotes y overshoot; paneos lentos o "respiración" de tarjetas; fotos de stock de gimnasio; teléfonos brillosos con reflejos; funciones que la app no tiene; sellos o promesas de tienda; datos personales reales. Fallas de movimiento a evitar: el **slideshow** (cada beat una tarjeta nueva sin hilo) y el **salvapantallas** (movimiento que no dice nada).
- **Beat quieto:** el 08 — nada se mueve salvo un leve temblor de la línea; la frase aterriza sola.
- **Veracidad:** las pantallas se reconstruyen desde el código de la app (paleta, tipografías y la estructura real de cada pantalla: registro de serie PESO KG / REPS / RPE / GUARDAR SET, tarjeta CONSUMIDO con KCAL/PROTEÍNA/CARBOS/GRASAS, LÍQUIDOS, SUEÑO · ANOCHE, chat del equipo). Datos de ejemplo; atleta "Alex" como en la landing.
- **Dirección de las costuras:** hacia la izquierda en todo el video (la línea avanza a la izquierda; cada tarjeta entra por la derecha llevada por el pico y sale por la izquierda).

## Changes from v1

- "centra bien el contenido final, porque veo que la imagen no esta bien centrada aca" — frames 09 y 10 usan `assets/brand/pulso-mark-tight.svg` (viewBox recortado al dibujo: 229 322 563 377); en el 09 el bloque logo + PULSO queda centrado en el cuadro y el brillo naranja, centrado detrás del logo.

## Locked

- Hoja v2 aprobada ("me parece"): ubicación, textos y jerarquía de los 10 frames.
- Sin audio: ni música ni efectos de sonido ("mejor dejemoslo sin audio, solo como efectos de promocion"). `music: none`, sin SCRIPT.md.

## Frame 01 — Línea plana

- duration: 2s
- status: animated
- src: compositions/01-linea-plana.html
- transition_in: cut
- scene: Negro. Una línea naranja plana cruza la pantalla; un punto la recorre. Arriba a la izquierda "PULSO · 06:00".
- voiceover: onscreen
- blueprint: fixed-anchor-cycle (la línea es el ancla fija del video)
- motion: svg-path-draw (la línea se dibuja de derecha a izquierda en 0.6 s), punto que viaja (power1.inOut)

Hook sin palabras: algo está quieto y está por pasar. Por qué: abre la tensión que el primer latido resuelve.

## Frame 02 — Un latido

- duration: 2.5s
- status: animated
- src: compositions/02-latido.html
- transition_in: cut
- scene: La línea late (un pico ECG). Sobre la línea, en grande: "Tu día tiene pulso."
- voiceover: onscreen
- blueprint: kinetic-type-beats
- motion: svg-path-draw del pico (0.35 s, power3.out); per-word staggered reveal del titular sobre el pico

Por qué: el valor por el beat 2 — PULSO acompaña todo tu día, no una sola cosa.

## Frame 03 — La serie

- duration: 3.5s
- status: animated
- src: compositions/03-serie.html
- transition_in: cut-the-curve (izquierda)
- scene: El pico abre la tarjeta del registro de serie de Entreno: "SENTADILLA · SERIE 3 DE 3", "PESO KG 62.5", "REPS 8", RPE 8 marcado, botón volt "✓ GUARDAR SET" que se presiona. Texto: "Cada serie, en segundos."
- voiceover: onscreen
- blueprint: device-surface-showcase (cursorless stepwise-flow, sin teléfono: la tarjeta sola)
- motion: counting-dynamic-scale en 62.5 y 8; press-release-spring en GUARDAR SET (sin overshoot); revelados en la segunda mitad

Por qué: primera prueba — registrar es instantáneo.

## Frame 04 — El récord

- duration: 3s
- status: animated
- src: compositions/04-record.html
- transition_in: cut-the-curve (izquierda)
- scene: La línea da su pico más alto (callback del 02). "1RM ESTIMADO" y "79.2 kg" contando hacia arriba; etiqueta volt "NUEVO RÉCORD". Texto: "Tus récords se calculan solos."
- voiceover: onscreen
- blueprint: dataviz-countup (un solo número protagonista)
- motion: counting-dynamic-scale; destello volt de la etiqueta (opacity, sin rebote)

Por qué: la recompensa — el progreso se ve sin hacer cuentas.

## Frame 05 — Comida y agua

- duration: 4s
- status: animated
- src: compositions/05-comida-agua.html
- transition_in: cut-the-curve (izquierda)
- scene: Tarjeta "CONSUMIDO": "1 840 kcal" contando; barras PROTEÍNA 132 g · CARBOS 190 g · GRASAS 58 g que se llenan. A la derecha, anillo cian "LÍQUIDOS 2.1 L" que se completa. Texto: "Lo que comés, sin vueltas."
- voiceover: onscreen
- blueprint: device-surface-showcase + stat-bars-and-fills
- motion: counting-dynamic-scale (kcal), stat-bars-and-fills (barras en cascada, anillo con svg-path-draw desde las 12)

Por qué: segunda mitad del día — la nutrición vive en el mismo lugar.

## Frame 06 — El descanso

- duration: 3s
- status: animated
- src: compositions/06-sueno.html
- transition_in: cut-the-curve (izquierda)
- scene: La línea se vuelve ondas largas y lentas (sueño). Tarjeta "SUEÑO · ANOCHE" con "7 h 12 min". Texto: "Y lo que descansás."
- voiceover: onscreen
- blueprint: titlecard-reveal (respiro, un solo movimiento)
- motion: svg-path-draw de las ondas; una sola entrada slide-up de la tarjeta, después quieto

Por qué: cierra el círculo del día — entreno, comida, descanso.

## Frame 07 — Tu entrenador

- duration: 3.5s
- status: animated
- src: compositions/07-entrenador.html
- transition_in: cut-the-curve (izquierda)
- scene: Hilo de chat: llega una burbuja del entrenador "¡Nuevo récord! La semana que viene probamos 65 kg." (punto de escritura → mensaje). Texto: "Tu entrenador, a un mensaje."
- voiceover: onscreen
- blueprint: device-surface-showcase (flujo sin cursor: escribiendo… → mensaje)
- motion: discrete-text-sequence para los puntos de "escribiendo"; entrada suave de la burbuja (spring-pop-entrance en su variante sin overshoot)

Por qué: lo que nadie más tiene — el profesional ve tu progreso y te responde.

## Frame 08 — Un solo pulso

- duration: 2.5s
- status: animated
- src: compositions/08-un-pulso.html
- transition_in: crossfade
- scene: Solo la línea, latiendo una vez. En grande, quieto: "Todo tu día. Un solo pulso."
- voiceover: onscreen
- blueprint: titlecard-reveal (beat quieto)
- motion: una sola entrada (slide-up corto); después nada se mueve salvo un temblor mínimo de la línea (sine-wave-loop, amplitud baja)

Por qué: el mensaje dicho sin pruebas, para que quede.

## Frame 09 — El corredor

- duration: 4s
- status: animated
- src: compositions/09-logo.html
- transition_in: cut
- scene: La línea se recoge hacia el centro, dibuja el latido del logo y de él sale el corredor naranja; aparece "PULSO" debajo. (Esta secuencia también se exporta como loop del logo.)
- voiceover: onscreen
- blueprint: logo-assemble-lockup (variante: el contorno se dibuja)
- motion: svg-path-draw del latido del logo; el corredor se revela con una máscara que sigue al trazo; wordmark con per-word reveal; ambient-glow-bloom naranja detrás (≤0.35)

Por qué: la marca nace de la misma línea que contó toda la historia (callback del 01).

## Frame 10 — Cierre

- duration: 2.5s
- status: animated
- src: compositions/10-cierre.html
- transition_in: cut
- scene: Logo arriba, "Entreno y nutrición, con pulso." y "pulsofitness.tech". Al final, el latido del logo se estira hacia la izquierda y vuelve a ser la línea plana del frame 01 (empalme del loop).
- voiceover: onscreen
- blueprint: titlecard-reveal (end card)
- motion: una entrada; el estirado final de la línea con svg-path-draw (power2.in), velocidad igual a la del dibujo del 01 para que el loop no se note

Por qué: dónde encontrarte, y el loop que vuelve a empezar sin corte.
