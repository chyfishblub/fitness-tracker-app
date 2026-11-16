# Technical Reference — Fitness Tracker

Living document. Update the **Changelog** at the bottom every time you make a real change —
that's the whole point of this file existing.

See [PRD.md](PRD.md) for *why* things work this way. This doc is *how*.

---

## 0. Resume here — current build handoff (2026-08-05)

This section is the authoritative restart point for the current build. The repository does
not contain an FB `PROJECT_BOARD.md`, so resume from this section, then use the changelog and
Git history for older detail.

### Production snapshot

- **Live app:** <https://hera-ashen-five.vercel.app/>
- **Branch/deployment source:** GitHub `main`, automatically deployed by Vercel.
- **Latest deployed commit:** `77caf92` (`Harden meal saves and app updates`).
- **Previous feature commit:** `70b1b3c` (`Add meal history and fix meal logging`).
- **PWA shell version:** `fitness-tracker-v9`.
- The deployed `index.html`, `js/app.js`, `js/supabase.js`, and `sw.js` checksums matched the
  local files after `77caf92` was deployed.

### Confirmed shipped behavior

- Duolingo-inspired five-tab app shell: Today, Train, Plan, Progress, and Me.
- One-tap Supabase anonymous guest sign-in plus email magic-link sign-in.
- Three-step onboarding that creates a profile, goal, initial weight entry, and generated
  workout plan.
- Today flow: meal logger → daily goals → direct entry into today's workout/set logging.
- Meal History from the Today meal card: monthly calendar, photo/count markers, month
  navigation, and selected-day meal details.
- Meal photos stored privately in Supabase Storage and displayed through signed URLs.
- Breakfast/lunch/dinner persistence uses insert or update-by-ID instead of the invalid
  PostgREST partial-index upsert. Snacks remain unlimited inserts.
- Duplicate named-meal recovery: if a stale screen misses an existing meal and insert returns
  `23505`, the app finds that row and updates it.
- The service worker is network-first for same-origin app files, uses
  `updateViaCache: "none"`, and reloads once when a new worker takes control. The cache is
  now an offline fallback rather than the first source for deployed JavaScript.

### Verification already completed

- `node --check` passed for `js/app.js`, `js/supabase.js`, and `sw.js`.
- `node tests/ui-render.test.cjs` passed after the `v9` hardening.
- A live production-equivalent test using the official Supabase JavaScript client succeeded
  with anonymous auth, a 700 KB photo blob, note `Nasi Lemak`, light portion, feeling,
  database insert, readback, and cleanup.
- A separate live duplicate test produced the expected `23505`, looked up the existing
  breakfast, updated it successfully (`204`), verified the replacement note, and cleaned up.
- Temporary database rows and Storage objects created by these checks were deleted.

### Active verification gate — do this first

The original iPhone guest session showed the old generic meal-save error after the first
repair. That report occurred before `v9` added duplicate recovery and forced fresh app
assets. The server-side and clean-client paths now pass, but the same physical guest session
has **not yet confirmed the `v9` fix**.

1. Fully close and reopen the installed app once. The new service worker should refresh it
   automatically.
2. Save a breakfast with a photo, note, portion, and feeling.
3. Confirm it appears on Today and under **History** for the selected date.
4. If it fails, capture the complete new toast. It now distinguishes **photo upload**,
   **entry save**, and **meal refresh**, and includes an available Supabase error code.

**Do not clear Safari/site data, remove the installed app, or sign out while diagnosing.**
This is an anonymous guest account; clearing its browser session can make its existing data
unrecoverable even though the rows remain in Supabase.

### Remaining work and known limits

1. **Meal-save physical-device gate:** waiting for the original iPhone guest-session retest
   described above. This is the only unresolved defect in the current release.
2. **Durable accounts:** guest data is browser-bound. Google sign-in, guest-to-Google account
   linking, and data migration between a guest and an existing account are not implemented.
