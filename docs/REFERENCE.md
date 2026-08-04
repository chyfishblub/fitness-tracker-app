# Technical Reference — Fitness Tracker

Living document. Update the **Changelog** at the bottom every time you make a real change —
that's the whole point of this file existing.

See [PRD.md](PRD.md) for *why* things work this way. This doc is *how*.

---

## 1. Architecture

No build step. Plain HTML/CSS/JS, loaded via `<script>` tags in order, plus the Supabase JS
client from a CDN. Backend is entirely Supabase (Postgres + Auth + Storage + Edge Functions).

```
Browser (vanilla JS PWA)
├── index.html        shell; loads Supabase CDN, then scripts in dependency order
├── js/config.js       SUPABASE_URL + anon (public) key
├── js/supabase.js     client init + all data-access functions (the only file that talks to Supabase)
├── js/auth.js         session gate, magic-link screen, onboarding flow
├── js/data.js         plan TEMPLATES, exercise library, habit defs, guide content
├── js/plan.js         plan generator: (goal, level) → weekly schedule; override merging
└── js/app.js           state, render(), event handling — the UI layer
        │
        ▼
Supabase project
├── Auth              anonymous guest session + email magic link
├── Postgres          one table per concern, RLS on every table (auth.uid() = user_id)
├── Storage           private bucket `meal-photos/{user_id}/...`, signed URLs for reads
└── Edge Functions    send-meal-reminders (Web Push), triggered by Supabase Cron
```

**Load order matters** in `index.html`: Supabase CDN → `config.js` → `supabase.js` →
`data.js` → `plan.js` → `app.js` → `auth.js`. Each file assumes the previous ones already
ran (plain globals, no modules/bundler). `auth.js` loads last because its `boot()` call
(which fires immediately) needs `initApp()` from `app.js` to already be defined.

## 2. Database schema

Full source of truth: [`supabase/schema.sql`](../supabase/schema.sql). Summary:

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | one row per user | `id` (=auth uid), `display_name`, `training_level`, `onboarded_at` |
| `goals` | a target the plan is generated from | `title`, `target_date`, `start_weight`, `goal_weight`, `template_id`, `duration_weeks`, `start_date`, `is_active` |
| `meal_logs` | food journal entries | `log_date`, `meal_type` (breakfast/lunch/dinner/snack), `photo_path`, `note`, `portion`, `feeling`, `logged_at` |
| `workout_overrides` | personal swap/adjust layered on a generated plan | `goal_id`, `week`, `day`, `slot`, `exercise_id`, `sets`, `reps`, `rest`, `removed` |
| `set_logs` | actual weight × reps performed | `log_date`, `exercise_id`, `set_number`, `weight_kg`, `reps` |
| `weight_entries` | weigh-ins | `entry_date`, `weight_kg` |
| `habit_logs` | daily habit ticks | `log_date`, `habit_id`, `done` |
| `push_subscriptions` | Web Push endpoints | `endpoint`, `p256dh`, `auth` |

Every table has `user_id uuid references auth.users` and RLS policies restricting
select/insert/update/delete to `auth.uid() = user_id`. The Supabase anon key is public by
design — RLS is the actual security boundary, not the key.

`meal_logs` has a **partial unique index** on `(user_id, log_date, meal_type)` for
`meal_type IN ('breakfast','lunch','dinner')` — logging the same meal twice in a day
edits/upserts the existing row. Snacks are excluded from that index (unlimited per day).

Photos live in Storage bucket `meal-photos`, path `{user_id}/{log_date}/{meal_type}-{ts}.jpg`,
bucket is **private**; the app reads them via short-lived signed URLs, never public URLs.

## 3. Plan templates & exercise library

`js/data.js` holds:
- **Templates** — e.g. `lean-peak` (repeating training week + an appended peak week when the
  goal has a `target_date`) and `consistency` (same weekly structure, no peak week, for
  goals with no fixed end date). A template defines the workout week(s) and the matching diet
  plans (training-day / rest-day / peak-low / peak-refill), same shape as the original
  hardcoded 5-week plan.
- **Exercise library** — every exercise has an `id`, a `muscle` group, and an `alternatives`
  list of other exercise IDs targeting the same muscle group. This is what powers the swap
  picker. (V2: demo GIFs will key off the same `exercise_id`, so no schema change needed
  later.)

`js/plan.js` turns a `goal` row + `training_level` into a concrete schedule:
- `generatePlan(goal, level)` → array of weeks, each an array of days, each day an array of
  exercise slots `{ exercise_id, sets, reps, rest }` plus its diet plan.
- `applyOverrides(plan, overrides)` → merges `workout_overrides` rows on top (swap
  `exercise_id`, adjusted `sets`/`reps`/`rest`, or `removed`).
- `getToday(plan, date)` → resolves which week/day of the plan corresponds to "today" from
  the goal's `start_date`.

Plans are **never stored pre-computed** — they're cheap to regenerate from
`(template_id, duration_weeks, training_level)` + overrides, so editing a goal or adding an
override just re-renders.

