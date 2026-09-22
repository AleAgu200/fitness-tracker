# PULSO — Portal: progreso real, agenda y documentos

**Estado:** borrador · 2026-09-22
**Alcance:** portal profesional (`server/`). El trabajo de la app móvil va en `pulso/plans/social-y-duelos/`.

## Por qué esto ahora

El expediente individual existe y funciona: hay señales, check-ins, plan versionado, mensajes y equipo. Pero la pestaña **Progreso** todavía renderiza `JSON.stringify` crudo — es el placeholder que la Fase 1 del plan anterior nunca reemplazó. Un profesional no puede decidir nada mirando un volcado de JSON, así que hoy el expediente se usa a medias.

Lo demás de esta lista es la Fase 5 que quedó pendiente: agenda, documentos y exportación.

## 1. Progreso real

### Problema

`server/app/portal/atletas/[athleteId]/page.tsx` muestra:

```tsx
<pre>{JSON.stringify(data, null, 2)}</pre>
```

`getAthleteOverview` ya calcula los datos (ventana de 28 días). Falta presentarlos y ampliar las ventanas.

### Qué construir

Tres rangos conmutables: **7 / 28 / 90 días**, sobre las tres categorías que ya existen.

- **Entrenamiento:** sesiones completadas sobre programadas, tonelaje, PRs del período, distribución por grupo muscular.
- **Nutrición:** comidas cumplidas / sustituidas / pendientes. Nunca un porcentaje solo: siempre con denominador y período visibles.
- **Métricas:** peso con tendencia, y su cambio respecto al inicio del rango.

### Reglas irrenunciables

Vienen del plan anterior y siguen valiendo:

- **Mostrar siempre denominador, período y datos faltantes.** "80%" sin decir sobre cuántas sesiones es un número que engaña.
- **Acceso revocado ≠ 0%.** Si el atleta revocó una categoría, decir "acceso revocado", nunca dibujar un gráfico en cero. Ya está implementado en `dataFreshness`; la UI tiene que respetarlo.
- **Frescura del dato visible.** Si el último sync fue hace 6 días, el gráfico miente sin decirlo.
- Ningún gráfico sin datos suficientes: estado vacío explícito, no una línea plana.

### Gráficos

El portal no tiene librería de charts. Dos opciones:

1. **SVG propio** — encaja con la estética técnica (líneas rectas, mono, sin degradados), cero dependencias, control total. Más trabajo inicial.
2. **Recharts** — rápido, pero trae una estética genérica que hay que pelear para que no desentone.

Recomendación: SVG propio para las series simples (línea de peso, barras de adherencia), que son pocas y no necesitan interacción compleja. Consultar la skill `dataviz` antes de elegir paleta y tipos de gráfico.

### Criterios de aceptación

- Ningún `JSON.stringify` en la UI del expediente.
- Cambiar de rango 7/28/90 no recarga la página.
- Una categoría revocada se distingue visualmente de una categoría en cero.
- Un atleta sin datos en el rango muestra un estado vacío, no un gráfico vacío.

## 2. Notas del profesional

La tabla `professional_notes` existe, con `visibility` en `author | care_team | athlete`. No hay UI.

- Notas privadas del autor, notas visibles al equipo, notas visibles al atleta.
- Toda nota muestra autor y visibilidad de forma inequívoca — confundir una nota privada con una visible al atleta es el peor fallo posible de esta pantalla.
- Entran en la pestaña "Notas y tareas", que hoy sólo lista tareas.

## 3. Agenda 1:1

### Modelo

Tablas nuevas en `server/db/schema/`:

```
professional_availability
  id, membershipId, weekday, startMinute, endMinute, timezone, active

appointments
  id, organizationId, careAssignmentId, athleteId,
  professionalMembershipId, startsAt, endsAt,
  status (scheduled | completed | cancelled | no_show),
  locationOrLink, createdAt, cancelledAt, summaryNoteId
```

### Alcance

