# PULSO — Engagement Loop

## Objetivo

Transformar el registro diario en un ciclo que devuelve valor y emoción de inmediato:

`elegir → entrenar → superar una referencia → revelar un resultado → evolucionar → resumir`

El sistema combina:

1. Selección visual por grupo muscular.
2. Pulso anterior ("Beat your ghost").
3. Tarjetas de sesión coleccionables.
4. Resumen semanal tipo Wrapped.
5. Núcleo PULSO como representación del momentum.
6. Mapa corporal de carga y recuperación.
7. Modo equipo privado y opcional.

No se usarán rankings públicos, pérdida punitiva de rachas ni recompensas por sobreentrenar.

---

## Principios de diseño

### Continuidad con la interfaz actual

- Fondo principal `#0A0A0B`.
- Superficies `#141416` y `#0E0E10`.
- Bordes rectos de 1 px; sin tarjetas redondeadas de estilo casual.
- Amarillo para acción/progreso, cian para información/recuperación, naranja para continuidad y rojo para hitos o alertas.
- Space Grotesk para títulos, JetBrains Mono para datos y etiquetas, Inter para explicación.
- Entrada `FadeInDown`, cambios con `withTiming`, pulsos tenues y hápticos puntuales.
- Máximo un elemento con brillo activo por pantalla.
- Iconografía técnica y abstracta; evitar trofeos caricaturescos o estética infantil.

### Reglas de comportamiento

- El usuario siempre puede omitir una interacción opcional.
- Registrar debe tomar menos tiempo que interpretar el resultado.
- Cada registro importante debe generar una respuesta inmediata.
- Descanso, recuperación y honestidad también producen progreso.
- El entrenador ve señales y contexto, no una puntuación moral del atleta.

---

## Navegación

Se conservan las cinco pestañas actuales.

- **HOY:** Núcleo PULSO, estado corporal y acceso rápido a selección muscular.
- **ENTRENO:** Selector muscular, Pulso anterior y sesión activa.
- **PROGRESO:** Tarjetas, Wrapped e historial corporal.
- **PERFIL:** Preferencias del Núcleo y consentimiento del modo equipo.
- **PORTAL:** Señales del equipo y tarjetas compartidas por el atleta.

No se agrega otra pestaña. Los detalles se abren como rutas apiladas o paneles inferiores.

---

## 1. Selección por grupo muscular

### Propósito

Dar una entrada visual cuando el usuario no tiene un plan asignado o quiere una sesión flexible.

### Experiencia

1. Mostrar una silueta frontal y posterior.
2. Tocar una zona selecciona uno o varios grupos:
   - Pecho
   - Espalda
   - Hombros
   - Brazos
   - Core
   - Glúteos
   - Cuádriceps
   - Isquiotibiales
   - Pantorrillas
3. Cada zona muestra su estado:
   - Disponible: borde tenue.
   - Seleccionada: amarillo.
   - Carga reciente: naranja.
   - Recuperación recomendada: cian tenue.
   - Dolor informado: rojo; requiere confirmación antes de incluirla.
4. CTA: `GENERAR SESIÓN`.
5. La app propone ejercicios usando equipo disponible, historial y carga reciente.
6. El usuario confirma, reemplaza ejercicios o empieza.

### Integración con planes profesionales

- Un plan asignado sigue siendo la opción primaria.
- La selección muscular aparece como `SESIÓN LIBRE`.
- Si contradice una restricción del entrenador, se muestra contexto sin bloquear automáticamente.

### MVP

- Silueta SVG propia.
- Selección manual.
- Filtro de ejercicios existentes por `muscleGroup`.
- Plantillas deterministas; no requiere IA.

### Criterios de aceptación

- Se puede generar una sesión en tres interacciones.
- No se recomienda un grupo marcado con dolor sin confirmación.
- La sesión generada utiliza únicamente ejercicios disponibles en la biblioteca.
- Funciona offline.

---

## 2. Pulso anterior

### Propósito

Convertir la sesión anterior en una referencia personal, sin comparar al usuario con otras personas.

### Experiencia dentro de Entreno

Sobre el registro del ejercicio:

- `PULSO ANTERIOR · 60 KG × 8 · RPE 8`
- Una barra fantasma muestra la mejor serie comparable anterior.
- Mensajes contextuales:
  - `IGUALÁS TU ÚLTIMO PULSO`
  - `+1 REP PARA SUPERARLO`
  - `MÁS CONTROL · MISMO PESO`
  - `HOY TOCA CONSOLIDAR`

