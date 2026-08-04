# Product Requirements Document — Fitness Tracker

**Status:** V1 in development
**Owner:** Fish (tanchyi90@gmail.com)
**Last updated:** 2026-07-15

---

## 1. Vision

A daily habit-and-strength engine, not a calorie calculator. The app's job is to keep two
things alive over time:

1. **The habit** — showing up to log meals and workouts every single day, even on boring days.
2. **The number going up** — visible proof you're getting stronger (weight lifted) and leaner
   (weigh-ins, photos) over weeks and months.

It is **evergreen**: it doesn't end when a trip ends. A trip or event (like the original
Phuket goal) is just one *goal* among many the app can be pointed at over time.

## 2. Origin story / persona

**Fish** — the first and, for now, only user. Training at the gym, in a calorie deficit,
prepping to look lean for a Phuket trip (originally Aug 6). Was using a hardcoded personal
PWA with no login and no cloud sync — progress lived in one browser's `localStorage` and had
to be manually exported/imported between laptop and phone.

Fish wants:
- A real account so data isn't stuck on one device.
- A dead-simple way to keep a food journal (photo-first, low friction) so eating patterns
  become visible over time — not to count calories, but to *see what you actually eat*.
- To keep training progress honest: log actual weight × reps per set, not just a checkbox.
- Freedom to swap exercises and adjust sets/reps as he moves from beginner to intermediate,
  without losing the guardrails of a structured plan.
- A Home screen that isn't cluttered with things he doesn't check daily — those move to a
  Profile/history space instead.

## 3. Design principles

- **Today = today.** Everything on Today should answer "what do I need to do right now?" Not
  "here's your whole program" — that belongs in Train, Plan, Progress, and Me.
- **Journaling over judging.** Meal logging never blocks, scores, or shames — no forced
  calorie entry. A photo and a note is a complete log.
- **Time-aware, not time-locked.** Meal windows guide *what's highlighted*, never what's
  *allowed*. You can always log or backfill.
- **Plans are a starting point, not a cage.** Every generated workout can be swapped or
  adjusted per exercise without abandoning the overall structure.
- **No build step.** Stays plain HTML/CSS/JS + Supabase CDN client — anyone (including Fish,
  a learner) can open any file and understand the whole app.

## 4. User journey (the interviewed story)

1. **Discover / open the app.** PWA installed on phone home screen (or opened in browser).
2. **Sign in.** Email magic link — no password to remember. First time, an email arrives,
   tap the link, session starts.
3. **Onboarding (~60 seconds).** Name, current weight, goal weight, goal title + target date
   (e.g. "Phuket trip" / Aug 6, or "just get stronger" with no date), training level
   (beginner/intermediate). This creates a `profile` and the first `goal`, and a plan is
   generated immediately from a template matched to the goal.
4. **Land on Home.** Sees:
   - Countdown to the goal date (or a "no deadline, just consistency" framing if none set).
   - Today's meal journal card, with the *current* meal window pre-opened.
   - A compact "today at a glance" strip: today's workout completion + habit ticks.
5. **Throughout the day**, push notifications nudge at meal windows (~8am / ~12:30pm / ~7pm)
   if that meal hasn't been logged yet: *"Log your breakfast 📸"*. Tapping opens the log
   sheet directly.
6. **Logging a meal.** Tap the highlighted meal → bottom sheet → snap or upload a photo
   (optional), jot a quick note, pick a portion size and how it felt (optional) → save.
   Snacks/drinks any time via "＋ Add snack," unlimited per day.
7. **Training day.** Open Train → today's exercises (from the generated plan, minus
   any personal swaps/adjustments) → tap an exercise → log each set's weight × reps, seeing
   last session's numbers as a reference ("last time: 40kg × 10") → exercise auto-checks off
   once all sets are logged.
8. **Getting stronger / bored of an exercise.** Tap "swap" on any exercise → pick an
   alternative that targets the same muscle group from the built-in library → the plan
   updates going forward. Tap "adjust" to change sets/reps/rest directly.
9. **Weekly.** Logs a weigh-in (Profile). Reviews the weight trend chart and, later,
   strength progress per lift.
10. **New goal.** Once a goal's date passes (or Fish decides to pivot), starts a new goal —
    new title/date/weight targets — and the app regenerates a fresh plan from templates.
11. **Review progress.** Progress combines weekly habits, weigh-ins, and strength trends.
12. **Manage the account.** Me contains the active goal, reminders, account controls, and
    legacy import; settings no longer compete with progress charts on one long screen.

## 5. Features — V1 (this build)

### 5.1 Accounts & data
- Supabase email magic-link auth. Multi-user: every table scoped by `user_id` with row-level
  security so users only ever see their own data.
- Onboarding captures the minimum needed to generate a first plan.
- Cloud-synced — no more manual export/import between devices.

### 5.2 Food journal (Home centerpiece)
- Three named windows: **Breakfast 07:00–09:00**, **Lunch 12:00–15:00**, **Dinner
  18:00–20:00**. Outside a window, the nearest *upcoming* or *most recent unlogged* meal is
  highlighted — logging is never blocked by time.