## 4. Meal windows

Defined once, in `js/data.js` (or `plan.js`) as plain constants:

```js
const MEAL_WINDOWS = {
  breakfast: { start: "07:00", end: "09:00" },
  lunch:     { start: "12:00", end: "15:00" },
  dinner:    { start: "18:00", end: "20:00" },
};
```

Windows only decide which meal card is **highlighted/expanded** on Home and which meal a
push notification nudges for — they never block logging. Outside all windows, Home
highlights whichever named meal is next chronologically (or the most recent one still
unlogged, once past dinner).

## 5. Push notifications

- `sw.js` handles `push` (show notification) and `notificationclick` (focus/open the app,
  deep-link to the meal log sheet) events.
- Client subscribes via `PushManager.subscribe({ applicationServerKey: VAPID_PUBLIC_KEY })`
  from a toggle in Profile; the subscription (`endpoint`, `p256dh`, `auth`) is saved to
  `push_subscriptions`.
- **Edge Function** `supabase/functions/send-meal-reminders`: iterates subscriptions, skips
  any user who already has a `meal_logs` row for that `meal_type`/date, sends Web Push via
  VAPID. Scheduled with Supabase Cron at ~08:00, ~12:30, ~19:00 (single fixed timezone in
  V1 — see PRD §7 for the per-user-timezone V2 item).
- **iOS caveat**: Web Push only fires on iOS Safari once the PWA is installed to the Home
  Screen (iOS 16.4+). Document this to the user in-app (e.g. a Profile hint) rather than
  silently failing.

## 6. Setup runbook

1. Create a free project at supabase.com.
2. **Auth** → Providers → enable anonymous sign-ins. Enable Email and turn on "Magic Link".
   Then open **Auth →
   URL Configuration**, set **Site URL** to the exact production origin, and add the
   production URL plus `/**` to Redirect URLs. Never leave the production Site URL set to
   `localhost`; Supabase falls back to Site URL when a requested redirect is not allowed.
3. **SQL Editor** → run `supabase/schema.sql` in full (creates tables, RLS policies,
   indexes, storage bucket + policies).
4. **Project Settings → API** → copy the Project URL and `anon` public key into
   `js/config.js`.