3. **Email reliability:** Supabase's built-in email quota can still return `email rate limit
   exceeded`. Guest sign-in bypasses email; custom SMTP has not been configured.
4. **Push notifications:** client/schema/Edge Function plumbing exists, but VAPID keys,
   deployed function secrets, the live Edge Function, and Cron schedules still require
   setup and end-to-end verification.
5. **Meal intelligence:** calorie/macro calculation is intentionally not part of logged meals
   yet. The current history preserves photos and notes as the input for that future work.
6. **History follow-up:** a photo-grid gallery toggle is still backlog; the calendar/day
   detail view is shipped.
7. **Other backlog:** exercise clips, weekly physique photos, per-user timezone scheduling,
   workout reminder notifications, and a full custom workout builder remain deferred.

### Resume decision rule

- If the iPhone meal save passes: close the current defect and choose the next product slice
  from durable accounts, push-notification setup, or calorie estimation.
- If it fails during **photo upload**: inspect Storage error/status, blob size/type, session,
  and `meal-photos` policy before changing meal-table logic.
- If it fails during **entry save**: use the displayed Postgres code and verify whether a row
  for the same user/date/type already exists; duplicate recovery should handle `23505`.
- If it fails during **meal refresh**: inspect session refresh and the `meal_logs_select_own`
  policy/read query. Do not change the schema without first capturing the new error code.

### Primary files for the next session

- `js/app.js` — meal sheet, Meal History, UI state, rendering, and event handling.
- `js/supabase.js` — auth, meal persistence/recovery, range queries, and Storage calls.
- `sw.js` and `index.html` — update delivery and automatic service-worker refresh.
- `tests/ui-render.test.cjs` — UI, persistence, duplicate recovery, and cache-strategy checks.
- `supabase/schema.sql` — RLS, partial meal uniqueness, and private photo policies.

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

### 2026-11-16 — Empty reps box logs the planned reps (live)
- Live check as a guest on hera-ashen-five.vercel.app: sign-in, onboarding, habit, meal, set
  and every tab worked and survived a reload. One problem: the reps box shows the plan's reps
  as a grey hint, people read it as filled in, and ✓ answered "Add your reps first."
- `logSetFor` now falls back to the hint's number when the reps box is empty; typed reps still
  win. Test added in `tests/ui-render.test.cjs`. Cache bumped to `fitness-tracker-v14`.
- The live check left a guest test player "Tester" (quest "Live check") in Supabase Auth.

### 2026-11-16 — Pixel is the only look (branch `pixel-theme`)
- Fish decided the pixel game look is Juno's design, with no fallback to the old flat
  green design.
- `index.html` sets `<html class="pixel">` in the markup (the localStorage switch script is
  gone). Theme colour is ink `#2A1F3D` with a black iOS status bar; `manifest.json` uses ink and
  cream `#FFF6E0`.
- `pixel.js`: the Pixel mode setting is removed. Old saves with `on:false` are ignored; the only
  setting left is Game sounds. Celebrations always use the pixel banner.
- New app icons (`icons/icon-192.png`, `icon-512.png`): a gold pixel "J" tile on ink, replacing
  the green "F".
- Removed the old design's unused Habits screen (`habitsTab`) and its helpers (`check`,
  `sectionTitle`) from `app.js`.
- `styles.css` stays as the layout base and `pixel.css` as the skin on top; both always apply.
- Service worker cache `fitness-tracker-v13`. Tests check the class is fixed in the markup and
  the switch is gone.

### 2026-11-16 — The buddy is a Spotter you name (branch `pixel-theme`)
- Fish decided: **Juno is the app; the buddy is a separate Spotter each person names**
  (the step 2 recommendation in `docs/redesign/02-brand.md`).
- The name is saved in the Supabase auth user's metadata (`user_metadata.spotter_name`) via new
  `saveSpotterName()` in `supabase.js`. It follows the account across devices and needs no
  schema change. `spotterName()` in `app.js` reads it.
- Onboarding step 1 asks for your name and "Name your Spotter" (blank field, starter names
  Mo, Bean, Captain, Pip, Sunny). Leaving it blank never blocks starting.
- Me → App settings has a "Your Spotter" row to name or rename them.
- Pixel scene: the speech bubble carries the Spotter's name, the first tip says hi by name, and
  sign-in copy says "your Spotter" instead of "Juno". "Juno" now only ever means the app.

