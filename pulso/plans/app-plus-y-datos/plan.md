# PULSO — App: planes guardados, respaldo, compartir y derechos sobre los datos

**Estado:** borrador · 2026-09-22
**Alcance:** app móvil (`pulso/`). El trabajo del portal va en `plans/portal-progreso-y-agenda/`.

## Relación con `engagement-loop`

Este plan **no reemplaza** a `pulso/plans/engagement-loop/plan.md`. Aquel diseña el ciclo de juego —selección muscular, pulso anterior, tarjetas de sesión, Wrapped semanal, Núcleo PULSO, mapa corporal— y sigue vigente tal como está.

Este cubre lo que aquel no tiene: planes guardados, respaldo y restauración, compartir en redes, duelos 1v1, y los derechos del atleta sobre sus datos.

---

## 1. Borrado de cuenta y datos — bloqueante de publicación

### Por qué va primero

**Apple exige borrado de cuenta dentro de la app** para toda app que permita crear una (guía de revisión 5.1.1(v)). Sin esto no se publica en la App Store. Es lo único de este plan que bloquea el lanzamiento.

Más allá del requisito, es lo correcto: el atleta debe poder irse y llevarse o destruir lo suyo.

### Qué construir

Desde Perfil → Configuración:

- **Exportar mis datos** (ver sección 3) — siempre gratis, nunca detrás de Plus.
- **Borrar mi cuenta** — con confirmación explícita, no un toque accidental.

### La tensión que hay que resolver

El plan del portal dice que revocar usa estados y marcas de tiempo, nunca borrado en cascada: planes, notas, revisiones y auditoría conservan su autor aunque una membresía se desactive. Eso choca de frente con el derecho al olvido.

Resolución propuesta:

- **Datos personales del atleta** (nombre, email, medidas, fotos, notas libres, check-ins): borrado real.
- **Registros profesionales y auditoría** (que un coach publicó un plan tal día, que alguien accedió a una categoría): se **anonimizan**, no se borran. El sujeto pasa a un identificador sin vínculo con la persona.
- Sin esto, un atleta podría borrar el rastro de auditoría de accesos a sus propios datos, que es justamente la protección que la auditoría le da.

Escribir esta distinción en la pantalla de confirmación, en lenguaje claro.

### Trampa de facturación

Borrar la cuenta **no cancela la suscripción**: las suscripciones las gestiona la tienda, no tu servidor. Si alguien borra su cuenta con Plus activo, Google o Apple le siguen cobrando.

La pantalla de confirmación tiene que decirlo y enlazar a la gestión de suscripciones de la tienda. Omitirlo genera cobros a gente que cree haberse ido — y reembolsos y reseñas de una estrella.

---

## 2. Planes guardados y cambio semanal (Plus)

### La idea

Hoy el atleta tiene **un** plan activo. Con Plus: una biblioteca de planes propios entre los que puede cambiar.

### Por qué también arregla un bug

`getActiveWorkout` en `server/lib/assignments.ts` filtra por atleta y ventana de vigencia, pero **no por organización**:

```ts
.where(and(eq(assignedWorkouts.athleteId, athleteId), withinWindow(assignedWorkouts, now)))
.orderBy(desc(assignedWorkouts.version))
```

Con una organización da igual. Ahora que un atleta puede pertenecer a varias (decidido 2026-09-22), si un coach de la org A y otro de la org B le asignan entrenamiento, el teléfono se queda con el que publicó último — arbitrario, y ninguna organización sabe de la otra.

Con planes guardados **el atleta elige cuál está activo**, y la ambigüedad desaparece. Deja de ser "el último gana" y pasa a ser una decisión explícita.

### Reglas

- **Un plan asignado por un profesional nunca se paywallea.** Si un coach te asignó un plan, lo ves y lo seguís, con Plus o sin Plus. Lo que Plus desbloquea es **guardar alternativas y alternar entre ellas**.
- Cambiar de plan estando bajo supervisión **es visible para el profesional**. No se bloquea —la agencia del atleta se respeta— pero el coach tiene que poder ver que su plan no es el activo, o va a interpretar mal la adherencia.
- El plan activo es uno solo por disciplina en un momento dado.

### Toggle semanal

Dos lecturas posibles de la idea; conviene elegir antes de construir:

1. **Cambio manual con cadencia libre** — el atleta alterna cuando quiere. Simple.
2. **Programación por semana** — "esta semana el plan A, la próxima el B", útil para alternar bloques de fuerza e hipertrofia.

La opción 1 es el MVP; la 2 se apoya en `effectiveAt`/`endsAt`, que ya existen en el esquema desde la Fase 3.

### Datos

Tabla local nueva `saved_plans` (id, athleteId, name, payloadJson, source, savedAt, lastUsedAt), donde `source` distingue si vino de un profesional, de la IA o de edición propia. El servidor sólo necesita saber cuál está activo, para que el portal muestre la verdad.

---

## 3. Exportación de datos — siempre gratis

Es un derecho de portabilidad, no una función premium. **Nunca detrás de Plus.**

- Exportar el historial propio como CSV o JSON desde Perfil.
- Se genera en el teléfono con los datos locales; no requiere servidor ni conexión.

---

## 4. Respaldo en la nube y restauración (Plus)

### Deuda que salda

