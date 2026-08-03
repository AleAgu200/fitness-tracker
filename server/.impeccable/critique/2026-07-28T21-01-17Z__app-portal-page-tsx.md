---
target: "the page at localhost:3000/portal"
total_score: 18
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
timestamp: 2026-07-28T21-01-17Z
slug: app-portal-page-tsx
---
Method: dual-agent (A: a2d21ab77d33ba9db · B: aae83b8d55bae81c8)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Poll failures for athlete list/unread counts are swallowed silently; the one "latest link" stat shown doesn't match reality |
| 2 | Match System / Real World | 3 | Domain language fits, but "ATLETAS ACTIVOS" is just a link count, not an activity measure |
| 3 | User Control and Freedom | 1 | No undo, no explicit cancel on assign panels, edits are silently destroyed on athlete switch |
| 4 | Consistency and Standards | 2 | Alimentos/Ejercicios forms have a CANCELAR button; assign-workout/assign-meals do not; accent color-coding inconsistent |
| 5 | Error Prevention | 1 | No confirmation before overwriting a live assigned plan; incomplete rows silently dropped |
| 6 | Recognition Rather Than Recall | 3 | Dropdowns and always-visible plan version help; native `<select>` has no search |
| 7 | Flexibility and Efficiency | 1 | No shortcuts, no bulk actions, no plan templates/duplication, no sort beyond text filter |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained dark technical aesthetic fits the product; undercut by dense 6-field rows in uniform tiny type |
| 9 | Error Recovery | 1 | Generic one-line errors with no cause or retry; some failures produce no visible error at all |
| 10 | Help and Documentation | 1 | Abbreviated fields ("STEP kg", "DESC. s") have zero inline explanation; no onboarding beyond one hint line |
| **Total** | | **18/40** | **Poor** |

Every heuristic was scored (Operate mode, no exemptions applied — this is a daily-use tool for real clients, not a marketing surface).

## Design Specificity Verdict

**LLM assessment**: The skin is specific, the skeleton is generic. Spanish domain copy, the dark ink/volt/neon palette, uppercase mono micro-labels, and the invite-code linking flow read as intentional and product-grounded. But strip the copy and colors and what's left — sidebar nav + searchable list + detail panel, a bubble-chat widget, three stat cards, dynamic add/remove-row forms — is the shape of a generic CRM/ticketing admin panel. The one feature that would make this unmistakably a *coaching supervision tool* rather than a generic support dashboard — an adherence/progress signal per athlete — is a literal inert placeholder ("disponible cuando la app suba snapshots (fase 5)"). Right now an unrelated SaaS could reuse this composition with a find-replace of labels.

**Deterministic scan**: Clean — 0 findings across `layout.tsx`, `page.tsx`, `assign-workout.tsx`, `assign-meals.tsx`, `lib.ts`, `portal-context.tsx`, `alimentos/page.tsx`, `ejercicios/page.tsx`. This does not mean the UI is well-designed — it means no mechanically-detectable anti-pattern (raw magic-value colors, etc.) fired. Every priority issue below is a UX/logic-level problem (data loss, missing signals, missing confirmation, silent errors) that a regex-based detector structurally cannot catch, which is exactly what Assessment A found and Assessment B's clean run does not contradict.

**Visual overlays**: Not available. No browser-automation tool is connected in this session, and the target route requires an authenticated session gated behind a client-side `useEffect` check, so a plain HTTP fetch would only return an empty/loading shell — reporting that as visual evidence would have been misleading, so neither assessment attempted it. This critique is source- and token-based only; no live-render overlay exists to point you to.

## Overall Impression

The visual language is genuinely product-specific and the one moment of real craft — the plan-assignment success message ("Plan v{version} asignado — {name} lo recibe al abrir la app") — shows the team understands what actually reassures a coach. But the dashboard's core job, per PULSO's own positioning ("real supervision" vs. WhatsApp-and-spreadsheets), is to tell a coach who needs attention today — and right now it can't. Progress/adherence is a placeholder, there's no last-active or last-message signal, and switching between athletes mid-edit silently destroys unsaved work. The biggest opportunity: this is not a bland-design problem, it's a differentiator-not-yet-built problem — the screen looks like PULSO but doesn't yet do the one thing PULSO is supposed to do better than a group chat.

## What's Working

- **Assign-success copy** states the real-world consequence for the athlete ("lo recibe al abrir la app"), not just "saved" — genuinely reduces a coach's uncertainty that the action reached the client.
- **Role-tied accent color** (coach/workout = volt, nutritionist/meals = neon) is real product-specific visual encoding, not generic SaaS blue — though it isn't extended consistently into the shared chrome.
- **Honest empty/interim states**: "Sin atletas vinculados. Generá un código y compartilo." and the phase-5 progress note tell the coach what's actually going on instead of a blank "No data," which is a small but real trust-building choice.

## Priority Issues