### 2026-11-16 — UI review fixes and the game layer (branch `pixel-theme`)
- Fish asked to "fix all" 15 findings from the UI review that followed the copy rewrite.
- **New `js/game.js`** (loads after `plan.js`, before `app.js`; cached by the service worker,
  `CACHE_NAME` now `fitness-tracker-v12`). It holds the game rules. Nothing new is stored: every
  number is worked out again from the logs, so `supabase/schema.sql` is unchanged.
  - XP: meal 20, habit 10, set 5, cleared workout 30 (shared with `pixel.js`).
  - Levels from lifetime XP: level 2 at 100, then each level costs 50 more (`levelFor`).
  - Weekly stars, not streaks: a good day is any day you start two of the three quests;
    3 good days in a plan week earns that week's star. Quiet days never take anything away.
  - Weekly boss: clear 3 training workouts in a plan week (fewer if the week has fewer).
  - 10 badges for firsts (first meal, full plate, 10 photos, first workout, rest day, all
    habits, high score, star week, boss, level 5). Shown on Me, greyed until earned.
  - Personal bests: logging a set heavier than any earlier one shows "New high score!".
- `supabase.js`: new `getActivityHistory()` (light columns of meal, habit and set logs, paged
  past the 1,000-row limit). Loaded once in `loadAll()`; if it fails the app still works.
- Celebrations: `celebrate()` in `app.js` shows a pixel banner (queued, so a level-up and a badge
  each get a turn) or a toast with Pixel mode off. What has been celebrated is kept per user in
  `localStorage` (`juno_seen_v1_<user id>`), only ever added to, so un-ticking a habit never
  replays a banner. The first load after this change records what's already earned silently.
  Juno now reacts in the city scene's speech bubble when you earn XP.
- Today: one **Up next** card at the top (current meal, then workout, then the next habit);
  the goal strip became a line under the greeting; the city scene sits under Up next; the
  workout is no longer repeated as a habit tile (Quest 2 is habits only, as a one-column list
  with +10 hints); the meal ring no longer repeats the count; a Weekly boss card closes the page.
- Train: walks, stretches, holds and circuits (`isTimedMove`) are ticked off with no weight or
  reps. Bodyweight moves no longer need a weight (only reps). Before this, rest-day and
  bodyweight moves couldn't be logged at all.
- Plan and Progress pickers: weeks read "Wk 1… Peak" and fill the row (scroll with a fade past
  5 weeks); days show the real weekday and date in a 7-column grid, so Day 7 no longer clips.
  Progress day buttons now show the real weekday (they assumed weeks start on Monday).
- Onboarding: step 1 asks only for a name. Weight now and goal weight moved into an optional
  "Add a weight goal" section on step 3; the new-quest form on Me makes them optional too.
  Every screen handles a quest with no weights. Onboarding's start date is now local, not UTC.
- Top bar: the avatar (a second Me button) became a level chip.
- Pixel skin (`pixel.css`): body text, numbers, buttons and inputs use Nunito, because
  Pixelify's 5 reads as an S; Pixelify stays on headings, nav and tabs (not user-typed titles).
  Info cards are flat with a thin frame; the hard ledge is kept for things you can tap. The
  coloured hero panels became cream with a colour band, leaving green as the one "do this now"
  colour. Darker `--gold-d` and `--blue-d` so small text on yellow and sky passes 4.5:1.
- Tests: `tests/ui-render.test.cjs` loads `game.js`, and new checks cover levels, timed moves,
  lifetime XP from history, badges, personal bests, the new Today layout, Me, a quest with no
  weights, and onboarding not asking for weight first.
- Not done: the Juno vs Spotter naming call is still open, and nothing was tried on a real phone
  or with live Supabase data. Known content mismatch: training-day meal ideas are labelled
  "~1800 kcal" but the listed meals add up to about 1,500.

### 2026-11-16 — Copy rewrite: "your fitness buddy, in your pocket" (branch `pixel-theme`)
- Fish asked for all app copy to move to a "fitness buddy in your pocket" voice aimed more at
  women, with the whole experience framed as a game. The step 2 voice rules still apply: no
  streak, missed, behind or guilty words, and no food morality.
- The app is called **Juno** everywhere: page title, meta description, manifest
  (`Juno` / "Juno: your pocket fitness buddy"), wordmark `J`, and the medical note.
- Game framing: sign-in is "Start your first quest" / **Play as guest**; onboarding steps are
  Level 1 Your player, Level 2 Your quest, Level 3 Your pace, with "Just starting" and
  "Already lifting" in place of Beginner and Intermediate. Today shows **Quest 1 Meals,
  Quest 2 Daily habits, Quest 3 Today's workout**, with a time-of-day greeting and XP hints
  that match the existing score (meal +20, set +5). Goals are now quests, the guide is
  **Power-ups**, Me is **Your player card**, and Progress is "Your wins add up".
