# POCKET-SPOTTER-001 — Full-flow Pocket Spotter redesign

type: fb-lane-handoff
from_workstream: design
to_workstream: product
status: ready

## Goal Alignment Session

Product Goal: Make daily meal and strength tracking motivating, personal, and easy to act on.
Workstream Goal: Redesign the complete user journey around a user-created mini coach without
copying Duolingo or letting a mascot compete with core fitness actions.
Lane OKR Fit: aligned
User Approval Needed: no — the user selected the key product and interaction tradeoffs.
Mini-loop Evidence: Source audit plus Mobbin review of onboarding, avatar builders, persistent
companions, workout logging, exercise demos, recovery, completion, and weekly recap patterns.
Evidence Against Product OKR: None identified.

## Summary

Introduce **Pocket Spotter**, a user-created stylized mini trainer that lives in the app bar,
expands into inline coach cards only when useful, and provides scripted motivational reactions
and animated exercise demonstrations. Keep the existing Today, Train, Plan, Progress, and Me
architecture, but rebuild the hierarchy of each screen around one obvious next action.

V1 is multi-user-ready, deterministic, caption-only, and motivation-first. It does not include
chat, generative AI, voice, streak punishment, paid recovery, or medical/nutrition claims.

## Locked design decisions

- Coach style: **Bean & Sticks** with articulated limbs and a simple one-piece Dusk training
  tank. The tank has two straps and a scoop neck. The example coach is Juno in Seafoam.
- Creator: coach name, bean build (Tall, Round, or Squat), face, accessory, six-color palette,
  and one of three tones:
  **Steady** (calm), **Spark** (upbeat), or **Straight-up** (brief and direct).
- Presence: a 44px coach-head button in the persistent app bar; profile access remains in Me.
- Expansion: contextual cards render inline below the screen heading, never as a floating
  overlay over forms, charts, set inputs, sheets, or bottom navigation.
- Intelligence: event-driven message templates selected from existing goal, meal, habit,
  workout, and progress state. No LLM dependency.
- Audio: none in V1. Every message and demo is understandable from text and visuals alone.
- Motion: short pose/reaction loops; stop decorative loops after two cycles. Reduced-motion
  mode uses a static pose and opacity changes only.
- Delivery: staged rollout, with coach foundations before broader demo and recap coverage.

## Revised end-to-end journey

`Login → goal setup → baseline → target details → build Pocket Spotter → plan-and-coach reveal
→ Today next action → meal or workout flow → completion reaction → weekly Progress story →
gentle recovery after inactivity → edit coach/settings in Me`

### Entry and onboarding

1. **Login:** retain guest-first and email magic-link paths. Show the Pocket Spotter only as a
   silhouette/teaser so the user still feels they create it. Keep guest data-loss copy next to
   the guest action, not buried later.
2. **Goal:** ask for the primary reason and a short goal title. Offer strength, fitness,
   consistency, and event-based presets plus a custom title.
3. **Baseline:** ask for name and training level. Current weight is optional; explain its use
   in progress trends.
4. **Target:** goal weight and target date are optional and shown only as useful planning
   inputs, so strength/consistency users are not forced into weight loss framing.
5. **Coach builder:** keep the live Pocket Spotter preview above shallow category controls;
   configure the name, three visual parts, palette, and tone in under one minute.
6. **Reveal:** show the generated plan, the named coach, today's first action, and one primary
   `Go to Today` button. Do not request notification permission until the user enables reminders.

### Primary screens

