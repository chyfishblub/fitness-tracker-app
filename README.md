# Fitness Tracker 🏋️

A personal 5-week fitness tracker, built as a Progressive Web App (PWA).
This README is your map: what each file does, how to run it, how to get it
onto your phone, and where to take it next.

---

## 📁 Project structure

```
Fitness-Tracker-App/
├── index.html        ← the shell. Loads everything, registers the service worker.
├── styles.css        ← all the visual styling (the "how it looks").
├── manifest.json     ← makes it installable on a phone home screen.
├── sw.js             ← service worker = offline support.
├── icons/
│   ├── icon-192.png  ← app icon (small)
│   └── icon-512.png  ← app icon (large)
└── js/
    ├── data.js       ← the PLAN: meals, workouts, habits, targets (the "what").
    └── app.js        ← the LOGIC: state, rendering, taps (the "how it works").
```

**The big idea:** one file per job. Want to change a meal? Edit `data.js`.
Change a color? `styles.css`. Change behavior? `app.js`. You never have to
dig through one giant file again.

---

## ▶️ Run it locally

Easiest: double-click `index.html` — it opens in your browser and works.

Note: the **offline/service-worker** part only activates when the app is
served over `http` (not a `file://` path). That's fine — it just means
offline mode kicks in once you host it (next step).

---

## 🌐 Put it online + on your phone (GitHub Pages, free)

This is the step that gets it on your iPhone.

1. Make a free account at **github.com**.
2. Create a new **public** repository, e.g. `fitness-tracker`.
3. Upload all these files (keep the folder structure — `js/` and `icons/`
   stay as folders). You can drag-and-drop them in the GitHub web uploader.
4. In the repo: **Settings → Pages → Source: "Deploy from a branch" →
   Branch: `main` / root → Save.**
5. Wait ~1 minute. GitHub gives you a URL like
   `https://yourname.github.io/fitness-tracker/`.
6. **On your iPhone:** open that URL in **Safari** → tap the **Share**
   button → **Add to Home Screen**. Now it's an app icon on your phone,
   opens full-screen, works offline. 🎉
   (On Android: Chrome will show an "Install app" prompt.)

---

## 💾 About your data (important)

Your progress is saved in each device's browser (`localStorage`). That means:

- Your **laptop** and **phone** each keep their **own** separate progress.
- They do **not** sync automatically.
- To move progress between them, use the **Export Backup / Import Backup**
  buttons at the bottom of the Home tab (export a `.json` on one device,
  import it on the other).

Real automatic sync needs a backend + login — that's Milestone 5 below,
and it's a real step up in complexity. For a 5-week personal tool, the
export/import button is usually enough.

---

## 🗺️ Learning roadmap — build it out, step by step

Each milestone is a self-contained lesson. Do them in order; don't skip to 5.

**Milestone 1 — Ship it (you're basically here).**
Get it hosted on GitHub Pages and installed on your phone. Learn: git,
repositories, deployment, PWA install. This alone is a huge win.

**Milestone 2 — Add a weigh-in chart.**
Show your weekly weights as a line graph on the Home tab. Learn: adding a
library (Chart.js via CDN), passing data into it, reading from `state`.

**Milestone 3 — Progress photos.**
Let yourself attach a weekly photo. Learn: file inputs, converting images
to base64, storage limits (this is where localStorage starts to feel small
— a good, motivating reason to learn `IndexedDB`).

**Milestone 4 — Notifications / reminders.**
A daily "log your protein" nudge. Learn: the Notifications API and how
mobile browsers limit it (spoiler: iOS is strict — a real-world constraint
worth understanding).

**Milestone 5 — Real accounts + cloud sync.**
Move data off the device into a database so laptop and phone share it.
Learn: a backend-as-a-service like **Supabase** or **Firebase** (auth +
database with far less setup than rolling your own). This is the jump from
"web page" to "app." Expect it to take real time.

**Milestone 6 — Make it reusable for anyone.**
Right now the plan is hardcoded for you. Turn `data.js` into something a
user can edit in-app, so someone else could set their own goal/date/meals.
Learn: forms, editable state, data validation.

---

## 🛠️ Tips as you build

- Change `sw.js`'s `CACHE_NAME` version (e.g. `v1` → `v2`) whenever you edit
  files, or your browser may keep serving old cached copies.
- Use your browser's **DevTools → Application tab** to inspect localStorage,
  the service worker, and the installed manifest. It's the single most
  useful window for PWA work.
- Keep commits small and frequent. "Added chart" is a better commit than
  "changed a bunch of stuff."

---

*Built as a personal project. Not medical or dietary advice — validate the
plan itself with a qualified trainer or dietitian.*
