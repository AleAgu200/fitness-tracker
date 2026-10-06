---
workflow: general-video
flow: companion
storyboard: yes
message: "Todo tu entreno y tu nutrición, con pulso: PULSO"
destination: website-embed
aspect: 1920x1080
language: es
length: 30s
angle: promo
---

## Intent

Video promocional para el hero de la landing de PULSO (pulsofitness.tech). Se reproduce
solo, silenciado y en loop. Concepto elegido: "La línea del pulso" — la línea de latido del
logo recorre la pantalla en negro; cada pico abre una pantalla de la app recreada (serie
registrada 62.5 kg × 8, comida y macros, agua 2.1 L, sueño 7 h, récord / 1RM estimado) con
números que cuentan hacia arriba; cierra con la línea formando el corredor del logo.
Español con voseo. Pocas palabras y grandes por escena: tiene que leerse en un celular.

## Assets

- ../../pulso/assets/brand/pulso-logo.svg — logo maestro (corredor naranja #F49B35 + línea de latido sobre negro); cierre del video y loop del logo.
- ../../pulso/assets/brand/pulso-mark.svg — solo la marca, sin fondo.

## Customizations

- Pantallas de la app recreadas en HTML con datos de ejemplo (sin datos personales), no capturas.
- La línea del logo se dibuja sola (trazo SVG) y es el hilo de todo el video.
- Números que cuentan hacia arriba en las pantallas.
- Diseño de la marca existente (sin preset): negro, naranja del logo #F49B35, volt #E8FF59, cian de la app; Space Grotesk / JetBrains Mono / Inter.
- Entregables: 16:9 (principal) + versión vertical 9:16 para celulares; MP4 + WebM + póster para la web; loop corto del logo aparte.
- Después del render: integrar en la landing (server/app/page.tsx).

## Notes

- Sin audio, confirmado por el usuario (ni música ni efectos de sonido): el video comunica solo con lo visual. Autoplay silenciado; el final empalma con el principio para que el loop no se note.
- Uso limitado (39% de la sesión al empezar): el render es lo caro, revisar con bocetos antes.
