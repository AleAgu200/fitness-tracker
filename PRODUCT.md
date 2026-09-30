# Product

<!-- impeccable:product-schema 1 -->

## Planning authority

The current release scope and decisions live in `plans/plan-maestro/plan.mdx` (2026-09-29). `plans/README.md` classifies supporting and historical plans. Priorities are nutrition, training, and publication in both mobile stores for Honduras. Proposed features below are not claims of shipped behavior; the master plan records implementation evidence and validation gates.

Release setup confirmed by the owner: Play Console is a personal account created 2026-09-29 and remains under verification; Expo/EAS was also newly created. Development and local/EAS testing continue without waiting for Play verification, but Android Play submission is blocked until it completes. The personal-account production path must include the then-current closed-test requirement; the plan records the currently documented 12 opted-in testers for 14 continuous days before applying for production access. Apple Developer enrollment is pending. The designated help site is `https://help.pulsofitness.tech` and support address is `pulso@pulsofitness.tech`; DNS, HTTPS and mail delivery/receipt still need verification. Initial access is adults only, age 18+. The owner proposes Plus at US$3/month without commercial usage quotas; the app must sustain itself from revenue, with no fixed spending cap specified. Feasibility remains unproven, and this does not authorize unbounded spending. These are planning decisions, not implemented controls or published subscription terms.

## Platform

adaptive

PULSO ships two surfaces on two platforms: the athlete-facing app is Expo/React Native (iOS + Android), and should follow each OS's native structural conventions (tab bars, back gestures, safe areas) while keeping its custom dark brand layer (mono/grotesk type, bespoke icons, pulsing-light accents) on top. The coach/nutritionist portal (`server/`) is a standard web surface (Next.js).

## Users

- **Athletes** — primary users, on the mobile app (`pulso/`). Log workouts, meals, checkins, and measurements day to day; may be supervised by a linked coach and/or nutritionist, receiving assigned plans and messages.
- **Coaches** — on the web portal (`server/app/portal`). Manage a roster of linked athletes: view progress/adherence/PRs, send messages, create and assign workout templates.
- **Nutritionists** — on the web portal. View nutritional adherence and weight trends for linked athletes, send messages, create and assign meal plans.
- Initial public market is Honduras. The next milestone is publication in App Store and Google Play; user count is unknown. Existing personal and professional test relationships remain useful validation cases. Public signup, account recovery, support and store readiness are now part of release scope.

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
- **Privacy and consent:** professional access requires an active organization membership, an active care assignment with a compatible discipline, and athlete consent for the organization + category (`training`, `nutrition`, `metrics`, `checkins`, or `photos`). Revocation immediately blocks that organization's reads and sharing, and is never represented as zero adherence. Independently consented personal backup may continue; revoking a professional does not delete the athlete's backup. Photos and free-form notes are never shared by default. Detailed retention and account-deletion behavior is specified in the master plan; auditing must not retain personal payloads indefinitely.
- **Roles:** `user.role` remains temporarily for Better Auth compatibility. Effective authorization uses organization roles (`owner`, `admin`, `professional`), professional capabilities (`coach`, `nutritionist`), care assignments, and consent. An athlete may belong to multiple organizations with separate consent and one primary professional per discipline in each care relationship; one-to-one messages remain private to their participants.
- **External data:** WorkoutX API integrated server-side for exercise search/import (Spanish query translation, 24h cache); imported exercises preserve source, external ID, visual reference, and technical context. Library edit rights are split by role — nutritionists edit the food library, coaches edit the exercise library, both can read.

## Capabilities and Constraints

- Mobile: Expo SDK 56, expo-router, Drizzle + expo-sqlite, migrations applied at startup.
- Server: Next.js 16 + Better Auth + PostgreSQL/Drizzle, acting as auth provider, professional portal, audit store, and incremental sync hub.
- Mobile and server must agree on the same LAN IP (`EXPO_PUBLIC_SERVER_URL`, `BETTER_AUTH_URL`, `TRUSTED_ORIGINS`) during development; this is a known dev-environment fragility, not a product constraint.
- Tab icons on mobile must be MaterialCommunityIcons (@expo/vector-icons) — expo-symbols/SF Symbols do not render on Android, so icon choices must work cross-platform even though the platform value is "adaptive."
- Public release in Honduras is the target; timing follows verified milestones rather than an unvalidated date. The owner and development agent are the working team; testing starts on the owner's iPhone through cloud builds from Windows, with Android device coverage required before release.

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
3. Validate with real people in Honduras while supporting public onboarding and recovery. Keep infrastructure small until measured use justifies growth.
4. One system, two audiences — the athlete app and the professional portal are one product; features on either side should assume the other exists.
5. Sharing is explicit and scoped — professional sharing and personal cloud backup have separate consent. The phone remains the offline operational store and the athlete can revoke professional access independently of their backup.

## Confirmed release direction — 2026-09-29

- Preserve the PULSO identity; improve liquids, interactive widgets, achievement variety and shareable workout results.
- Nutrition entry centers on foods and portions. Catalogs, barcode/label extraction and AI assist with nutrients; missing values remain unknown, and estimates remain distinguishable from sourced values.
- Plus users need visible AI generation in both plan libraries, multiple saved generations, editable preferences, AI plan renaming, direct duplication, and explained evaluation/recommendations.
- Automatic personal backup requires Plus. Restoring an existing valid backup is free. On expiry, retain one latest complete valid copy and stop automatic creation; exact mechanics are in the master plan.
- Monetization continues through subscriptions and ads. Plus has no commercial usage quotas; technical concurrency, payload and anti-abuse safeguards remain explicit. Validate the proposed US$3/month against full operating costs without AWS credits before publication; do not introduce hidden quotas or claim proven profitability. Preserve existing subscriber commitments.
- Retention is one month for data without an authorized purpose, professional notes and operational backups. The master plan proposes precise expiry triggers and purge tests; this is separate from the authorized personal snapshot retained when Plus expires and does not purge active athlete history monthly.
- Professional essentials are check-in review and evidence-based supervision. Lack of recorded training is not proof of gym absence. Agenda/documents are later milestones; progress-photo uploads and any bounded AI evaluation are future work.

## Accessibility & Inclusion

No product-specific accessibility requirement has been established yet; standard platform accessibility conventions apply per surface (see the adaptive platform note above).
