# PULSO — Supervisión: roles, mensajería, coach y nutricionista

**Estado:** borrador · 2026-07-06

## Objetivo

Que un atleta pueda ser supervisado dentro de la plataforma: un **entrenador** le envía mensajes y le configura los entrenamientos, y un **nutricionista** le configura las dietas. Hoy la app es 100 % local-first (SQLite en el teléfono); la supervisión requiere que ciertos datos viajen entre dispositivos, así que el servidor Next.js pasa de ser solo auth a ser el **hub de sincronización**.

El schema local ya anticipó esto: `coachId` existe en `programs`, `workout_templates`, `meal_plans` y `athlete_profiles`; hay tablas `coach_messages` y `coach_profiles`. La estrategia es no romper el modelo local-first: el servidor guarda lo asignado/enviado, y el teléfono lo sincroniza hacia sus tablas locales existentes.

## Roles

| Rol | Dónde vive | Qué puede hacer |
|---|---|---|
| `athlete` | App móvil (actual) | Todo lo de hoy: registrar entrenos, marcar comidas, pesajes. Recibe planes y mensajes; puede responder mensajes. No edita planes asignados (sí sustituir comidas con nota, como hoy). |
| `coach` | Portal web (Next.js) | Ver a sus atletas vinculados (progreso, adherencia, PRs), enviarles mensajes, crear/editar plantillas de entrenamiento y asignarlas. |
| `nutritionist` | Portal web (Next.js) | Ver adherencia nutricional y peso de sus atletas, enviarles mensajes, crear/editar planes de comida y asignarlos. |
| `admin` | Portal web | Gestión de cuentas y vínculos. (Fase posterior.) |

Better Auth ya tiene el campo `role` en `user` (`additionalFields`, default `athlete`). Cambios: permitir `coach`, `nutritionist`, `admin`; el registro de profesionales se hace por invitación/admin, no desde la app móvil.

Un atleta puede tener **a lo sumo un coach y un nutricionista activos** (relación N atletas → 1 profesional). Mensajería solo entre vinculados.

## Arquitectura de datos

### Servidor (better-sqlite3, nuevas tablas — Drizzle en `server/`)

```
supervision_links   id, professional_id, athlete_id, kind ('coach'|'nutritionist'),
                    status ('pending'|'active'|'revoked'), invite_code, created_at, accepted_at

messages            id, sender_id, receiver_id, content, sent_at, read_at

assigned_workouts   id, athlete_id, coach_id, payload_json (plantilla completa:
                    nombre, tipo, slots[{ejercicio, series, reps, rpe, peso, descanso, step}]),
                    version, status ('active'|'archived'), created_at

assigned_meal_plans id, athlete_id, nutritionist_id, payload_json (plan completo:
                    nombre, slots[{label, hora, descripción, kcal, P, C, G}]),
                    version, status, created_at

athlete_snapshots   id, athlete_id, date, payload_json (resumen diario que sube el
                    teléfono: adherencia, tonelaje, peso, racha), uploaded_at
```

`payload_json` mantiene el servidor simple (no duplica el schema relacional del teléfono); la versión permite saber si el teléfono ya aplicó la última asignación.

### API (route handlers en `server/app/api/…`, sesión Better Auth obligatoria)

- `POST /api/links/invite` (profesional) → genera `invite_code`
- `POST /api/links/accept` (atleta, con código) → vínculo activo
- `GET  /api/links` → mis vínculos
- `GET/POST /api/messages?since=` → conversación con el vinculado
- `GET  /api/assignments?since=` (atleta) → entrenos + dietas asignados pendientes
- `POST /api/assignments/workout | /meal-plan` (profesional)
- `POST /api/snapshots` (atleta, diario) → lo que el profesional ve en su dashboard

Autorización por rol + vínculo activo en cada handler (un coach solo ve a sus atletas).

### Sincronización en el teléfono (`src/lib/sync.ts`)

Polling simple al abrir la app y cada ~60 s en foreground (pull; push de snapshot al finalizar sesión/pesaje/día):

1. **Pull asignaciones:** si hay `assigned_workout` nuevo → reemplaza slots del template local (marca `coachId`); ídem dieta → `meal_plans` local con `coachId`. La UI ya distingue: plan con `coachId` se muestra como "asignado por tu coach" y no es editable (el botón ✎ desaparece; sustituir comida con nota sigue).
2. **Pull mensajes:** upsert en `coach_messages` local (ya existe) + badge de no leídos.
3. **Push snapshot:** resumen del día (adherencia, tonelaje, peso) — nunca se suben los datos crudos, el detalle queda en el teléfono.

Offline: la app sigue funcionando igual; el sync es oportunista.

## UI

### App móvil (atleta)

- **PERFIL → sección "EQUIPO":** muestra coach y nutricionista vinculados (o "Ingresar código de invitación"). Debajo de MI PERFIL (ya construida).
- **Mensajes:** pantalla de chat (`/mensajes`, se llega desde PERFIL o un ícono en HOY con badge de no leídos). Lista de conversaciones (coach / nutricionista) → chat con burbujas, enviado/leído.
- **ENTRENO / DIETA:** banner "PLAN ASIGNADO POR {nombre}" cuando el plan viene de un profesional; edición local bloqueada para esos planes.

### Portal web (coach / nutricionista) — en `server/app/(portal)/…`

- Login (Better Auth ya está), dashboard con lista de atletas y su semáforo de adherencia (de `athlete_snapshots`).
- Detalle de atleta: gráficas de peso/adherencia, PRs, chat.
- Editor de plantilla de entreno (coach) y editor de plan de comidas (nutricionista) → botón "Asignar".

## Fases

1. **Vínculos + roles** — tablas server, invite codes, sección EQUIPO en la app. *(chico)*
2. **Mensajería** — API + chat móvil + chat en portal. *(mediano)*
3. **Asignación de entrenos** — editor coach en portal + sync a template local. *(mediano)*
4. **Asignación de dietas** — ídem nutricionista → meal plan local. *(chico, reusa 3)*
5. **Snapshots + dashboard** — push diario y vista de progreso del profesional. *(mediano)*
6. Push notifications (Expo Push) para mensajes/asignaciones. *(posterior)*

Cada fase es deployable por separado; hasta la fase 3 el atleta no pierde nada de lo actual porque los planes personales siguen siendo editables.

## Decisiones / riesgos

- **Polling antes que WebSockets:** volumen bajo, simplicidad gana; Expo Push cubre la inmediatez percibida en fase 6.
- **`payload_json` vs schema relacional en server:** JSON versionado simplifica; si el portal crece, se normaliza después.
- **El teléfono sigue siendo la fuente de verdad del registro diario;** el servidor solo de lo asignado y los mensajes. Evita conflictos de merge.
- **Privacidad:** el profesional ve resúmenes (snapshots), no la base cruda del atleta.