- Meal sheet: portions read Small, Regular, Big (stored values unchanged). Feelings are now
  Satisfied, Energized, Still hungry, Heavy (`satisfied|energized|hungry|heavy`). Older
  `good|sluggish|guilty` entries show as Energized or Heavy. The save button reads
  "Save meal · +20 XP" on a new main meal.
- Habit labels became actions ("Hit 120g protein", "Walk 8,000 steps"). "No unplanned
  snacking" became "Snacks I planned" with an apple icon. Habit ids are unchanged.
- Progress no longer leads with a weekly percentage that reads as failure early in the week:
  the summary tile shows ticks this week. Week notes prompt for energy, sleep, cycle and mood.
- Guide rewritten without "avoid", "look tightest" or "don't fear the scale" framing.
  The pixel buddy's tips now say "Lunch time! Snap it for +20 XP".
- Fixed: the sign-in benefit checkmarks were invisible because the chip style also matched the
  icon span (now `.auth-benefits > span` in both stylesheets).
- Service worker cache bumped to `fitness-tracker-v11`. The render test checks the new copy
  and fails if any main screen says streak, guilty, cheat, behind or failed.

### 2026-11-15 — Pixel mode: bright 8-bit game skin (branch `pixel-theme`)
- Fish asked to try a pixel-art game look on the whole app (bright and cheerful, inspired by a
  pixel city street scene) before locking the Juno design direction. Built as a layer on top of
  the existing app so it can be compared side by side and switched off.
- New `pixel.css`: every rule is scoped to `html.pixel`. Notched pixel frames (four hard
  box-shadows), Pixelify Sans + Press Start 2P, a bright palette with ink text on colour, a
  dark HUD top bar, a hotbar bottom nav, segmented progress bars, RPG-style sheets and toasts.
- New `js/pixel.js`: a MutationObserver on `#app` decorates each render, so `app.js` and
  `auth.js` are unchanged. It swaps emoji for hand-drawn sprites (text grids with automatic
  outlines), replaces the meal ring with three pixel hearts, adds a "today's XP" bar
  (meals 20, habits 10, sets 5, workout 30), and shows an animated side-scrolling city on
  Today and sign-in. The city has a jogger whose speed follows today's XP, shops, palms,
  traffic, people, a time-of-day sky (morning, day, golden hour, night with neon), and a HUD.
  Tapping it makes the jogger jump and give a tip based on what's still left today.
- Feedback: particle bursts, "+XP" floats, 8-bit sounds (Web Audio, no files), and a
  "Meals clear!", "Goals clear!" or "Perfect day!" banner with confetti and fireworks.
  Charts get square points and pixel fonts. Animation pauses off-screen and respects reduced
  motion.
- Me → App settings gets **Pixel mode** (on by default; off restores the old look exactly) and
  **Game sounds** toggles, stored in `localStorage` key `fitnessTracker_pixel_v1`.
  `?pxTime=morning|day|golden|night` previews a sky.
- `index.html` loads the fonts, `pixel.css` and `js/pixel.js`, and sets the class before first
  paint. Service worker cache bumped to `fitness-tracker-v10` with the new files; the test
  now checks that.

### 2026-11-13 — Redesign step 2: brand narrative and visual directions
- Step 1 approved by Fish. Step 2 deliverable: `docs/redesign/02-brand.md`.
- Positioning: for people who keep losing the training habit a few weeks in, Juno is a
  training and food journal with a small companion that keeps you showing up. Core promise
  and recommended tagline: **Small days count.** Pillars: small days count, no debt, proof
  not pressure, your history is safe. Includes personality, voice rules, a use/avoid word
  list, and the three coach tones across five moments.
- Naming: Juno stays the working name. A quick search found several existing "Juno" health
  apps (including a habit and workout tracker from Juno Health) and unrelated JUNO trademarks,
  so store listings need a descriptor and a proper trademark search before launch.
  Recommendation: the coach becomes a **Spotter** that each person names (example: Mo).