El paywall listaba "Respaldo en la nube" sin que existiera. Se quitó el texto el 2026-09-22. Esta sección lo construye de verdad.

Es además la función con más valor real de la suscripción: la app es local-first sobre SQLite, así que **hoy perder el teléfono es perder todo el historial**.

### Separación de consentimientos — importante

Compartir con una organización y guardar un respaldo propio son **dos cosas distintas** y hoy están colapsadas en la misma decisión:

| | |
|---|---|
| **Compartir con una organización** | Lo revoca el atleta. El profesional pierde acceso. Sin relación con Plus. |
| **Respaldo en la nube para uno mismo** | Consentimiento aparte. Permite recuperar al cambiar de teléfono. |

**Revocar el acceso de un coach no debe borrar tu respaldo.** Son decisiones independientes y tienen que poder tomarse por separado.

Plus cobra por **la comodidad de la restauración automática**, que es trabajo de infraestructura real. Nunca por el acceso a los datos propios: para eso está la exportación gratuita de la sección 3.

### Qué falta

La infraestructura existe: `sync_outbox`, `/api/sync/push`, `/api/sync/pull`, cursor por `serverSequence`. Falta el camino de vuelta.

- Detectar instalación limpia con historial en el servidor y ofrecer restaurar.
- Reclamar el rol de escritor activo de forma explícita (`sync_devices` ya lo contempla).
- Indicador honesto: qué se respaldó, cuándo, y qué quedó fuera.

### Criterios de aceptación

- Instalar limpio, iniciar sesión, recuperar sesiones, series, comidas y mediciones.
- Restaurar dos veces no duplica nada.
- Una categoría sin consentimiento de respaldo no se restaura, y se dice.

---

## 5. Compartir en redes

### El hueco que cubre

`engagement-loop` define tarjetas 3:4 para coleccionar y `COMPARTIR CON MI EQUIPO`. Eso es privado y estructurado. Publicar en redes es otro lienzo y otro objetivo — y es **el único mecanismo de este plan que además trae usuarios nuevos**.

### Formato

- Render **9:16** además de la tarjeta 3:4. Mismos datos, lienzo de historia.
- El Wrapped se exporta como secuencia de imágenes, una por pantalla.
- `react-native-view-shot` + `expo-sharing`. Ninguno instalado todavía.

### Marca y enlace

Sin marca, una historia compartida no produce nada:

- Marca `PULSO` discreta y siempre presente en el render exportado.
- Enlace corto al sitio — es lo que convierte "qué linda tarjeta" en una descarga.
- **No** incluir datos identificatorios del atleta por defecto.

### Privacidad — obligatorio

Una tarjeta puede exponer peso corporal, zonas con dolor o adherencia nutricional. Antes de exportar, pantalla de revisión con interruptores por campo: ocultar peso, ocultar mapa corporal, ocultar nombre.

Por defecto **lo más privado**: el usuario abre lo que quiera mostrar, no al revés.

### Cuándo ofrecerlo

Sólo en `NUEVO PULSO`, `REGRESO` y el Wrapped semanal. Ofrecerlo en cada sesión rutinaria entrena al usuario a ignorar el botón.

---

## 6. Duelos privados 1v1

### Regla de diseño

`engagement-loop` descarta rankings públicos con razón: en peso absoluto un principiante nunca le gana a un veterano.

**La comparación es sobre mejora relativa propia.** Un novato que sube 8 % su tonelaje semanal le gana a un avanzado que sube 3 %. Justo y competitivo a la vez.

### Alcance

- Por invitación mutua. Nunca automático, nunca público.
- Duración fija de una semana, alineada al cierre del Wrapped.
- Métrica visible y explicada; nada de puntajes opacos.
- Se puede salir en cualquier momento, sin penalización.

### El problema de consentimiento

El modelo actual tiene cinco categorías (`training`, `nutrition`, `metrics`, `checkins`, `photos`) y **todas describen compartir con una organización**. Un duelo comparte con **otro atleta**, relación que el modelo no contempla.

No reutilizar las categorías existentes: quien aceptó compartir entrenamiento con su coach **no aceptó** compartirlo con un amigo. Requiere consentimiento propio, explícito, revocable y acotado a la métrica del duelo.

Es la decisión de arquitectura más delicada del plan; resolverla antes de escribir código.

### Contra el sobreentrenamiento

Los principios dicen que el descanso también produce progreso y que no se premia sobreentrenar. Un duelo semanal empuja al revés si se diseña mal. Mitigaciones obligatorias:

- La métrica se **topea**: pasado cierto volumen, entrenar más no suma.
- Los días de descanso planificados cuentan como cumplimiento, no como cero.
- Si el atleta reportó dolor en un check-in, el duelo no lo presiona.

---

## Orden sugerido

1. **Borrado de cuenta y exportación** — bloquea la publicación en App Store.
2. **Planes guardados** — resuelve además la ambigüedad multi-organización.
3. **Respaldo y restauración** — salda la deuda del paywall.
4. **Compartir en redes** — requiere que las tarjetas de `engagement-loop` existan.
5. **Duelos** — último: depende de resolver el consentimiento entre atletas.

## Fuera de alcance

Evaluadas y diferidas, no descartadas: rachas con escudo, temporadas de 4–6 semanas, desafíos semanales generados desde el historial.