- El profesional define franjas de disponibilidad semanales.
- Propone o agenda una cita con un atleta asignado.
- El atleta la ve en la app y puede confirmar o pedir cambio.
- Al cerrar la cita, el profesional escribe un **resumen de consulta** que queda como nota (`professional_notes`) enlazada a la cita.
- Recordatorio push al atleta 24 h y 1 h antes, reutilizando `lib/push-notifications.ts`.

### Zonas horarias

El servidor guarda instantes en epoch ms (como todo el resto del esquema). La disponibilidad se guarda con su timezone porque "los martes de 9 a 12" es una regla local, no un instante. Es el único lugar del sistema donde la zona horaria importa de verdad; no improvisar.

## 4. Documentos

### Advertencia de seguridad

El bucket `pulso-media-*` que existe hoy es para GIFs públicos. **Los documentos no van ahí.** Un plan de alimentación o un estudio médico es dato de salud: requiere bucket propio, privado, con URLs prefirmadas de vida corta y registro en `audit_events` de cada descarga.

### Modelo

```
documents
  id, organizationId, athleteId, uploadedByMembershipId,
  visibility (author | care_team | athlete),
  s3Key, filename, contentType, sizeBytes, uploadedAt, deletedAt
```

- Subida desde el portal, descarga con URL prefirmada (5 min).
- La visibilidad sigue el mismo modelo que las notas.
- Borrado lógico (`deletedAt`), nunca físico: la auditoría debe sobrevivir.

## 5. Exportación

- Exportar el progreso de un atleta como PDF para revisión conjunta en consulta.
- Exportar como CSV para portabilidad.
- Ambas acciones quedan en `audit_events`: exportar datos de salud es un acceso sensible y tiene que ser rastreable.

## Orden sugerido

1. **Progreso real** — desbloquea el uso diario del expediente; es lo único que hoy está roto a la vista.
2. **Notas** — barato, la tabla ya existe.
3. **Agenda** — el bloque más grande; no empezarlo hasta tener 1 y 2.
4. **Documentos** — requiere bucket privado nuevo.
5. **Exportación** — se apoya en que 1 esté terminado.

## Fuera de alcance

- Pagos, paquetes y facturación entre profesional y atleta. Sigue siendo P2, y RevenueCat cubre sólo la suscripción de PULSO al atleta.
- Grupos, retos grupales y videollamada.

## Decisiones de producto — resueltas 2026-09-22

### Un atleta puede pertenecer a varias organizaciones

El esquema ya lo soporta sin cambios: `organization_clients` es único por `(organizationId, athleteId)`, `sharing_consents` cuelga de `organizationClientId` —o sea consentimiento separado por organización— y hay un responsable principal por disciplina **en cada** organización.

**Pero destapa un conflicto real.** `getActiveWorkout` en `lib/assignments.ts` filtra por atleta y ventana de vigencia, no por organización, mientras que `supersedeWorkouts` sí filtra por organización. Con dos organizaciones asignando entrenamiento al mismo atleta, el teléfono se queda con el que publicó último, arbitrariamente, y ninguna sabe de la otra.

La resolución vive en el plan de la app: **planes guardados con el atleta eligiendo cuál está activo** (`pulso/plans/app-plus-y-datos/`). Del lado del portal, la consecuencia es que **el expediente debe mostrar si el plan que publicó esta organización es el que el atleta tiene activo**. Sin eso, un coach lee la adherencia contra un plan que el atleta no está siguiendo.

### Retención tras revocar consentimiento

Se separan dos consentimientos que hoy están colapsados en uno:

| | |
|---|---|
| **Compartir con una organización** | Lo revoca el atleta; el profesional pierde acceso de inmediato. |
| **Respaldo en la nube propio** | Consentimiento aparte, para recuperar al cambiar de teléfono. |

**Revocar el acceso de un profesional no borra el respaldo del atleta**, porque son decisiones distintas con propósitos distintos.

Se evaluó y se descartó cobrar por recuperar datos tras una revocación: convertiría una protección de privacidad en una palanca comercial, y la portabilidad de los datos propios no puede ser una función premium. La exportación es gratuita siempre.