- Visual directions on a new canvas, <https://claude.ai/artifact/7Pg7yBemCq1EpyBJcKjaso>
  (sources in `docs/mockups/juno-redesign/`): **A · Paper & Ink**, doodle-led, recommended;
  **B · Daylight**, Elemental-led. Both show the spotter, three poses, the same Today card,
  palette, type, icons and a sample message.
- Waiting on Fish to approve the positioning and pick a direction before step 3.

### 2026-11-13 — Redesign step 1: user problem · app renamed Juno
- Fish approved a from-scratch redesign in five gated steps: user problem, brand narrative,
  design system, core screens, use cases and edge cases. Design comes first; the Supabase
  backend stays, and the front-end rebuild is decided after the design is approved.
- The app's new name is **Juno** (previously "Fitness Tracker"). The coach's name is an open
  question for the brand step, since the Pocket Spotter mockups used Juno for the coach.
- Step 1 deliverable: `docs/redesign/01-user-problem.md`. It defines the audience as "people
  like Fish" with two proto-personas, summarizes cited research on app and gym drop-off,
  habit formation, tracker abandonment, the what-the-hell effect and food logging, and names
  three problems: logging cost before payoff, a slip becoming a stop, and invisible progress
  followed by the goal ending. Assumptions and cheap tests are listed.
- A fifth character reference (`05-doodle-raincoat-umbrella.jpg`) was saved; Fish prefers its
  hand-drawn style. The visual base is decided at the end of step 2.
- Waiting on Fish's review of step 1 before starting step 2.

### 2026-11-12 — Pocket Spotter typography
- Continued from the Today typography preview. All six phone mockups and both character
  boards now use DM Sans for body copy and Archivo for headings and controls.
- The updated review uses the Elemental Gradient layouts and the latest Bean & Sticks artwork.

### 2026-11-10 — Pocket Spotter style locked: Bean & Sticks in a training tank
- User decision: direction **D · Bean & Sticks**, wearing a simple one-piece training tank top.
- Character spec v2: bean body in one Elemental solid; thin Ink stick limbs with Cloud hands;
  a one-piece **Dusk** tank (scoop neck, two straps, hem follows the bean) that is always on and
  replaces the earlier shorts band. Features Ink, highlights Cloud. The tank keeps every body
  color legible on every gradient and gives the coach a constant "training" read.
- Builder parts are now Build (Tall / Round / Squat), Face (Dot / Arc / Visor) and Accessory
  (Headband / Cap / Wristbands), plus the six body colors and three tones. Default coach:
  Juno, Round, Dot, Headband, Seafoam, Steady.
- At 36 px (perch) and 48 px (cards) only the head and tank neckline show; limbs appear from
  the 92 px builder size up. The demo pose is a full stick-limb lat pulldown.
- All canvas boards redrawn: builder, Today, Train, demo, Progress, recovery, System (v2) and
  Styles (D marked chosen). Repo copies refreshed in `docs/mockups/pocket-spotter/`.
- Still mockup-only. Next gate: user approval of the six screens, then stage 2 (foundation).

### 2026-11-10 — Pocket Spotter Bean & Sticks redraw
- Fish selected Bean & Sticks with a simple one-piece training tank. The revised Juno wears
  a scoop-neck Dusk tank with two straps, has articulated Ink limbs, and uses Seafoam for the
  sample body. The builder offers Tall, Round, and Squat bean proportions.
- Updated the six phone mockups, the character system, and the selected direction on the
  exploration board in `docs/mockups/pocket-spotter/`. The lat pulldown is a static poster.
- The local board sources are the current revision. The published Claude canvas shows the
  earlier revision. The six screens are ready for visual review before app implementation.

### 2026-11-10 — Pocket Spotter visual prototype (stage 1 of the delivery plan)
- Published the character system and six 390×844 phone mockups for review:
  <https://claude.ai/artifact/XJVhHrwo1xNM91XRTffSrY> (private until shared). Board sources are
  kept in `docs/mockups/pocket-spotter/` (`*.dc.html` + `canvas.json`).
- Skin decision: mockups use the **Elemental Gradient** direction from the Figma file (dawn/day/
  dusk gradients, veil cards, Archivo + Source Serif 4, line icons), not the shipped green
  Duolingo-style skin. Approving these therefore also previews the Elemental migration.