Al guardar una serie:

- Comparar peso, repeticiones, e1RM y RPE.
- Mostrar una reacción de máximo 1.5 segundos.
- No declarar victoria si el incremento viene acompañado de un RPE desproporcionado.

### Modos

- **Superar:** mejor e1RM o volumen comparable.
- **Consolidar:** mismo rendimiento con menor RPE.
- **Regresar:** primera sesión tras una pausa; se premia completar.
- **Técnica:** objetivo marcado por entrenador; no exige subir carga.

### Datos

Extender el resumen derivado de sesiones, sin duplicar cada serie:

- `previousWeightKg`
- `previousReps`
- `previousRpe`
- `previousE1rm`
- `comparisonMode`
- `delta`

### Criterios de aceptación

- La referencia proviene del mismo ejercicio y atleta.
- Nunca recomienda aumentar carga automáticamente.
- Funciona aunque no exista sesión previa.
- Completar una sesión de regreso puede generar tarjeta aunque no haya récord.

---

## 3. Tarjetas de sesión

### Propósito

Convertir una sesión terminada en un objeto visual memorable y coleccionable.

### Familias iniciales

- `NUEVO PULSO`: récord real.
- `MÁS FUERTE`: mejora de e1RM.
- `MÁS VOLUMEN`: mayor tonelaje comparable.
- `CONTROL`: mismo trabajo con menor RPE.
- `REGRESO`: primera sesión tras 7+ días.
- `CONSISTENCIA`: sesión objetivo completada.
- `EQUILIBRIO`: buena distribución muscular.
- `RECUPERACIÓN`: respetó una recomendación de descanso.

### Revelado

Al terminar:

1. Resumen numérico breve.
2. Barrido de luz.
3. Se revela una sola tarjeta principal.
4. Opciones:
   - `GUARDAR`
   - `COMPARTIR CON MI EQUIPO`
   - `VER DETALLE`

Las demás señales quedan en el detalle; no inundar al usuario con premios.

### Diseño

- Proporción vertical 3:4.
- Fondo carbón, líneas técnicas y textura ligera.
- Código de color según familia.
- Métrica protagonista en JetBrains Mono.
- Fecha, ejercicio y contexto en texto secundario.
- El Núcleo PULSO aparece como marca abstracta, no como personaje.

### Datos

Nueva tabla local `session_cards`:

- `id`
- `athleteId`
- `sessionId`
- `type`
- `title`
- `metric`
- `payloadJson`
- `earnedAt`
- `sharedWithTeamAt`

El servidor solo recibe tarjetas compartidas explícitamente o resúmenes consentidos.

---

## 4. Wrapped semanal

### Propósito

Hacer que el usuario espere una devolución semanal construida con sus propios datos.

### Formato

Historia de 5 a 7 pantallas, disponible al cerrar la semana:

1. `TU SEMANA EN PULSO`
2. Movimiento: sesiones, series y tonelaje con comparación personal.
3. Músculos: mapa corporal con distribución de carga.
4. Momento: mejor tarjeta de la semana.
5. Consistencia: entrenamiento, nutrición e hidratación.
6. Recuperación: zonas más cargadas y recomendación no médica.
7. Próximo pulso: objetivo pequeño para la semana siguiente.

### Reglas editoriales

- Si hay pocos datos, contar una historia corta; no mostrar páginas vacías.
- Usar equivalencias solo cuando sean claras y verificables.
- No felicitar pérdida de peso sin considerar el objetivo del usuario.
- No inferir lesión, fatiga clínica ni diagnóstico.

### Acceso

- Card superior en `HOY` durante 72 horas.
- Historial en `PROGRESO → SEMANAS`.
- Compartir como imagen es opcional.
- Compartir con entrenador utiliza datos estructurados, no solo una captura.

### Datos

Nueva tabla `weekly_summaries`:

- `id`
- `athleteId`
- `weekStart`
- `weekEnd`
- `summaryJson`
- `generatedAt`
- `viewedAt`
- `sharedWithTeamAt`

El resumen se genera de forma determinista en el teléfono durante el MVP.

---

## 5. Núcleo PULSO

### Propósito

Representar continuidad, equilibrio y recuperación sin crear una mascota infantil.

### Apariencia