**[P0] Silent data loss when switching athletes mid-edit**
- Why it matters: `AssignWorkout`/`AssignMeals` re-fetch and overwrite local form state whenever the selected athlete changes. Clicking a different athlete while scanning a roster — an entirely normal action — discards any unsaved plan edits with zero warning. This directly undermines trust in a professional's daily tool, and is maximally punishing for exactly the power-user workflow of scanning many athletes quickly.
- Fix: track a dirty flag per panel; confirm before discarding unsaved changes on athlete switch ("Tenés cambios sin asignar. ¿Descartar?"), or keep per-athlete drafts in memory.
- Suggested command: `/impeccable harden`

**[P1] No "athlete needs attention" signal anywhere**
- Why it matters: no last-active, last-checkin, or last-message-received indicator exists on the list or detail view; "Progreso del atleta" is a static placeholder. This is the exact differentiator PULSO's own positioning claims over WhatsApp/spreadsheets, and the dashboard currently cannot answer "who needs me today" — its single most important question.
- Fix: surface something cheap now, ahead of phase-5 snapshots — last message timestamp per row, with stale athletes sorted first.
- Suggested command: `/impeccable shape` (to scope a real v1 of this before more polish goes on top of a placeholder)

**[P1] No confirmation before overwriting a live assigned plan**
- Why it matters: "ASIGNAR PLAN →" / "ASIGNAR DIETA →" fire immediately, replacing whatever the athlete currently has assigned, with no diff or confirm. This is a high-stakes action on a real client's week; a misclick silently replaces a fuller previous plan with no recovery path.
- Fix: when a plan is already assigned, show a lightweight confirm summarizing what's being replaced ("Reemplazás el plan v3 (6 ejercicios) — ¿confirmar?").
- Suggested command: `/impeccable harden`

**[P1] Errors are frequently silent or unhelpful**
- Why it matters: athlete-list/unread polling failures are caught and dropped with no user-facing feedback; assign-form errors are generic one-liners with no retry. A coach on a flaky connection has no idea their athlete list is stale, or that a plan assignment silently failed, and may believe a client received something that never sent.
- Fix: add a visible banner for polling failures; make save errors persistent with an explicit retry control.
- Suggested command: `/impeccable clarify`

**[P2] Six-field exercise row exceeds chunking guidance and under-labels itself**
- Why it matters: EJERCICIO/SERIES/REPS/PESO/STEP/DESC. — six live editable fields per row — sit in 9-10px mono type with no explanation of abbreviations like "STEP" for anyone but the feature's author. This is the highest-frequency data-entry surface in the portal and the least legible.
- Fix: label abbreviations explicitly or collapse series/reps/peso into a compact quick-entry cell.
- Suggested command: `/impeccable layout`

**[P2] "ÚLTIMO VÍNCULO" stat is computed incorrectly**
- Why it matters: the stat shows the first athlete's link date, not the actual most recent one — correct only by coincidence of API sort order. Once a coach notices a shown number doesn't match reality, it erodes trust in every other number on the screen.
- Fix: compute the true maximum across all athletes' link dates.
- Suggested command: `/impeccable audit`

## Persona Red Flags

**Alex (Power User, scanning many athletes)**: The list row shows only name/email/unread badge — no plan status, no last-active, so Alex must open every athlete individually to learn anything. No sort control beyond text search. The athlete-switch data-loss bug (P0) is maximally punishing for exactly this rapid multi-athlete workflow. No plan templates or duplicate-to-another-athlete action, so assigning similar programs to multiple clients means re-typing every row by hand.

**Sam (Accessibility-dependent)**: Nav icon glyphs (◆ ✚ ▲) sit in a plain `<span>` with no `aria-hidden`, likely announced redundantly before the text label. The chat message list has no `aria-live` region — new messages arriving via 4-second polling are never announced. The unread-count badge is a bare number with no `aria-label` context. Inputs replace the native focus outline with only a subtle 1px border-color change — a thin, easy-to-miss focus indicator. (Counterexample worth preserving: icon-only delete buttons in the assign forms do have proper `aria-label`s already — extend that pattern rather than reinventing it.)

## Minor Observations

- `Msg.readAt` is tracked and marked via the API but never surfaced to the coach — no "seen" indicator despite the data existing.
- The role-gate fallback screen exposes a raw `node scripts/set-role.mjs` shell command to a real invited professional whose role hasn't synced yet — reads as a dev-console leak into a real-client experience.
- Chat input is single-line with no multiline support — awkward for a coach writing a longer structured note.
- Sidebar role label and page subtitle both repeat "ENTRENADOR/NUTRICIONISTA" redundantly on screen at once.
- `<select>` pickers for exercises/foods have no in-list search — will get unwieldy given the exercise library imports 1300+ entries from WorkoutX.

## Questions to Consider

- If athlete progress/adherence is the actual reason a coach would choose PULSO over WhatsApp, why does the highest-traffic screen ship that section as inert placeholder text instead of even a minimal computed proxy today?
- The UI currently discards an in-progress plan edit the instant a coach clicks a different athlete — has this already cost a real edit with the named test accounts, or has nobody hit it yet because usage is still light?
- Role-based accent color (volt vs. neon) diverges in the assignment panels but not in the shared chrome — is that a deliberate system waiting to be extended, or an artifact of who built which page first?