| Screen | Revised hierarchy | Pocket Spotter behavior |
|---|---|---|
| Today | Greeting/next-action card → meals → daily goals → today's workout | One daily greeting, then reactions only after meaningful actions; current unlogged meal wins next-action priority, then workout, then an incomplete habit. |
| Meal sheet | Photo → note → portion → physical feeling → save | Hidden while editing; after save, show a brief inline/toast reaction. Replace judgmental “guilty” with `energized`, `satisfied`, `still hungry`, and `heavy`. |
| Meal History | Month summary → calendar → selected-day entries | Collapsed app-bar presence; optional monthly observation based only on logged frequency, never calories or food morality. |
| Train overview | Current workout summary → progress → exercise list → start/continue | Small warm-up pose and one sentence before start; never displace workout details. |
| Active workout | Active exercise/set → previous values → inputs → rest/next action | Coach remains collapsed during entry. React only at first completed exercise, personal best, final exercise, or user-opened demo. |
| Exercise demo | Animated coach loop → exercise name/targets → two form cues → return action | Coach performs the loop. Always provide static poster and text fallback; label demos as general guidance, not medical advice. |
| Workout complete | Duration/sets/volume → one achievement → continue | Short coach celebration, then return to Today or view Progress; no mandatory sharing. |
| Plan | Weekly overview → selected day → meal guidance/guide | At most one “why this day matters” explanation; no recurring speech bubbles on every card. |
| Progress | Coach weekly story → habits → strength → weight → notes | Story format: one win, one observed pattern, and one next step. Separate facts from encouragement. |
| Me | Identity/account → Coach Studio → goal/reminders → advanced tools | Rename/rebuild coach; change tone; hide coach; reduce motion; reset tips; preserve guest sign-out warning. |
| Empty/error/recovery | Plain explanation → safe retry or restart action | Use supportive copy and a neutral pose. After two inactive days, offer `Continue today's plan`; never sell streak repair or erase history. |

## Coach behavior system

- Message priority: errors/safety → active-workout instruction → next action → earned
  celebration → generic encouragement.
- Unsolicited limit: maximum two expanded coach cards per session and one reaction per user
  action. Additional events update the collapsed coach badge without interrupting.
- Daily deduplication: greetings once per local day; weekly recap once per goal week; personal
  best once per exercise/session; recovery once per inactivity episode.
- Every card supports dismiss. Me supports hide, reduced motion, and reset-coach-tips controls.
- Templates must be written for all three tones and fall back to Steady. Dynamic values are
  limited to trusted app facts such as completed meals, completed sets, goal title, and dates.
- Do not infer mood, body image, injury, calories, or nutrition quality from activity data.

## Data, interfaces, and assets

- Add user-scoped `coach_profiles`: `user_id`, `coach_name`, `tone`, `base_shape`, `face`,
  `accessory`, `palette`, `visible`, `reduced_motion`, timestamps, and RLS matching other
  user-owned tables.
- Add `coach_event_receipts`: `user_id`, `event_key`, `scope_key`, `shown_at`, `dismissed_at`,
  with a unique `(user_id, event_key, scope_key)` constraint to prevent cross-device repeats.
- Add data-access functions `getCoachProfile`, `upsertCoachProfile`, `getCoachEventReceipts`,
  and `recordCoachEventReceipt`; failure to load coach data must never block the fitness app.
- Extend each exercise definition with `demoPoster`, `demoLoop`, `demoCues[2]`, and
  `targetMuscles`. Demo media is lazy-loaded and uses local, versioned asset paths.
- Demo coverage: Stage 2 covers the 38 exercises used directly by generated/peak plans;
  Stage 3 adds the remaining 13 swap alternatives so all 51 library exercises converge on
  equal coverage.
- Use modular SVG parts for the persistent coach and static poses. Use short silent animated
  WebP/WebM loops with poster fallbacks for exercise demos; do not autoplay them until the
  demo sheet opens.

## Delivery plan

1. **Visual prototype and content inventory:** create phone mockups for coach builder, Today,
   active Train, demo sheet, Progress recap, and recovery at 390px. Approve the character
   proportions, app-bar perch, inline card footprint, and three tone samples before source work.
2. **Foundation:** add schema/data access, modular coach renderer, template/event selector,
   deduplication, accessibility settings, and app-bar coach button. Existing users receive a
   default Steady coach and are invited—not forced—to customize it.
3. **Activation:** replace onboarding with the six-state journey, add coach reveal, and revise
   Today, meal feelings, empty/error copy, and action priority.
4. **Workout:** revise Train hierarchy, add rest/active-set states, completion summary, demo
   sheet, and the first 38 animated exercise loops.
5. **App-wide completion:** add weekly Progress story, restrained Plan/History states, Coach
   Studio in Me, inactivity recovery, and the remaining 13 demo loops.