Un núcleo eléctrico abstracto compuesto por:

- Anillo exterior: consistencia reciente.
- Frecuencia del pulso: actividad.
- Color interior: balance.
- Partículas: hitos recientes.
- Halo: estado de recuperación.

### Estados

- `LATENTE`: usuario nuevo o sin datos.
- `ACTIVO`: actividad reciente equilibrada.
- `CARGADO`: sesión o hito completado.
- `RECUPERANDO`: carga muscular reciente alta.
- `ESTABLE`: semana consistente.
- `REACTIVANDO`: regreso tras una pausa.

Nunca se rompe, enferma o muere. La ausencia cambia el mensaje a una invitación pequeña.

### Ubicación

- Versión compacta en `HOY`.
- Pantalla de detalle al tocar.
- Marca dentro de tarjetas y Wrapped.
- No reemplaza métricas concretas.

### Cálculo inicial

`momentum` de 0 a 100 basado en últimos 7 días:

- 40% cumplimiento de sesiones previstas.
- 20% continuidad flexible.
- 15% nutrición.
- 15% hidratación.
- 10% recuperación/carga equilibrada.

Mostrar el número solo en detalle. La vista principal comunica estado, no puntuación.

---

## 6. Mapa corporal

### Propósito

Unificar selección muscular, historial y recuperación en un mismo lenguaje visual.

### Capas

- **SELECCIONAR:** crea una sesión.
- **CARGA 7D:** volumen relativo por grupo.
- **PROGRESO:** evolución de fuerza por grupo.
- **RECUPERACIÓN:** tiempo desde la última carga significativa.
- **MOLESTIA:** reporte manual y temporal del usuario.

### Interacción

- Alternar frontal/posterior.
- Tocar una zona abre una ficha:
  - Última sesión.
  - Ejercicios recientes.
  - Volumen relativo.
  - Mejor tarjeta.
  - Molestia reportada.
- Mantener presionado permite marcar molestia en tres niveles.
- Un aviso aclara que no constituye evaluación médica.

### Modelo

Catálogo canónico `MuscleGroup` compartido por app y servidor. La biblioteca actual debe migrar gradualmente de categorías amplias a grupos primarios y secundarios.

Cada ejercicio tendrá:

- `primaryMuscleGroup`
- `secondaryMuscleGroups`
- `movementPattern`

La carga se calcula con sets efectivos ponderados, no únicamente tonelaje, para no comparar músculos incompatibles.

---

## 7. Modo equipo opcional

### Propósito

Dar mejores señales al entrenador sin convertir al atleta en participante de una competencia.

### Consentimiento

En `PERFIL → EQUIPO → DATOS COMPARTIDOS`, el atleta elige:

- Compartir resumen semanal.
- Compartir tarjetas.
- Compartir mapa de carga.
- Compartir molestias.
- Compartir RPE.

Valores recomendados, pero nunca preactivados silenciosamente. Se puede revocar el acceso.

### Portal profesional

Añadir a cada atleta:

- Estado: activo, recuperando, reactivando o sin datos.
- Última sesión y adherencia de 7 días.
- Mapa corporal compacto.
- Tarjeta reciente.
- Señales: RPE alto repetido, molestia compartida, caída de actividad.

El entrenador puede:

- Reaccionar con `⚡`, `✓`, `REVISAR`.
- Añadir una nota privada.
- Convertir una señal en ajuste del plan.
- Enviar un mensaje contextual.

### Límites

- Sin leaderboard.
- Sin comparación entre atletas.
- Sin puntuación visible de "mejor/peor atleta".
- Sin alertas clínicas automáticas.
- El profesional solo ve lo autorizado para su rol.

---

## Arquitectura y sincronización

### Local-first

El registro continúa funcionando con SQLite sin conexión.

Nuevos datos locales:

- Catálogo muscular ampliado.
- Comparaciones de Pulso anterior derivadas.
- Tarjetas.
- Wrapped.
- Estado del Núcleo.
- Preferencias de privacidad.
- Molestias temporales.

### Servidor

Nuevas rutas propuestas:

- `POST /api/progress/snapshot`
- `GET /api/progress/weekly`
- `POST /api/team/sharing-preferences`
- `GET /api/team/athletes/:id/signals`
- `POST /api/team/signals/:id/reaction`

Agregar idempotencia por `athleteId + sourceId + version` y registrar el instante de sincronización.

### Privacidad

