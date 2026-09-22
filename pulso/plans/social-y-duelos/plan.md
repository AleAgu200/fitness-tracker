# PULSO — App: respaldo, compartir en redes y duelos privados

**Estado:** borrador · 2026-09-22
**Alcance:** app móvil (`pulso/`). El trabajo del portal va en `plans/portal-progreso-y-agenda/`.

## Relación con `engagement-loop`

Este plan **no reemplaza** a `pulso/plans/engagement-loop/plan.md`. Aquel diseña el ciclo de juego —selección muscular, pulso anterior, tarjetas de sesión, Wrapped semanal, Núcleo PULSO, mapa corporal— y sigue vigente tal como está.

Este cubre tres cosas que aquel no tiene:

1. **Respaldo y exportación** — deuda: el paywall las prometía sin existir.
2. **Compartir en redes** — el engagement-loop diseña compartir *con el equipo* (privado). Publicar en redes es otro formato y otro objetivo.
3. **Duelos privados 1v1** — mecánica nueva.

## 1. Respaldo en la nube y restauración

### Por qué primero

El paywall listaba "Respaldo en la nube — recuperá todo si cambiás de teléfono" y **no existía**. Se quitó el texto el 2026-09-22 para no cobrar por algo inexistente. Esta sección salda esa deuda.

Además es la función con más valor real de toda la suscripción: la app es local-first sobre SQLite, así que **hoy perder el teléfono es perder todo el historial**.

### Qué falta

La infraestructura de sync ya existe: `sync_outbox`, `/api/sync/push`, `/api/sync/pull`, cursor por `serverSequence`, consentimiento por categoría. Lo que no existe es el camino de vuelta.

- **Restauración en instalación limpia:** al iniciar sesión en un teléfono sin datos, detectar que el servidor tiene historial y ofrecer restaurarlo.
- **Un solo escritor activo** ya está contemplado en `sync_devices`; la restauración tiene que reclamar el rol de escritor de forma explícita, no silenciosa.
- **Indicador honesto:** qué se respaldó, cuándo, y qué categorías quedan fuera por consentimiento.

### Criterios de aceptación

- Instalar limpio, iniciar sesión, y recuperar sesiones, series, comidas y mediciones.
- Restaurar dos veces no duplica nada (el ledger idempotente ya lo garantiza del lado servidor; verificarlo del lado cliente).
- Una categoría sin consentimiento no se restaura y se dice explícitamente.

## 2. Exportación de datos

La otra promesa retirada del paywall.

- Exportar el historial propio como CSV o JSON, desde Perfil.
- Generado en el teléfono con los datos locales; no requiere servidor.
- Es también un requisito de portabilidad razonable: el atleta debe poder llevarse lo suyo.

## 3. Compartir en redes

### El hueco que cubre

`engagement-loop` define tarjetas 3:4 para coleccionar y `COMPARTIR CON MI EQUIPO`. Eso es privado y estructurado. Publicar en Instagram o TikTok es distinto: otro lienzo, otro público, y —esto es lo importante— **el único mecanismo de la lista que además trae usuarios nuevos**.

### Formato

- Render **9:16** además de la tarjeta 3:4. Mismos datos, lienzo de historia.
- El Wrapped semanal se exporta como secuencia de imágenes, una por pantalla.
- Técnicamente: `react-native-view-shot` para capturar la vista, `expo-sharing` para el share sheet. Ninguno está instalado.

### Marca y enlace

Sin marca, una historia compartida no produce nada. Con marca:

- Marca `PULSO` discreta, abajo, siempre presente en el render exportado.
- Enlace corto al sitio. Es lo que convierte "qué linda tarjeta" en una descarga.
- **No** incluir datos identificatorios del atleta por defecto.

### Privacidad — obligatorio, no opcional

Una tarjeta puede exponer peso corporal, zonas con dolor o adherencia nutricional. PRODUCT.md es explícito: fotos y notas libres nunca se comparten por defecto.

Antes de exportar, una pantalla de revisión con interruptores por campo:

- Ocultar peso corporal
- Ocultar mapa corporal / zonas con dolor
- Ocultar nombre

Por defecto, **lo más privado**. El usuario abre lo que quiera mostrar, no al revés.

### Cuándo ofrecerlo

Sólo en momentos que se sienten ganados: `NUEVO PULSO`, `REGRESO` y el Wrapped semanal. Ofrecer compartir en cada sesión rutinaria entrena al usuario a ignorar el botón y le llena el feed de ruido a sus contactos.

## 4. Duelos privados 1v1

### Regla de diseño

`engagement-loop` descarta rankings públicos, y con razón: comparar peso absoluto significa que un principiante nunca le gana a un veterano, y el juego se vuelve desmotivante para quien más necesita motivación.

**La comparación es sobre mejora relativa propia**, no sobre valores absolutos. Un novato que sube 8 % su tonelaje semanal le gana a un avanzado que sube 3 %. Eso es justo y es competitivo.

### Alcance

- Se entra por invitación mutua. Nunca automático, nunca público.
- Duración fija: una semana, alineada al cierre del Wrapped.
- Métrica visible y explicada — nada de "puntaje" opaco.
- Cualquiera puede salir en cualquier momento, sin penalización.

### El problema de consentimiento que hay que resolver

El modelo actual tiene cinco categorías de consentimiento (`training`, `nutrition`, `metrics`, `checkins`, `photos`) y todas describen compartir **con una organización**. Un duelo comparte datos con **otro atleta**, que es una relación que el modelo no contempla.

No reutilizar las categorías existentes para esto: un atleta que aceptó compartir entrenamiento con su coach **no aceptó** compartirlo con un amigo. Requiere su propio consentimiento, explícito, revocable y acotado a la métrica del duelo.

Es la decisión de arquitectura más delicada de este plan; conviene resolverla antes de escribir código.

### Contra el sobreentrenamiento

Los principios dicen que el descanso también produce progreso y que no se premia sobreentrenar. Un duelo semanal empuja justo en la dirección contraria si se diseña mal.

Mitigaciones obligatorias:

- La métrica se **topea**: pasado cierto volumen, entrenar más no suma.
- Los días de descanso planificados cuentan como cumplimiento, no como cero.
- Si el atleta reportó dolor en un check-in, el duelo no lo presiona.

## Orden sugerido

1. **Respaldo y restauración** — salda la deuda del paywall y es el valor real de la suscripción.
2. **Exportación** — pequeño y se apoya en lo mismo.
3. **Compartir en redes** — requiere que las tarjetas de `engagement-loop` existan primero.
4. **Duelos** — lo último: depende de resolver el consentimiento entre atletas.

## Fuera de alcance

Ideas evaluadas y descartadas para esta tanda:

- Rachas con escudo y temporadas de 4–6 semanas.
- Desafíos semanales generados desde el historial.

No se descartan por malas; quedan para una tanda posterior.