6. **Hardening:** performance budgets, service-worker/cache update, copy review, migration
   verification, responsive screenshots, real-device keyboard/safe-area checks, and staged
   release behind a coach feature flag before making it the default.

## Acceptance and test plan

- Existing and new users can complete coach setup, persist it across sessions/devices, edit
  it later, or hide it without losing fitness data.
- Every primary screen works when coach tables or media fail; a static fallback renders and
  primary actions remain usable.
- Render tests cover login, all onboarding states, five tabs, meal sheet/history, workout
  overview/active/demo/complete, recap, recovery, coach editor, hidden coach, and no-goal states.
- Event tests verify priority, per-session limits, daily/weekly deduplication, personality
  fallback, and no repeated celebration after rerender or refresh.
- Schema/RLS tests prove users cannot read or write another user's coach profile or receipts.
- Demo tests verify 51 exercise mappings, lazy loading, poster fallback, text cues, and
  reduced-motion behavior.
- Visual QA at 320px, 390px, and 480px covers long names/goals/exercises, keyboard-open forms,
  bottom safe areas, charts, sheets, coach cards, and no overlap with navigation or set inputs.
- Accessibility: 44px targets, AA contrast, meaningful labels, logical focus order, no
  animation-dependent information, and system `prefers-reduced-motion` honored by default.

## Mobbin evidence used

- [Tonal fitness profile](https://mobbin.com/flows/9f597ed6-aea4-4ec7-b573-48ea7484b164),
  [Equinox+ personalization](https://mobbin.com/flows/754cee5d-c1f4-44a7-9ae9-5e09474db3a3),
  and [Centr onboarding](https://mobbin.com/flows/848ee3f1-7bc7-403d-a2ff-f58b178fadfe)
  for progressive onboarding and plan reveal.
- [Any Distance coach placement](https://mobbin.com/screens/11be9640-c3b5-40ee-a59c-6688a5ce1e7c),
  [Tolan creator](https://mobbin.com/screens/8d620c4e-5887-4e39-bf7b-fc2fb683187f), and
  [Duolingo avatar creator](https://mobbin.com/screens/50ba3e32-7cca-4c97-b757-cccdec716e76)
  for character presence and bounded customization.
- [Hevy workout logging](https://mobbin.com/flows/7b6374ff-8ff6-4d7b-babe-077e72b6ee1f),
  [Runna demo](https://mobbin.com/screens/dbd2f8a6-93e7-47fd-8e35-2a8bf62daf3b), and
  [Equinox+ completion](https://mobbin.com/flows/472bf5b7-3baa-4041-9b9d-b3b205a25b59)
  for active workout and demonstration hierarchy.
- [Finch recovery](https://mobbin.com/screens/d6e7a7b1-4b61-40b1-8ff7-1c602badec85),
  [Runna return choices](https://mobbin.com/screens/0116015c-bb3b-46fd-a2f6-3194ad72193a), and
  [Runna weekly overview](https://mobbin.com/screens/48d9e879-8ad7-4c03-8483-8b064eb3a4f1)
  for shame-free re-entry and recap structure.

## Visual Preview Decision

browser screenshot/mockup

## Visual QA Status

The current Bean & Sticks mockups are in `docs/mockups/pocket-spotter/`. All six 390 × 844
screens and both character boards use the Elemental Gradient skin, DM Sans for body copy,
and Archivo for headings and controls. The
[published Claude canvas](https://claude.ai/artifact/XJVhHrwo1xNM91XRTffSrY) contains the
Bean & Sticks redraw with the previous typography.

## Remaining Visual Gates

- Review the updated character system and six phone mockups before app implementation.
- Capture implemented screenshots at 320px, 390px, and 480px plus real-device sheet,
  keyboard, safe-area, and reduced-motion evidence.

## Post-Action Card Summary

- Card ID: POCKET-SPOTTER-001
- Final status: updated Bean & Sticks mockups ready for review
- Changed files: mockup boards, canvas metadata, this handoff, and `docs/REFERENCE.md`
- Next owner: Product/user mockup review, then staged implementation
- Live deploy: blocked until explicitly authorized