- Character: modular SVG, 3 shapes (Bean/Block/Drop) × 3 faces (Dot/Arc/Visor) × 3 accessories
  (Headband/Cap/Wristbands) × the six Elemental solids × 3 tones. Shorts are always Dusk, features
  Ink, highlights Cloud. The coach always sits on a veil surface so every color reads on every
  gradient. Size ladder: 36 head in a 44 perch, 48 on cards, 92 in the builder, 150 in demos.
- Screens: coach builder (step 5 of 6), Today with one inline next-action card, active Train with
  the coach collapsed and a badge, exercise demo sheet with poster fallback and two cues,
  Progress weekly story (win / pattern / next step), and recovery after two quiet days.
- Assumptions to confirm: five-tab nav (the Figma file shows four), the perch replaces nothing in
  the app bar (date left, coach right), example coach "Juno" in Steady/Teal.
- Nothing applied to app code. The July Elemental mockup artifact no longer exists; Figma remains
  the canonical Elemental source.
- Later the same day: four character references saved to `docs/references/character-styles/`
  (grain blobs, Toru Fukuda object characters, shape characters with props, Dumb Ways to Die
  beans) with a README on what to take from each. Five style directions derived from them, all in
  the Elemental palette, added to the canvas as `Styles.dc.html`: A Grain Blob, B Gym Object,
  C Soft Geo Buddy, D Bean & Sticks, E Gradient Spirit. Recommendation recorded in chat: D as the
  body (articulated limbs make the 51 demo loops cheap) with A's grain at the base and C's props.

### 2026-11-10 — Restart check: Supabase project unreachable
- The live app at hera-ashen-five.vercel.app loads, but every Supabase call fails with the
  browser error `Failed to fetch`. DNS for `hjpbteaxuhawwhubaeli.supabase.co` returns
  NXDOMAIN from both Google and Cloudflare resolvers, so the project host no longer exists.
- Most likely cause: the free-tier project was paused after inactivity (last activity
  2026-08-05). Restore it from the Supabase dashboard, then retest guest sign-in and the
  iPhone meal-save gate above. If the dashboard shows the project as deleted, create a new
  project, run `supabase/schema.sql`, update `js/config.js`, and redo the Auth URL
  configuration; guest data from the old project would be lost in that case.
- Local code is healthy: `node --check` and `tests/ui-render.test.cjs` pass. No code changed.
- **Restored and retested the same day.** After the dashboard restore, services came back in
  sequence over about four minutes: DNS first, then Auth (Cloudflare 521 until then), then
  PostgREST (`PGRST205` schema-cache misses on every table) and Storage (500). Once all three
  answered, a fresh guest session on the live app completed onboarding, rendered Today with
  the generated plan, survived a reload, and saved a lunch entry (note, portion, feeling) that
  read back from `meal_logs`. Photo upload and the original iPhone guest session are still
  untested. Lesson: a free-tier project pauses after a week idle, so open the app or the
  dashboard at least weekly, or upgrade the project.

### 2026-08-29 — Pocket Spotter redesign research checkpoint
- Audited the complete product flow: guest/email login, three-step onboarding, Today meal and
  daily-goal flow, Meal History, Train and set logging, Plan, Progress, Me, new goals,
  reminders, and account settings.
- Chosen coach concept: **Pocket Spotter**, an original stylized mini trainer rather than an
  animal mascot, streak enforcer, generic chatbot, or direct Duolingo imitation.
- Locked v1 direction: smart scripted behavior, quiet presence across primary screens,
  motivation-first messaging, no voice, a sub-minute quick builder, animated coach exercise
  loops, multi-user-ready design, and staged delivery.
- Coach creation will cover a name, three visual parts, palette, and one of three coaching
  personalities. The coach should expand only for relevant prompts, reactions,
  demonstrations, recovery moments, or celebrations and remain dismissible and hideable.
- Initial screen direction: personalized coach-and-plan onboarding reveal; one recommended
  next action on Today; encouraging, shame-free meal and habit reactions; workout start/set/
  personal-best feedback plus on-demand demonstrations; restrained Plan explanations;
  consistency-focused weekly Progress stories; and coach customization, reduced-motion,
  and visibility controls in Me.
- Existing Mobbin evidence remains recorded in `docs/qa/APP-DESIGN-SYSTEM-002.md` for
  Centr/Ladder navigation, Hevy/Gymshark set logging, Cal AI/Google Fit progress, and
  Equinox+ personalization. The Mobbin MCP was reconnected after this checkpoint; the next
  research pass must validate persistent companion, avatar builder, exercise demo,
  missed-day recovery, celebration, and accessibility patterns before the redesign plan is
  finalized.