- Each log: optional photo (camera or upload), optional note, optional portion
  (light/normal/heavy), optional feeling. A photo is *not* required — the point is a
  low-friction journal, not a chore.
- Re-logging the same meal on the same day edits the existing entry (breakfast/lunch/dinner
  are one-per-day). Snacks are unlimited and freeform ("＋ Add snack").
- History opens from the Home meal card into a month calendar. Logged days show a photo or
  count marker; selecting a day reveals its meal notes, portions, feelings, and timestamps.
- Photos stored in Supabase Storage, private per user, served via signed URLs.

### 5.3 Simplified Home
Home shows, top to bottom: a compact active-goal/countdown line → a three-segment meal
progress ring for breakfast/lunch/dinner (plus a separate snack action) → six daily goals
(the five habits plus workout completion derived from logged sets) → a prominent card that
opens today's workout directly, ready for set logging.

**Removed from Home** (moved to Profile, see 5.5): daily protein streak, "Track What You
Control," weight trend chart, weekly check-in, "Real Talk" callout, backup/import panel
(superseded by cloud sync).

### 5.4 Goal-based plan generation
- A goal = title + (optional) target date + start/goal weight + training level.
- Creating a goal auto-generates a workout + diet plan from a template (the existing 5-week
  training week + optional "peak week" logic becomes a reusable template, plus a plain
  ongoing "consistency" template for goals with no fixed end date).
- The plan is *derived*, not hand-stored — regenerated deterministically from the goal's
  parameters plus the user's personal swaps/adjustments layered on top.

### 5.5 Workout tracking
- Exercises come from the generated plan.
- **Swap**: replace any exercise with an alternative targeting the same muscle group, chosen
  from a built-in exercise library. Persists as a personal override.
- **Adjust**: edit sets/reps/rest per exercise. Also a personal override.
- **Set logging**: log actual weight × reps per set (not just a checkbox). The app recalls
  your last session for that exercise ("last time: 40kg × 10") so you know what to beat.
  Exercise auto-marks done once all its sets are logged.

### 5.6 Navigation, Progress, and Me
The signed-in app uses five persistent bottom destinations: Today, Train, Plan, Progress,
and Me. Plan combines suggested meals and the Guide. Progress combines weekly habits,
weight trend + weigh-in entry, strength progress, and weekly notes. Me contains email/sign
out, notification settings, current/new goal controls, and legacy import.

### 5.7 Push notifications
Web Push at the three meal windows, skipped for any meal already logged that day. Requires
the PWA installed to the home screen on iOS (16.4+) to receive pushes; works directly in
Chrome/Android.

## 6. Non-goals for V1 (explicitly out of scope)

- **Calorie/macro counting or targets on logged meals.** This is a journal, not a food
  database. (AI-estimated macros is a considered *premium* feature later, see §8.)
- **Offline-first / full offline editing.** Online-first with Supabase; PWA install is for
  home-screen convenience and push notifications, not offline data entry.
- **Exercise demo videos/GIFs.** Deferred to V2 — see backlog.
- **Weekly progress (physique) photos.** Deferred to V2.
- **Social features** (sharing, following, leaderboards) — not requested, not planned.
- **Full custom workout builder** (reordering weeks, building days from scratch) — V1 only
  supports swap/adjust within a generated plan, not building from a blank slate.

## 7. V2+ backlog

Roughly in the order Fish is likely to want them next:

1. **Exercise demo clips** — short looping GIF/video per exercise so form can be checked
   in-app instead of searching YouTube. Library keyed by the same `exercise_id` used for
   swaps, so this slots in without a data model change.
2. **Journal gallery** — add a photo-grid toggle to the shipped calendar/day-detail history.
3. **Weekly progress photos** — a prompted physique check-in (e.g. every Sunday), building a
   side-by-side timeline over months.
4. **Workout-day push reminders** and a **weekly weigh-in nudge**, layered onto the existing
   meal-window push infrastructure.
5. **Per-user timezone** for push scheduling (V1 ships with a single fixed timezone).
6. **Full workout builder** — build custom days/weeks from scratch, not just swap/adjust.

## 8. Monetization hypothesis (not built yet)

Asked directly what Fish would pay for; two things stood out clearly above the rest:

- **AI meal-photo analysis** — snap a meal, get an automatic calorie/macro estimate logged
  alongside the photo. Turns the journal into effortless nutrition tracking without manual
  entry. This is the natural bridge from "journal" to "tracker" for anyone who does want the
  numbers.
- **Coach / accountability** — a human or AI coach reviews the week's food journal and
  workout logs, leaves comments, keeps the user honest. Aligns directly with the "never lose
  the habit" core motivation.

Both require infrastructure V1 doesn't build (LLM vision calls, a review/comment data model)
and are deliberately deferred — but the schema (meal photos already stored, structured set
logs already captured) is designed not to block them later.

## 9. Open questions

- Exact wording/tone for push copy and empty states — decide during build, not blocking.
- Whether training level (beginner/intermediate) should ever expand to "advanced" — no
  present need, revisit if Fish's programming outgrows intermediate templates.
- Whether goals can run concurrently (e.g. a strength goal and a trip goal at once) — V1
  assumes one active goal at a time; revisit if that becomes limiting.