- No subir fotos de progreso en esta fase.
- No compartir molestias por defecto.
- Conservar el dato crudo local; subir resúmenes mínimos.
- Mostrar al atleta una vista exacta de lo que ve su equipo.

---

## Fases de implementación

### Fase 0 — Fundamentos visuales y de datos

Duración estimada: 1 semana.

- Definir catálogo muscular canónico.
- Crear SVG frontal/posterior.
- Crear componentes `BodyMap`, `SignalCard`, `PulseCore` y `RevealCard`.
- Definir tokens de brillo, textura y animación.
- Añadir migraciones SQLite.
- Preparar generadores deterministas y fixtures.

Resultado: story/demo interna sin modificar todavía el flujo principal.

### Fase 1 — Selector muscular + mapa

Duración estimada: 1–2 semanas.

- Integrar selector en Entreno como sesión libre.
- Generador de sesión basado en biblioteca y equipo.
- Añadir capas de carga 7D y molestia.
- Añadir ficha por músculo.
- Validar funcionamiento offline.

Resultado: el usuario puede tocar el cuerpo y empezar una sesión relevante.

### Fase 2 — Pulso anterior

Duración estimada: 1 semana.

- Consultas de comparación por ejercicio.
- Barra fantasma y mensajes contextuales.
- Modos superar, consolidar y regresar.
- Guardar el resultado de comparación al terminar.

Resultado: cada serie tiene contexto personal inmediato.

### Fase 3 — Tarjetas

Duración estimada: 1–2 semanas.

- Motor de reglas.
- Revelado al cerrar sesión.
- Colección en Progreso.
- Detalle y compartir como imagen.
- Instrumentación de vistas y compartidos.

Resultado: cada sesión puede producir un recuerdo visual significativo.

### Fase 4 — Núcleo + Wrapped

Duración estimada: 2 semanas.

- Motor de momentum.
- Núcleo compacto y detalle.
- Generador semanal adaptativo.
- Historia vertical y archivo.
- Notificación local cuando el resumen esté disponible.

Resultado: existe un arco diario y otro semanal.

### Fase 5 — Modo equipo privado

Duración estimada: 2–3 semanas.

- Preferencias granulares de consentimiento.
- Sincronización de snapshots.
- Panel de señales en el portal.
- Reacciones y mensajes contextuales.
- Auditoría de acceso y revocación.

Resultado: el entrenador recibe contexto accionable sin competencia social.

---

## Analítica de producto

Eventos mínimos:

- `body_map_opened`
- `muscle_group_selected`
- `free_session_generated`
- `previous_pulse_shown`
- `previous_pulse_beaten`
- `session_card_revealed`
- `session_card_saved`
- `weekly_wrap_opened`
- `weekly_wrap_completed`
- `team_share_enabled`
- `coach_signal_reacted`

Métricas de éxito:

- Tiempo desde abrir Entreno hasta iniciar sesión.
- Porcentaje de sesiones finalizadas.
- Registros por sesión sin aumentar el tiempo de captura.
- Apertura del Wrapped.
- Retención semanal.
- Porcentaje de usuarios que comparten voluntariamente con su equipo.
- Reducción de sesiones abandonadas después de una pausa.

No optimizar por tiempo total dentro de la app; optimizar por sesiones útiles completadas y retorno voluntario.

---

## Pruebas

- Unitarias para generación de sesiones, cálculo muscular, tarjetas y momentum.
- Fixtures con usuario nuevo, constante, en regreso y con datos incompletos.
- Pruebas de migraciones sin pérdida de datos.
- Pruebas offline y posterior sincronización.
- Accesibilidad: etiquetas para zonas musculares y alternativa en lista.
- Reducir movimiento cuando el sistema lo solicite.
- Verificación visual en teléfonos pequeños y grandes.
- Pruebas de permisos por rol y revocación de consentimiento.

---

## Orden recomendado del primer lanzamiento

Primer release público:

1. Selector muscular.
2. Mapa de carga.
3. Pulso anterior.
4. Cuatro tarjetas: récord, control, regreso y consistencia.

Segundo release:

1. Núcleo PULSO.
2. Wrapped semanal.
3. Colección completa de tarjetas.

Tercer release:

1. Consentimiento.
2. Snapshots.
3. Panel del entrenador y reacciones.

Este orden permite validar si la experiencia mejora el hábito antes de construir la sincronización profesional completa.