- Follow-up Mobbin MCP review completed. Tonal, Equinox+, pliability, and Centr reinforce
  one-question-per-screen onboarding, visible progress, a review step before commitment,
  and a concrete plan reveal rather than a generic success screen. References:
  [Tonal fitness profile](https://mobbin.com/flows/9f597ed6-aea4-4ec7-b573-48ea7484b164),
  [Equinox+ personalization](https://mobbin.com/flows/754cee5d-c1f4-44a7-9ae9-5e09474db3a3),
  and [Centr onboarding](https://mobbin.com/flows/848ee3f1-7bc7-403d-a2ff-f58b178fadfe).
- Character research shows that full-screen companions such as Tolan create personality but
  compete with daily actions; Any Distance places a smaller character beside the primary
  workout action more effectively. The Pocket Spotter should therefore use a compact home
  position and expand only for intentional moments. References:
  [Tolan companion](https://mobbin.com/screens/aa36dd2f-98c3-4a72-81ea-6c983e2bf6c4) and
  [Any Distance coach placement](https://mobbin.com/screens/11be9640-c3b5-40ee-a59c-6688a5ce1e7c).
- Avatar creators from Tolan and Duolingo validate a live preview above bounded category
  controls. The app should deliberately use fewer categories than either reference so the
  quick builder remains under one minute. References:
  [Tolan creator](https://mobbin.com/screens/8d620c4e-5887-4e39-bf7b-fc2fb683187f) and
  [Duolingo avatar creator](https://mobbin.com/screens/50ba3e32-7cca-4c97-b757-cccdec716e76).
- Workout research confirms that the active set, previous values, rest state, and next action
  must remain dominant while the coach stays outside the input grid. Demonstrations should
  open as a focused sheet with a loop, two cues, target muscles, and a return-to-workout
  action. References: [Hevy workout logging](https://mobbin.com/flows/7b6374ff-8ff6-4d7b-babe-077e72b6ee1f),
  [Runna exercise demo](https://mobbin.com/screens/dbd2f8a6-93e7-47fd-8e35-2a8bf62daf3b),
  and [Equinox+ completion](https://mobbin.com/flows/472bf5b7-3baa-4041-9b9d-b3b205a25b59).
- Recovery and recap research supports gentle re-entry and a single next action, but the app
  must reject paid streak repair, guilt, and exaggerated urgency. Use a coach-led weekly
  story combining one win, one pattern, and one next step. References:
  [Finch missed-day recovery](https://mobbin.com/screens/d6e7a7b1-4b61-40b1-8ff7-1c602badec85),
  [Runna return choices](https://mobbin.com/screens/0116015c-bb3b-46fd-a2f6-3194ad72193a),
  and [Runna weekly overview](https://mobbin.com/screens/48d9e879-8ad7-4c03-8483-8b064eb3a4f1).

### 2026-08-05 — Resume checkpoint
- Added a current production snapshot, completed verification evidence, the outstanding
  physical-iPhone meal-save gate, account/email/push limitations, remaining product work,
  and failure-specific restart instructions to the top of this reference.
- Recorded `77caf92` as the deployed source and `fitness-tracker-v9` as the active PWA cache.

### 2026-08-04 — Meal history and meal-save repair
- Added a Home → History entry point and a responsive monthly meal calendar with photo/count
  markers, previous/next month navigation, and selected-day journal details.
- Kept logged meals intentionally free of calorie estimates while preserving the existing
  photo, note, portion, feeling, and time metadata for later nutrition features.
- Fixed breakfast/lunch/dinner saves by replacing an invalid PostgREST upsert against the
  partial `meal_logs_one_per_day` index with explicit insert/update-by-id behavior. Live
  reproduction returned PostgreSQL `42P10`; the corrected create, update, range query, and
  cleanup sequence all passed against Supabase.
- Follow-up hardening recovers when a stale client misses an existing named meal, reports
  whether a failure occurred during photo upload, entry save, or refresh, and changes the
  service worker to network-first app assets with automatic controller refresh.
- Added render and persistence regression checks and bumped the installed-app cache to `v9`.

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
