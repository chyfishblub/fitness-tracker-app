# Fitness Tracker 🏋️

A multi-user Progressive Web App: a daily photo food journal + goal-based strength tracker,
backed by Supabase. Start here, then read [docs/PRD.md](docs/PRD.md) for *why* it works this
way and [docs/REFERENCE.md](docs/REFERENCE.md) for *how* — including the setup runbook and a
running changelog.

---

## 📁 Project structure

```
Fitness-Tracker-App/
├── index.html          ← the shell. Loads everything in dependency order.
├── styles.css           ← all visual styling.
├── manifest.json        ← installable-on-phone config.
├── sw.js                 ← service worker: offline shell + push notifications.
├── icons/                ← app icons.
├── docs/
│   ├── PRD.md             ← product vision, user journey, V1 scope, backlog.
│   └── REFERENCE.md       ← technical reference + setup runbook + changelog.
├── supabase/
│   ├── schema.sql          ← full database schema (tables, RLS, storage bucket).
│   └── functions/
│       └── send-meal-reminders/  ← Edge Function that sends meal-window push nudges.
└── js/
    ├── config.js       ← your Supabase project URL/keys (fill in — see setup below).
    ├── supabase.js      ← the only file that talks to Supabase directly.
    ├── data.js           ← exercise library + workout/diet templates (the "what").
    ├── plan.js            ← turns a goal into a concrete weekly plan (the "generator").
    ├── app.js              ← render/state/events for the signed-in app (the "how it works").
    └── auth.js              ← session gate, magic-link screen, onboarding.
```

---

## ▶️ Run it locally

1. **Set up Supabase** — follow [docs/REFERENCE.md §6](docs/REFERENCE.md#6-setup-runbook):
   create a free project, run `supabase/schema.sql`, enable magic-link email auth, and paste
   your project URL + anon key into `js/config.js`.
2. Serve the folder over `http(s)` (not `file://` — Supabase auth redirects and the service
   worker both need a real origin). Easiest options: the VS Code "Live Server" extension, or
   `npx serve .`.
3. Open it, sign in with your email, and complete the ~60-second onboarding.

Push notifications are optional and need one extra step (VAPID keys + deploying the Edge
Function) — see the runbook. Everything else works without it.

---

## 🌐 Put it online + on your phone (GitHub Pages, free)

1. Push this repo to a **public** GitHub repository.
2. **Settings → Pages → Source: "Deploy from a branch" → Branch: `main` / root → Save.**
3. Add the resulting `https://yourname.github.io/...` URL to your Supabase project's
   **Auth → URL Configuration → Redirect URLs**, or magic links won't complete.
4. **On your iPhone:** open that URL in **Safari** → **Share** → **Add to Home Screen**.
   This is required for push notifications to work on iOS (16.4+).

---

## 💾 About your data

Everything lives in your Supabase project's Postgres database, protected by row-level
security so only you can ever see your own rows (see `supabase/schema.sql`). Meal photos are
stored privately in Supabase Storage. Sign in from any device and your data is just there —
no manual export/import needed.

If you have old data from the pre-Supabase, localStorage-only version of this app on a
device, Profile → **Import legacy backup** does a one-time best-effort import of your old
weigh-ins and habit history.

---

## 🗺️ What's next

The full V1 feature set, the reasoning behind every product decision, and the V2+ backlog
(exercise demo clips, journal calendar history, weekly progress photos, AI meal analysis,
coach/accountability) are documented in [docs/PRD.md](docs/PRD.md). Every real change to this
app should get a line in [docs/REFERENCE.md](docs/REFERENCE.md)'s Changelog — that's what
keeps these docs worth reading six months from now.

---

## 🛠️ Tips

- Bump `sw.js`'s `CACHE_NAME` (e.g. `v3` → `v4`) whenever you change any core file, so
  browsers don't keep serving stale cached copies.
- Use DevTools → **Application** tab to inspect the service worker, and → **Network** tab to
  debug Supabase calls.
- The anon key in `js/config.js` is meant to be public — real security is the RLS policies in
  `supabase/schema.sql`, not secrecy of that key.

---

*Built as a personal project. Not medical or dietary advice — validate the plan itself with a
qualified trainer or dietitian.*
