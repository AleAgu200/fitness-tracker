# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

PULSO ships two surfaces on two platforms: the athlete-facing app is Expo/React Native (iOS + Android), and should follow each OS's native structural conventions (tab bars, back gestures, safe areas) while keeping its custom dark brand layer (mono/grotesk type, bespoke icons, pulsing-light accents) on top. The coach/nutritionist portal (`server/`) is a standard web surface (Next.js).

## Users

- **Athletes** — primary users, on the mobile app (`pulso/`). Log workouts, meals, checkins, and measurements day to day; may be supervised by a linked coach and/or nutritionist, receiving assigned plans and messages.
- **Coaches** — on the web portal (`server/app/portal`). Manage a roster of linked athletes: view progress/adherence/PRs, send messages, create and assign workout templates.
- **Nutritionists** — on the web portal. View nutritional adherence and weight trends for linked athletes, send messages, create and assign meal plans.
- Current audience is personal-scale: the builder's own account plus a small number of real clients (mirrored by the coach.test / nutri.test / atleta.test accounts), not a public app-store launch. Design should serve known, named users rather than anonymous-stranger onboarding at scale.

Language is Spanish throughout both surfaces (confirmed in mobile UI copy and portal copy, e.g. "Ingresar").

## Product Purpose

A fitness-tracking app that stays local-first (workout logs, nutrition, check-ins, and measurements originate in on-device SQLite for speed and offline use) while still supporting real professional supervision. Authorized categories are replicated incrementally after server acknowledgement so the professional portal, recovery, and future devices can use a canonical server copy; the athlete retains control over which organization can access each category. Success is an athlete who trains and eats on a plan a real professional set for them, tracked entirely inside one system.

## Positioning

Most solo logging apps (Strong, Hevy, MyFitnessPal) have no professional-supervision layer, and most real coaching relationships run informally outside any app (WhatsApp threads, spreadsheets, ad hoc PDFs). PULSO combines both: the athlete gets a fast, offline-capable, local-first logging experience, and the coach/nutritionist gets a proper tool to assign plans and communicate — replacing the informal channel, not adding a second system next to it.

## Operating Context

- **Mobile app (athlete):** used daily/multiple times a day around workouts, meals, and weigh-ins; must work fully offline (local-first SQLite via Drizzle), syncing opportunistically.
- **Web portal (coach/nutritionist):** used to manage a roster of linked athletes — assign workout templates and meal plans, message athletes, review adherence/progress dashboards. Requires connectivity (standard web app).
- **Professional onboarding:** coaches and nutritionists can create their own professional account and private organization. The signup endpoint only grants a professional discipline, never a global administrator role, and deployments may require `PROFESSIONAL_SIGNUP_CODE`. Profile, notification preferences, landing section, and password management live in the portal.
- **Sync model:** SQLite remains the athlete's offline operational store. The phone sends ordered, idempotent domain mutations through a durable outbox and pulls server changes by opaque sequence cursor. After acknowledgement, the server replica is canonical for the professional portal and recovery. The first cut permits one active writer device per athlete; assignments and permissions are always server-authoritative.
- **Privacy and consent:** professional access requires an active organization membership, an active care assignment with a compatible discipline, and athlete consent for the organization + category (`training`, `nutrition`, `metrics`, `checkins`, or `photos`). Revocation blocks professional reads and future uploads immediately and is never represented as zero adherence. Photos and free-form notes are never shared by default. Historical payload deletion after revocation remains an explicit pre-release retention decision; audit metadata is preserved.
- **Roles:** `user.role` remains temporarily for Better Auth compatibility. Effective authorization uses organization roles (`owner`, `admin`, `professional`), professional capabilities (`coach`, `nutritionist`), care assignments, and consent. An athlete may belong to multiple organizations with separate consent and one primary professional per discipline in each care relationship; one-to-one messages remain private to their participants.
- **External data:** WorkoutX API integrated server-side for exercise search/import (Spanish query translation, 24h cache); imported exercises preserve source, external ID, visual reference, and technical context. Library edit rights are split by role — nutritionists edit the food library, coaches edit the exercise library, both can read.

## Capabilities and Constraints

- Mobile: Expo SDK 56, expo-router, Drizzle + expo-sqlite, migrations applied at startup.
- Server: Next.js 16 + Better Auth + PostgreSQL/Drizzle, acting as auth provider, professional portal, audit store, and incremental sync hub.
- Mobile and server must agree on the same LAN IP (`EXPO_PUBLIC_SERVER_URL`, `BETTER_AUTH_URL`, `TRUSTED_ORIGINS`) during development; this is a known dev-environment fragility, not a product constraint.
- Tab icons on mobile must be MaterialCommunityIcons (@expo/vector-icons) — expo-symbols/SF Symbols do not render on Android, so icon choices must work cross-platform even though the platform value is "adaptive."
- Undecided: whether/when this moves beyond the current personal + small-client scale toward a public release; no positioning or onboarding claims should be built assuming strangers yet.

## Brand Commitments

- Product name: PULSO.
- Mobile motion language: no bounce/spring entrance animations — pulsing-light accents (`GlowPulse`) instead, per prior explicit direction.
- Existing UI kit (`pulso/src/components/ui/kit.tsx`): Label, Card with staggered fade-in, PressableScale with haptics, AnimatedBar, GlowPulse — treat as established brand vocabulary, not to be casually replaced.

## Evidence on Hand

- Three real test accounts exercising all three roles: coach.test@pulso.dev, nutri.test@pulso.dev, atleta.test@pulso.dev (password test1234), plus the builder's real account linked to coach.test with an active test workout assignment.
- No testimonials, press, case studies, or third-party benchmarks exist; none should be fabricated.

## Product Principles

1. Local-first stays non-negotiable — the phone must remain fully usable offline; sync is additive, never a dependency for core logging.
2. Supervision augments, it doesn't replace athlete agency — assigned plans are visible and trackable, but substitution-with-note and the athlete's own log stay intact.
3. Design for named, known users (current real clients) before anonymous-scale onboarding — polish for the relationships that exist today, not a hypothetical funnel.
4. One system, two audiences — the athlete app and the professional portal are one product; features on either side should assume the other exists.
5. Sharing is explicit and scoped — detailed domain data may replicate to the server only for consented categories; the phone remains the offline operational store and the athlete can revoke future professional access.

## Accessibility & Inclusion

No product-specific accessibility requirement has been established yet; standard platform accessibility conventions apply per surface (see the adaptive platform note above).