5. Commit and redeploy (GitHub Pages picks up the push automatically).
6. **Push notifications** (optional, can be skipped for a first deploy):
   - Generate a VAPID key pair: `npx web-push generate-vapid-keys`.
   - Set Edge Function secrets: `supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com`
     (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-provided to every Edge
     Function — don't set those yourself).
   - Paste the **public** key into `js/config.js` as `VAPID_PUBLIC_KEY` (safe to expose).
   - Deploy: `supabase functions deploy send-meal-reminders`.
   - Add three Cron schedules (Dashboard → Edge Functions → Cron, or `pg_cron` +
     `net.http_post`) that POST a JSON body to the function at 08:00, 12:30, and 19:00
     Asia/Kuala_Lumpur: `{"mealType":"breakfast"}`, `{"mealType":"lunch"}`,
     `{"mealType":"dinner"}` respectively.
   - On iPhone: Safari → Share → Add to Home Screen, then enable notifications from Profile.

## 7. How to extend

- **Add an exercise**: add an entry to the exercise library in `js/data.js` with an `id`,
  `muscle`, and any `alternatives`; add its `id` to any relevant `alternatives` arrays on
  other exercises in the same muscle group so the swap picker is bidirectional.
- **Add a plan template**: add a new template object to `js/data.js` following the shape of
  `lean-peak`/`consistency`; it becomes selectable when creating a goal.
- **Add a habit**: append to `habitDefs` in `js/data.js` — Today and the Progress weekly
  editor pick it up automatically.
- **Change meal windows**: edit `MEAL_WINDOWS`; update the Edge Function's cron schedule to
  match if you move the times materially.

## 8. Legacy data

Pre-Supabase versions stored everything in `localStorage` under key
`fitnessTracker_app_v1` (weights, completed workouts/meals/habits, notes). On first login,
`js/auth.js` checks for that key and offers a one-time import of weigh-ins and habit history
into the new tables, then leaves the key alone (does not delete it) so nothing is lost if
the import is skipped.

---

## Changelog

### 2026-08-04 — Meal history and meal-save repair
- Added a Home → History entry point and a responsive monthly meal calendar with photo/count
  markers, previous/next month navigation, and selected-day journal details.
- Kept logged meals intentionally free of calorie estimates while preserving the existing
  photo, note, portion, feeling, and time metadata for later nutrition features.
- Fixed breakfast/lunch/dinner saves by replacing an invalid PostgREST upsert against the
  partial `meal_logs_one_per_day` index with explicit insert/update-by-id behavior. Live
  reproduction returned PostgreSQL `42P10`; the corrected create, update, range query, and
  cleanup sequence all passed against Supabase.
- Added render and persistence regression checks and bumped the installed-app cache to `v8`.

### 2026-08-04 — Guest sign-in
- Added one-tap anonymous Supabase sign-in as the primary entry path, avoiding email delivery
  limits while preserving the existing email magic-link option for cross-device access.
- Added guest-account messaging in Profile, documented the device-bound limitation, extended
  auth render checks, guarded guest sign-out against accidental data loss, and bumped the
  installed-app shell cache to `v7`.

### 2026-08-04 — Full app design system and navigation overhaul
- Replaced six horizontally scrolling top tabs with a persistent five-item bottom navigation:
  Today, Train, Plan, Progress, and Me.
- Added a compact app bar and shared typography, spacing, color, component, focus, safe-area,
  reduced-motion, responsive, loading, toast, sheet, and empty-state treatments.
- Rebuilt Train around a current-day hero, optional schedule browser, row-based set logging
  with previous values, exercise overflow actions, and a sticky start/continue action.
- Combined Eat + Guide into Plan, combined weekly Habits + body/strength charts into
  Progress, and simplified Me to goals, reminders, account, and advanced data tools.
- Redesigned login around the product value proposition and changed onboarding into three
  short personalized steps with a final plan preview.
- Used Mobbin references from Centr/Ladder (app shell), Hevy/Gymshark (set logging),
  Cal AI/Google Fit (progress), and Equinox+ (personalization flow) to inform structure.
- Added dependency-free UI render checks and bumped the installed-app shell cache to `v6`.

### 2026-08-04 — Home dashboard redesign
- Reordered Home around the daily flow: compact goal status, three-segment meal logger,
  six-goal checklist, then today's workout plan.
- Kept snacks separate from the breakfast/lunch/dinner ring and preserved the existing meal
  sheet for logging and editing.
- Made workout completion automatic from prescribed set logs and added a direct Home action
  that resets the workout view to the current week/day before opening it.
- Added responsive, Duolingo-inspired cards, progress treatments, and compact phone layouts.
  Bumped the PWA shell cache to `v5` so installed clients receive the redesign.

### 2026-08-04 — Production magic-link redirect hardening
- Changed magic-link callbacks to use the clean current origin + pathname instead of the
  full browser URL, preventing stale query strings or auth fragments from being copied into
  new login links.
- Documented the required Supabase Site URL/Redirect URLs and Vercel Deployment Protection
  settings. Bumped the PWA shell cache to `v4` so deployed clients receive the auth change.

### 2026-07-15 — V1 implementation
- Built the full stack described in this doc: `supabase/schema.sql` (8 tables + RLS +
  private `meal-photos` bucket), `js/config.js`, `js/supabase.js` (data-access layer),
  `js/auth.js` (magic-link + onboarding), `js/data.js` reworked into the exercise library +
  `WORKOUT_WEEK`/`PEAK_WORKOUT_WEEK`/diet templates, `js/plan.js` (plan generator +
  override merging), and a rewritten `js/app.js` covering Home (food journal + today
  glance), Workout (set logging, swap, adjust), Eat (suggested plan, read-only), Habits,
  Guide, and a new Profile tab (account, goal editor, weight + strength charts, legacy
  import).
- Added `week_notes` table (not in the original plan doc) to keep the weekly check-in note
  cloud-synced instead of falling back to localStorage.
- Added push notification plumbing: `sw.js` `push`/`notificationclick` handlers, a Profile
  toggle using the Web Push API, and `supabase/functions/send-meal-reminders` (Deno Edge
  Function using `web-push`, invoked by Cron with `{"mealType": "..."}` per schedule).
- Updated `index.html` load order, `sw.js` cache list (bumped to `v3`), `manifest.json`
  description, and `README.md` to describe the new architecture and setup flow.
- **Update, same day**: Supabase project `fitness-tracker-app` created (region
  ap-southeast-1), `supabase/schema.sql` run successfully (all 9 tables + `meal-photos`
  bucket confirmed present), email magic-link auth enabled, and `js/config.js` filled in
  with the real project URL + publishable key. Verified end-to-end with an automated
  headless-browser check against the live project: the app loads with zero console errors
  and a real magic-link email was successfully triggered via `signInWithOtp` (confirmed by
  a 429 rate-limit response on a second attempt). Committed and pushed to `main`
  (`0c73bd7`) — not yet manually walked through onboarding/sign-in as a human, and push
  notifications (VAPID keys + Edge Function deploy) are still not set up.

### 2026-07-15 — Product direction set
- Ran a full interview (3 rounds, 12 questions) to define the V1 scope for turning the
  single-user localStorage PWA into a multi-user, Supabase-backed app.
- Decided: Supabase backend, multi-user from day one, photo+details meal journal on Home,
  goal-based plan generation replacing the hardcoded 5-week plan, workout swap/adjust +
  per-set weight×reps logging, push notifications at meal windows.
- Decided to move protein streak / "Track What You Control" / weight trend / weekly check-in
  off Home and into a new Profile tab.
- Created this doc and [PRD.md](PRD.md). Implementation starting next.
