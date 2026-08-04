/* ============================================================
   app.js — the LOGIC for a signed-in session. auth.js calls
   initApp(user, profile) once a session + onboarded profile are
   confirmed. Everything here reads/writes Supabase (js/supabase.js)
   and renders into #app. UI-only state (which tab, which week/day
   you're browsing) is cached in localStorage for continuity.
   ============================================================ */

// ---------- in-memory app state ----------
const AUTH = { user: null, profile: null };
const DB = {
  goal: null, plan: null,
  overrides: [], mealLogs: [], setLogs: [], weightEntries: [],
  weekNotes: {}, habitLogs: {}, habitWeeksLoaded: new Set(),
  photoUrls: {}, pendingPhotoFetches: new Set(),
  lastSetCache: {}, pendingLastSetFetches: new Set(),
  todayWeekIndex: 0, todayDayIndex: 0,
};

const UI_KEY = "fitnessTracker_ui_v2";
function loadUi() {
  try { const raw = localStorage.getItem(UI_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
  return { activeTab: "dashboard", selectedWeek: 0, selectedDay: 0, expandedSlot: null, mealSheet: null, adjustSlot: null, swapPicker: null, planSection: "meals", progressDay: null, workoutBrowse: false, exerciseMenu: null };
}
const ui = loadUi();
const LEGACY_TAB_MAP = { meals: "plan", guide: "plan", habits: "progress" };
if (LEGACY_TAB_MAP[ui.activeTab]) ui.activeTab = LEGACY_TAB_MAP[ui.activeTab];
if (!ui.planSection) ui.planSection = "meals";
if (ui.workoutBrowse == null) ui.workoutBrowse = false;
function saveUi() {
  try { localStorage.setItem(UI_KEY, JSON.stringify({ activeTab: ui.activeTab, selectedWeek: ui.selectedWeek, selectedDay: ui.selectedDay, planSection: ui.planSection })); } catch (e) {}
}

// ---------- date helpers ----------
function todayStr(d) {
  d = d || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dateForWeekDay(goal, weekIndex, dayIndex) {
  const d = new Date(goal.start_date + "T00:00:00");
  d.setDate(d.getDate() + weekIndex * 7 + dayIndex);
  return todayStr(d);
}
function weekDates(goal, weekIndex) {
  return DAYS.map((_, di) => dateForWeekDay(goal, weekIndex, di));
}

// ---------- boot ----------
async function initApp(user, profile) {
  AUTH.user = user; AUTH.profile = profile;
  document.getElementById("app").innerHTML = appLoadingState();
  await loadAll();
  render();
}

async function loadAll() {
  DB.goal = await getActiveGoal(AUTH.user.id);
  if (!DB.goal) { renderNoGoal(); return; }

  const generated = generatePlan(DB.goal);
  DB.overrides = await getOverrides(AUTH.user.id, DB.goal.id);
  DB.plan = { template: generated.template, weeks: applyOverrides(generated.weeks, DB.overrides) };

  const today = todayStr();
  const pos = getWeekDayForDate(DB.goal, DB.plan, today);
  DB.todayWeekIndex = pos.weekIndex; DB.todayDayIndex = pos.dayIndex;
  if (ui.selectedWeek == null || ui.selectedWeek >= DB.plan.weeks.length) ui.selectedWeek = pos.weekIndex;
  if (ui.selectedDay == null) ui.selectedDay = pos.dayIndex;

  DB.mealLogs = await getMealLogsForDate(AUTH.user.id, today);
  DB.setLogs = await getSetLogsForDate(AUTH.user.id, today);
  DB.weightEntries = await getWeightEntries(AUTH.user.id);
  DB.weekNotes = await getWeekNotes(AUTH.user.id, DB.goal.id);
  mergeHabitLogs(await getHabitLogsForRange(AUTH.user.id, today, today));
}

function renderNoGoal() {
  document.getElementById("app").innerHTML = `<div style="padding:40px 20px;text-align:center">
    <div style="font-size:15px;font-weight:800;color:var(--ink)">No active goal found.</div>
    <div style="font-size:13px;color:var(--grey);margin-top:6px;font-weight:700">Try signing out and back in, or contact support.</div></div>`;
}

// ---------- habit cache ----------
function mergeHabitLogs(rows) {
  rows.forEach((r) => {
    const key = `${r.log_date}|${r.habit_id}`;
    if (r.done) DB.habitLogs[key] = true; else delete DB.habitLogs[key];
  });
}
function isHabitDone(date, habitId) { return !!DB.habitLogs[`${date}|${habitId}`]; }
async function ensureHabitWeek(weekIndex) {
  if (DB.habitWeeksLoaded.has(weekIndex)) return;
  const dates = weekDates(DB.goal, weekIndex);
  const rows = await getHabitLogsForRange(AUTH.user.id, dates[0], dates[6]);
  mergeHabitLogs(rows);
  DB.habitWeeksLoaded.add(weekIndex);
  render();
}

// ---------- photo url cache ----------
function photoUrlFor(path) {
  if (!path) return null;
  if (DB.photoUrls[path]) return DB.photoUrls[path];
  if (!DB.pendingPhotoFetches.has(path)) {
    DB.pendingPhotoFetches.add(path);
    getMealPhotoUrl(path).then((url) => { DB.photoUrls[path] = url; DB.pendingPhotoFetches.delete(path); render(); });
  }
  return null;
}

// ---------- last-session cache ----------
function lastSetsFor(exerciseId) {
  if (DB.lastSetCache[exerciseId]) return DB.lastSetCache[exerciseId];
  if (!DB.pendingLastSetFetches.has(exerciseId)) {
    DB.pendingLastSetFetches.add(exerciseId);
    getLastSetLogs(AUTH.user.id, exerciseId, todayStr()).then((rows) => {
      DB.lastSetCache[exerciseId] = rows; DB.pendingLastSetFetches.delete(exerciseId); render();
    });
  }
  return null;
}

// ---------- small render helpers ----------
function appLoadingState() {
  return `<div class="app-loading" role="status" aria-label="Loading your plan">
    <div class="app-loading-mark">FT</div><div class="loading-bar"><span></span></div><p>Loading your day…</p>
  </div>`;
}
function navIcon(name) {
  const paths = {
    dashboard: '<path d="M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-5v-6h-5v6h-5A1.5 1.5 0 0 1 3 19.5z"/>',
    workout: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
    plan: '<path d="M6 3.5h12a2 2 0 0 1 2 2v15H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Zm3 4h7M9 11h7M9 14.5h5"/>',
    progress: '<path d="M4 19.5V14h4v5.5M10 19.5V9h4v10.5M16 19.5V4h4v15.5M3 21h18"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  };
  return `<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}
function screenHeading(eyebrow, title, description) {
  return `<header class="screen-heading"><div class="screen-eyebrow">${eyebrow}</div><h1>${title}</h1>${description ? `<p>${description}</p>` : ""}</header>`;
}
let toastTimer = null;
function showToast(message, type) {
  let toast = document.getElementById("appToast");
  if (!toast) { toast = document.createElement("div"); toast.id = "appToast"; toast.setAttribute("role", "status"); document.body.appendChild(toast); }
  toast.className = `app-toast ${type || ""}`; toast.textContent = message;
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2800);
}
function check(on, size) {
  size = size || 24;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" style="flex-shrink:0">
    <rect x="1.5" y="1.5" width="21" height="21" rx="7" stroke="${on ? "var(--green)" : "#E5E5E5"}" stroke-width="2.5" fill="${on ? "var(--green)" : "#fff"}"/>
    ${on ? '<path d="M7 12l3.2 3.2L17 8.5" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' : ""}
  </svg>`;
}
function sectionTitle(t) { return `<div style="font-size:13px;font-weight:900;color:var(--ink);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">${t}</div>`; }
function weekSelector() {
  let h = '<div class="row" style="gap:8px;overflow-x:auto;padding:2px 0 8px">';
  DB.plan.weeks.forEach((wk) => {
    const cur = ui.selectedWeek === wk.weekIndex;
    const base = wk.isPeak ? "var(--gold)" : "var(--green)", sd = wk.isPeak ? "var(--gold-d)" : "var(--green-d)";
    h += `<button class="pill" data-act="week" data-v="${wk.weekIndex}" style="min-width:56px;padding:10px 6px;font-size:13px;white-space:nowrap;
      ${cur ? `background:${base};color:#fff;box-shadow:0 3px 0 ${sd}` : "background:#fff;color:var(--grey);border:2px solid var(--line)"}">${wk.isPeak ? "🏝️" : "W" + (wk.weekIndex + 1)}</button>`;
  });
  return h + "</div>";
}
function dayTabs(days) {
  let h = '<div class="row" style="gap:6px;overflow-x:auto;padding-bottom:4px">';
  days.forEach((d, i) => {
    const cur = ui.selectedDay === i;
    h += `<button class="pill" data-act="day" data-v="${i}" style="min-width:44px;padding:9px 4px;font-size:12px;
      ${cur ? `background:${d.color};color:#fff` : "background:var(--soft);color:var(--grey);border:2px solid var(--line)"}">${d.day.replace("Day ", "D")}</button>`;
  });
  return h + "</div>";
}
function fmtDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// ---------- TAB: DASHBOARD (Home) ----------
function dashboard() {
  const today = todayStr();
  return `<div class="home-stack">
    ${screenHeading("TODAY", `Hi ${escapeHtml((AUTH.profile.display_name || "there").split(" ")[0])}`, "Meals first, then your goals and workout.")}
    ${goalStatusLine(today)}
    ${mealJournalCard(today)}
    ${dailyGoalsCard(today)}
    ${workoutPlanCard()}
  </div>`;
}

function goalStatusLine(today) {
  const goal = DB.goal;
  const status = goal.target_date
    ? `${Math.max(0, daysUntil(goal.target_date))} days to go · ${fmtDate(goal.target_date)}`
    : `Day ${Math.max(1, Math.floor((new Date(today) - new Date(goal.start_date + "T00:00:00")) / 86400000) + 1)} of consistency`;
  return `<div class="home-goal-strip">
    <span class="home-goal-icon">🎯</span>
    <div><div class="home-goal-title">${escapeHtml(goal.title)}</div><div class="home-goal-meta">${status}</div></div>
  </div>`;
}

function todayWorkoutProgress() {
  const day = DB.plan.weeks[DB.todayWeekIndex].days[DB.todayDayIndex];
  const total = day.ex.length;
  const done = day.ex.filter((slot) => DB.setLogs.filter((s) => s.exercise_id === slot.exerciseId).length >= slot.sets).length;
  return { day, total, done, complete: total === 0 || done >= total };
}

function mealJournalCard(today) {
  const currentWindow = currentMealWindow();
  const byType = {};
  const snacks = [];
  DB.mealLogs.forEach((l) => { if (l.meal_type === "snack") snacks.push(l); else byType[l.meal_type] = l; });
  const meals = [["breakfast", "🍳", "Breakfast"], ["lunch", "🍚", "Lunch"], ["dinner", "🍽️", "Dinner"]];
  const loggedCount = meals.filter(([type]) => byType[type]).length;
  const rotations = [-90, 30, 150];

  let h = `<section class="card home-card meal-card ${loggedCount === 3 ? "all-complete" : ""}">
    <div class="home-section-heading"><div><div class="home-eyebrow">TODAY'S MEALS</div><div class="home-section-title">Log what you eat</div></div><span class="home-count-badge">${loggedCount}/3</span></div>
    <div class="meal-ring-wrap">
      <svg class="meal-ring" viewBox="0 0 160 160" role="img" aria-label="${loggedCount} of 3 meals logged">
        <circle class="meal-ring-base" cx="80" cy="80" r="61" pathLength="100" stroke-dasharray="29 4.333" transform="rotate(-90 80 80)"></circle>
        ${meals.map(([type, , label], index) => {
          const log = byType[type];
          const isNow = currentWindow === type;
          const stateClass = log ? "is-logged" : isNow ? "is-now" : "";
          return `<circle class="meal-ring-segment ${stateClass}" data-act="openMeal" data-type="${type}" cx="80" cy="80" r="61" pathLength="100" stroke-dasharray="29 71" transform="rotate(${rotations[index]} 80 80)" aria-label="${label}${log ? ", logged" : ", not logged"}"></circle>`;
        }).join("")}
      </svg>
      <div class="meal-ring-center"><strong>${loggedCount}</strong><span>of 3 logged</span><small>${loggedCount === 3 ? "All meals done!" : "Tap a meal"}</small></div>
    </div>
    <div class="meal-chip-grid">`;

  meals.forEach(([type, icon, label]) => {
    const log = byType[type];
    const isNow = currentWindow === type;
    h += `<button class="meal-chip ${log ? "is-logged" : isNow ? "is-now" : ""}" data-act="openMeal" data-type="${type}">
      <span class="meal-chip-icon">${log && log.photo_path ? mealThumb(log, icon) : icon}</span>
      <span class="meal-chip-copy"><strong>${label}</strong><small>${log ? "✓ Logged" : isNow ? "Log now" : MEAL_WINDOWS[type].start}</small></span>
    </button>`;
  });
  h += `</div>`;

  if (snacks.length) {
    h += `<div class="snack-label">SNACKS & DRINKS</div><div class="snack-row">`;
    snacks.forEach((s) => {
      h += `<button class="snack-chip" data-act="openMeal" data-type="snack" data-id="${s.id}">${s.note ? escapeHtml(s.note) : "Snack"}</button>`;
    });
    h += `</div>`;
  }

  h += `<button class="add-snack-button" data-act="openMeal" data-type="snack"><span>＋</span> Add snack or drink</button>`;
  if (loggedCount === 3) h += `<div class="completion-note">🎉 Meals logged. Nice work staying aware today.</div>`;
  h += "</section>";
  return h;
}
function mealThumb(log, fallbackIcon) {
  if (!log || !log.photo_path) return `<span class="meal-thumb meal-thumb-fallback">${fallbackIcon}</span>`;
  const url = photoUrlFor(log.photo_path);
  if (!url) return `<span class="meal-thumb"></span>`;
  return `<img src="${url}" class="meal-thumb" alt=""/>`;
}

function dailyGoalsCard(today) {
  const workout = todayWorkoutProgress();
  const habitDoneCount = habitDefs.filter((hb) => isHabitDone(today, hb.id)).length;
  const completedCount = habitDoneCount + (workout.complete ? 1 : 0);
  const pct = Math.round((completedCount / (habitDefs.length + 1)) * 100);
  let h = `<section class="card home-card daily-goals-card ${completedCount === habitDefs.length + 1 ? "all-complete" : ""}">
    <div class="home-section-heading"><div><div class="home-eyebrow">GOALS FOR THE DAY</div><div class="home-section-title">Keep the streak alive</div></div><span class="home-count-badge is-orange">${completedCount}/${habitDefs.length + 1}</span></div>
    <div class="goal-progress"><span style="width:${pct}%"></span></div>
    <div class="daily-goal-grid">`;
  habitDefs.forEach((hb) => {
    const on = isHabitDone(today, hb.id);
    h += `<button class="daily-goal ${on ? "is-done" : ""}" data-act="habit" data-date="${today}" data-h="${hb.id}">
      <span class="daily-goal-icon">${hb.icon}</span><span class="daily-goal-label">${hb.label}</span><span class="daily-goal-check">${on ? "✓" : ""}</span>
    </button>`;
  });
  h += `<button class="daily-goal workout-goal ${workout.complete ? "is-done" : ""}" data-act="todayWorkout">
    <span class="daily-goal-icon">${workout.day.type === "rest" ? "🌿" : "🏋️"}</span>
    <span class="daily-goal-label"><strong>${workout.day.type === "rest" ? "Recovery plan" : "Today's workout"}</strong><small>${workout.total ? `${workout.done}/${workout.total} exercises complete` : "Rest and recharge"}</small></span>
    <span class="daily-goal-check">${workout.complete ? "✓" : "›"}</span>
  </button></div>${completedCount === habitDefs.length + 1 ? '<div class="completion-note">✨ Daily goals complete. That is how progress compounds.</div>' : ""}</section>`;
  return h;
}

function workoutPlanCard() {
  const workout = todayWorkoutProgress();
  const pct = workout.total ? Math.round((workout.done / workout.total) * 100) : 100;
  return `<section class="today-workout-card tap" data-act="todayWorkout" role="button" tabindex="0" aria-label="Open today's workout: ${escapeHtml(workout.day.focus)}" style="--workout-color:${workout.day.color}">
    <div class="workout-card-icon">${workout.day.type === "rest" ? "🌿" : "🏋️"}</div>
    <div class="workout-card-copy"><div class="workout-card-eyebrow">TODAY'S ${workout.day.type === "rest" ? "RECOVERY" : "WORKOUT PLAN"}</div>
      <div class="workout-card-title">${escapeHtml(workout.day.focus)}</div>
      <div class="workout-card-meta">${workout.total ? `${workout.total} exercises · ${workout.done} completed` : "Nothing scheduled today"}</div>
      <div class="workout-card-progress"><span style="width:${pct}%"></span></div>
    </div>
    <div class="workout-card-arrow">›</div>
  </section>`;
}

function escapeHtml(s) { return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// ---------- Meal log bottom sheet ----------
function mealSheetOverlay() {
  if (!ui.mealSheet) return "";
  const { type, log } = ui.mealSheet;
  const label = type === "snack" ? "Snack" : type[0].toUpperCase() + type.slice(1);
  const preview = ui.mealSheet.photoPreviewUrl || (log && log.photo_path ? photoUrlFor(log.photo_path) : null);
  const portion = ui.mealSheet.portion !== undefined ? ui.mealSheet.portion : (log ? log.portion : null);
  const feeling = ui.mealSheet.feeling !== undefined ? ui.mealSheet.feeling : (log ? log.feeling : null);
  const noteVal = ui.mealSheet.noteDraft !== undefined ? ui.mealSheet.noteDraft : (log ? log.note || "" : "");

  return `<div class="sheet-backdrop">
    <div class="bottom-sheet meal-log-sheet">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="font-size:17px;font-weight:900;color:var(--ink)">Log ${label}</div>
        <button data-act="closeMeal" style="border:none;background:var(--soft);width:32px;height:32px;border-radius:10px;font-size:16px;font-weight:900;color:var(--grey);cursor:pointer">✕</button>
      </div>

      <div style="margin-bottom:14px">
        ${preview
          ? `<div style="position:relative"><img src="${preview}" style="width:100%;height:200px;object-fit:cover;border-radius:16px"/>
             <button data-act="removePhoto" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.6);color:#fff;border:none;width:28px;height:28px;border-radius:9px;font-weight:900;cursor:pointer">✕</button></div>`
          : `<label style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;height:140px;background:var(--soft);border:2px dashed var(--line);border-radius:16px;cursor:pointer">
             <span style="font-size:28px">📷</span><span style="font-size:12px;font-weight:800;color:var(--grey)">Tap to add a photo (optional)</span>
             <input type="file" accept="image/*" capture="environment" data-act="mealPhoto" style="display:none"/></label>`}
      </div>

      <div style="font-size:12px;font-weight:800;color:var(--grey);margin-bottom:6px">Note (optional)</div>
      <textarea id="mealNoteInput" data-act="mealNote" placeholder="What did you eat?" style="width:100%;min-height:56px;background:var(--soft);border:2px solid var(--line);border-radius:14px;padding:10px;font-size:13px;resize:vertical;box-sizing:border-box;margin-bottom:14px">${escapeHtml(noteVal)}</textarea>

      <div style="font-size:12px;font-weight:800;color:var(--grey);margin-bottom:6px">Portion</div>
      <div class="row" style="gap:8px;margin-bottom:14px">
        ${["light", "normal", "heavy"].map((p) => `<button class="pill" data-act="portion" data-v="${p}" style="flex:1;padding:10px;font-size:12px;
          ${portion === p ? "background:var(--green);color:#fff" : "background:var(--soft);color:var(--grey);border:2px solid var(--line)"}">${p[0].toUpperCase() + p.slice(1)}</button>`).join("")}
      </div>

      <div style="font-size:12px;font-weight:800;color:var(--grey);margin-bottom:6px">How'd it feel?</div>
      <div class="row" style="gap:8px;margin-bottom:18px;flex-wrap:wrap">
        ${[["satisfied", "😋"], ["good", "🙂"], ["sluggish", "😑"], ["guilty", "😬"]].map(([f, e]) => `<button class="pill" data-act="feeling" data-v="${f}" style="padding:9px 12px;font-size:12px;
          ${feeling === f ? "background:var(--purple);color:#fff" : "background:var(--soft);color:var(--grey);border:2px solid var(--line)"}">${e} ${f}</button>`).join("")}
      </div>

      <div class="row" style="gap:8px">
        ${log ? `<button class="btn3d" data-act="deleteMeal" style="padding:14px 16px;font-size:13px;background:var(--red);--sd:var(--red-d)">Delete</button>` : ""}
        <button class="btn3d" data-act="saveMeal" style="flex:1;padding:14px;font-size:14px;background:var(--green);--sd:var(--green-d)">${ui.mealSheet.saving ? "Saving..." : "Save entry"}</button>
      </div>
    </div></div>`;
}

function openMealSheet(type, log) {
  ui.mealSheet = { type, log: log || null, photoBlob: null, photoPreviewUrl: null, portion: undefined, feeling: undefined, noteDraft: undefined };
  render();
}
function closeMealSheet() { ui.mealSheet = null; render(); }

async function saveMealSheet() {
  const s = ui.mealSheet; if (!s || s.saving) return;
  s.saving = true; render();
  try {
    const today = todayStr();
    let photoPath = s.log ? s.log.photo_path : null;
    if (s.photoBlob) photoPath = await uploadMealPhoto(AUTH.user.id, today, s.type, s.photoBlob);
    else if (s.photoRemoved) photoPath = null;

    const note = document.getElementById("mealNoteInput") ? document.getElementById("mealNoteInput").value : (s.noteDraft || "");
    await upsertMealLog(AUTH.user.id, {
      logDate: today, mealType: s.type, photoPath,
      note: note || null,
      portion: s.portion !== undefined ? s.portion : (s.log ? s.log.portion : null),
      feeling: s.feeling !== undefined ? s.feeling : (s.log ? s.log.feeling : null),
    });
    DB.mealLogs = await getMealLogsForDate(AUTH.user.id, today);
    ui.mealSheet = null;
  } catch (e) {
    showToast("Couldn't save that entry. Check your connection and try again.", "is-error");
    s.saving = false;
  }
  render();
}
async function deleteMealSheetEntry() {
  const s = ui.mealSheet; if (!s || !s.log) return;
  await deleteMealLog(s.log.id);
  DB.mealLogs = await getMealLogsForDate(AUTH.user.id, todayStr());
  ui.mealSheet = null;
  render();
}

// ---------- TAB: WORKOUT ----------
function workoutTab() {
  const week = DB.plan.weeks[ui.selectedWeek];
  const day = week.days[ui.selectedDay];
  const isToday = ui.selectedWeek === DB.todayWeekIndex && ui.selectedDay === DB.todayDayIndex;
  const totalSlots = day.ex.length;
  const doneSlots = isToday ? day.ex.filter((slot) => DB.setLogs.filter((s) => s.exercise_id === slot.exerciseId).length >= slot.sets).length : 0;
  const pct = totalSlots ? (doneSlots / totalSlots) * 100 : 0;
  const date = dateForWeekDay(DB.goal, week.weekIndex, ui.selectedDay);

  let h = `<div class="screen-stack workout-screen">
    ${screenHeading("TRAIN", isToday ? "Today's workout" : "Workout schedule", isToday ? "Beat your previous numbers, one set at a time." : "Browse your program without changing today's log.")}
    <button class="schedule-toggle" data-act="toggleWorkoutBrowse"><span>📅 ${fmtDate(date)}</span><strong>${ui.workoutBrowse ? "Hide schedule" : "Browse schedule"}</strong></button>
    ${ui.workoutBrowse ? `<div class="schedule-browser">${weekSelector()}${dayTabs(week.days)}</div>` : ""}
    <section class="workout-hero" style="--day-color:${day.color}">
      <div class="workout-hero-top"><span>${week.isPeak ? "PEAK WEEK" : "WEEK " + (week.weekIndex + 1)} · ${day.day}</span><span>${isToday ? "TODAY" : isFuture(week, day) ? "UPCOMING" : "PAST"}</span></div>
      <h2>${escapeHtml(day.focus)}</h2>
      <p>${totalSlots ? `${totalSlots} exercises · ${doneSlots} completed` : "Recovery is part of the plan."}</p>
      <div class="workout-hero-progress"><span style="width:${pct}%"></span></div>
      ${day.note ? `<div class="workout-note">${escapeHtml(day.note)}</div>` : ""}
    </section>`;

  day.ex.forEach((slot) => h += exerciseCard(week, day, slot, isToday));
  if (!day.ex.length) h += `<div class="empty-state"><div>🌿</div><h3>Recovery day</h3><p>Nothing to log today. Rest, walk, stretch, and come back stronger.</p></div>`;

  if (isToday && totalSlots) {
    const actionLabel = doneSlots >= totalSlots ? "Workout complete" : doneSlots ? `Continue workout · ${doneSlots}/${totalSlots}` : "Start workout";
    h += `<div class="workout-action-dock"><button class="btn3d" data-act="resumeWorkout" style="--sd:var(--green-d)">${doneSlots >= totalSlots ? "✓" : "▶"} ${actionLabel}</button></div>`;
  }

  return h + "</div>";
}
function isFuture(week, day) {
  const dateStr = dateForWeekDay(DB.goal, week.weekIndex, DB.plan.weeks[week.weekIndex].days.indexOf(day));
  return dateStr > todayStr();
}

function exerciseCard(week, day, slot, isToday) {
  const exercise = EXERCISES[slot.exerciseId] || { name: slot.exerciseId, muscle: "" };
  const key = `${week.weekIndex}-${day.day}-${slot.slot}`;
  const expanded = ui.expandedSlot === key;
  const loggedSets = isToday ? DB.setLogs.filter((s) => s.exercise_id === slot.exerciseId).sort((a, b) => a.set_number - b.set_number) : [];
  const allDone = isToday && loggedSets.length >= slot.sets;

  let h = `<section class="exercise-card ${allDone ? "is-complete" : ""}" id="exercise-${key}">
    <div class="exercise-card-header">
      <button class="exercise-expand" data-act="toggleSlot" data-key="${key}" aria-expanded="${expanded}">
        <span class="exercise-status">${allDone ? "✓" : slot.slot + 1}</span>
        <span class="exercise-title"><strong>${escapeHtml(exercise.name)}</strong><small>${slot.sets} sets · ${slot.reps} reps${slot.rest !== "-" ? " · " + slot.rest + " rest" : ""}</small></span>
        <span class="exercise-chevron">${expanded ? "−" : "+"}</span>
      </button>
      <button class="exercise-more" data-act="toggleExerciseMenu" data-key="${key}" aria-label="Exercise options">•••</button>
    </div>`;

  if (ui.exerciseMenu === key) {
    h += `<div class="exercise-menu">
      <button data-act="openSwap" data-key="${key}" data-muscle="${exercise.muscle}" data-exercise="${slot.exerciseId}">↔ Swap exercise</button>
      <button data-act="openAdjust" data-key="${key}">⚙ Adjust sets & reps</button>
    </div>`;
  }

  if (expanded) {
    h += `<div class="exercise-card-body">`;
    const last = lastSetsFor(slot.exerciseId);
    if (isToday) {
      h += `<div class="set-table"><div class="set-row set-head"><span>SET</span><span>PREVIOUS</span><span>KG</span><span>REPS</span><span></span></div>`;
      for (let i = 1; i <= slot.sets; i++) {
        const current = loggedSets.find((s) => s.set_number === i) || loggedSets[i - 1];
        const previous = last && (last.find((s) => s.set_number === i) || last[i - 1]);
        const isNext = !current && i === loggedSets.length + 1;
        h += `<div class="set-row ${current ? "is-complete" : isNext ? "is-next" : ""}">
          <span class="set-number">${i}</span>
          <span class="set-previous">${previous ? `${previous.weight_kg || 0}×${previous.reps || 0}` : "—"}</span>
          ${current ? `<strong>${current.weight_kg || 0}</strong><strong>${current.reps || 0}</strong><span class="set-check">✓</span>`
            : isNext ? `<input type="number" inputmode="decimal" step="0.5" placeholder="kg" id="setWeight-${key}" aria-label="Weight in kilograms for set ${i}"/><input type="number" inputmode="numeric" placeholder="${String(slot.reps).replace(/[^0-9].*$/, "") || "reps"}" id="setReps-${key}" aria-label="Repetitions for set ${i}"/><button class="set-log-button" data-act="logSet" data-key="${key}" data-exercise="${slot.exerciseId}" data-setnum="${i}" aria-label="Complete set ${i}">✓</button>`
            : `<span>—</span><span>—</span><span class="set-pending"></span>`}
        </div>`;
      }
      h += `</div>`;
    } else {
      h += `<div class="locked-note">Set logging opens on the scheduled day. You can still review or adjust the exercise.</div>`;
    }
    h += `</div>`;
  }
  h += "</section>";
  return h;
}

async function logSetFor(key, exerciseId, setNumber) {
  const wEl = document.getElementById(`setWeight-${key}`), rEl = document.getElementById(`setReps-${key}`);
  const weight = parseFloat(wEl.value), reps = parseInt(rEl.value, 10);
  if (!weight || !reps) { showToast("Enter both weight and reps.", "is-error"); return; }
  await logSet(AUTH.user.id, { logDate: todayStr(), exerciseId, setNumber, weightKg: weight, reps });
  DB.setLogs = await getSetLogsForDate(AUTH.user.id, todayStr());
  render();
}

function slotFromKey(key) {
  const [weekIndex, dayName, slotIdx] = [parseInt(key.split("-")[0], 10), key.split("-")[1], parseInt(key.split("-")[2], 10)];
  const week = DB.plan.weeks[weekIndex];
  const dayIndex = week.days.findIndex((d) => d.day === dayName);
  const day = week.days[dayIndex];
  const slot = day.ex[day.ex.findIndex((s) => s.slot === slotIdx)];
  return { weekIndex, dayIndex, day, slot };
}

async function saveOverride(weekIndex, dayIndex, slot, patch) {
  await upsertOverride(AUTH.user.id, DB.goal.id, {
    week: weekIndex, day: dayIndex, slot: slot.slot,
    exerciseId: patch.exerciseId !== undefined ? patch.exerciseId : slot.exerciseId,
    sets: patch.sets !== undefined ? patch.sets : slot.sets,
    reps: patch.reps !== undefined ? patch.reps : slot.reps,
    rest: patch.rest !== undefined ? patch.rest : slot.rest,
  });
  const generated = generatePlan(DB.goal);
  DB.overrides = await getOverrides(AUTH.user.id, DB.goal.id);
  DB.plan = { template: generated.template, weeks: applyOverrides(generated.weeks, DB.overrides) };
}

function swapPickerOverlay() {
  if (!ui.swapPicker) return "";
  const { muscle, exerciseId } = ui.swapPicker;
  const current = EXERCISES[exerciseId];
  const options = Object.values(EXERCISES).filter((e) => e.muscle === muscle && e.id !== exerciseId);
  return `<div class="sheet-backdrop">
    <div class="bottom-sheet">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="font-size:17px;font-weight:900;color:var(--ink)">Swap ${current ? current.name : ""}</div>
        <button data-act="closeSwap" style="border:none;background:var(--soft);width:32px;height:32px;border-radius:10px;font-size:16px;font-weight:900;color:var(--grey);cursor:pointer">✕</button>
      </div>
      ${options.length ? options.map((o) => `<div class="tap" data-act="doSwap" data-exercise="${o.id}" style="padding:13px 14px;border:2px solid var(--line);border-radius:14px;margin-bottom:8px;font-size:14px;font-weight:800;color:var(--ink)">${o.name}</div>`).join("")
        : `<div style="font-size:13px;color:var(--grey);font-weight:700">No alternatives in the library for this muscle group yet.</div>`}
    </div></div>`;
}

function adjustFormOverlay() {
  if (!ui.adjustSlot) return "";
  const { key } = ui.adjustSlot;
  const { slot } = slotFromKey(key);
  return `<div class="sheet-backdrop">
    <div class="bottom-sheet">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="font-size:17px;font-weight:900;color:var(--ink)">Adjust sets/reps</div>
        <button data-act="closeAdjust" style="border:none;background:var(--soft);width:32px;height:32px;border-radius:10px;font-size:16px;font-weight:900;color:var(--grey);cursor:pointer">✕</button>
      </div>
      <div class="row" style="gap:10px;margin-bottom:14px">
        <div style="flex:1"><div style="font-size:11px;font-weight:800;color:var(--grey);margin-bottom:5px">Sets</div>
          <input id="adjSets" type="number" value="${slot.sets}" style="width:100%;padding:11px;background:var(--soft);border:2px solid var(--line);border-radius:12px;font-size:14px;font-weight:800;text-align:center;box-sizing:border-box"/></div>
        <div style="flex:1"><div style="font-size:11px;font-weight:800;color:var(--grey);margin-bottom:5px">Reps</div>
          <input id="adjReps" type="text" value="${slot.reps}" style="width:100%;padding:11px;background:var(--soft);border:2px solid var(--line);border-radius:12px;font-size:14px;font-weight:800;text-align:center;box-sizing:border-box"/></div>
        <div style="flex:1"><div style="font-size:11px;font-weight:800;color:var(--grey);margin-bottom:5px">Rest</div>
          <input id="adjRest" type="text" value="${slot.rest}" style="width:100%;padding:11px;background:var(--soft);border:2px solid var(--line);border-radius:12px;font-size:14px;font-weight:800;text-align:center;box-sizing:border-box"/></div>
      </div>
      <button class="btn3d" data-act="saveAdjust" style="width:100%;padding:13px;font-size:14px;background:var(--green);--sd:var(--green-d)">Save</button>
    </div></div>`;
}

// ---------- TAB: PLAN ----------
function planTab() {
  return `<div class="screen-stack plan-screen">
    ${screenHeading("PLAN", "Your playbook", "Meal ideas and practical guidance for the goal you're working toward.")}
    <div class="segmented-control" role="tablist" aria-label="Plan sections">
      <button class="${ui.planSection === "meals" ? "is-active" : ""}" data-act="planSection" data-v="meals" role="tab">Meal plan</button>
      <button class="${ui.planSection === "guide" ? "is-active" : ""}" data-act="planSection" data-v="guide" role="tab">Guide</button>
    </div>
    ${ui.planSection === "guide" ? guideTab() : mealsTab()}
  </div>`;
}

// ---------- TAB: MEALS (suggested plan) ----------
function mealsTab() {
  const week = DB.plan.weeks[ui.selectedWeek];
  const day = week.days[ui.selectedDay];
  const plan = getMealsForDay(DB.plan.template, week, day, ui.selectedDay);
  const total = plan ? plan.meals.reduce((s, m) => s + m.cals, 0) : 0;
  const barColor = week.isPeak ? "var(--green)" : "var(--blue)";

  let h = '<div class="subscreen-stack"><div class="schedule-browser">' + weekSelector() + dayTabs(week.days) + '</div>';
  if (plan) {
    h += `<section class="meal-plan-summary" style="--plan-color:${barColor}">
      <div><span>SUGGESTED DAY</span><h2>${escapeHtml(plan.label)}</h2><p>A guide, not a score. Log what you actually eat on Today.</p></div>
      <div class="macro-summary"><strong>~${total}<small>kcal</small></strong><span>P ${plan.protein}</span><span>C ${plan.carbs}</span><span>F ${plan.fat}</span></div>
    </section>`;
    plan.meals.forEach((meal) => {
      h += `<article class="meal-plan-card"><div class="meal-plan-time">${meal.time}</div><div class="meal-plan-copy">
        <div><h3>${escapeHtml(meal.name)}</h3><span>${meal.cals} kcal</span></div><p>${escapeHtml(meal.desc)}</p>
        <small>P ${meal.p}g · C ${meal.c}g · F ${meal.f}g</small></div></article>`;
    });
  }
  h += `<div class="info-callout">💡 Meal logging stays on <strong>Today</strong>; this page is only your suggested plan.</div>`;
  return h + "</div>";
}

// ---------- TAB: PROGRESS ----------
function progressTab() {
  ensureHabitWeek(ui.selectedWeek);
  const week = DB.plan.weeks[ui.selectedWeek];
  const dates = weekDates(DB.goal, ui.selectedWeek);
  const defaultDay = ui.selectedWeek === DB.todayWeekIndex ? DB.todayDayIndex : 0;
  const selectedDay = ui.progressDay == null ? defaultDay : Math.min(ui.progressDay, 6);
  const selectedDate = dates[selectedDay];
  const habitTotal = dates.reduce((sum, date) => sum + habitDefs.filter((hb) => isHabitDone(date, hb.id)).length, 0);
  const habitPossible = dates.length * habitDefs.length;
  const habitPct = habitPossible ? Math.round((habitTotal / habitPossible) * 100) : 0;
  const latestWeight = DB.weightEntries.length ? DB.weightEntries[DB.weightEntries.length - 1].weight_kg : null;

  let h = `<div class="screen-stack progress-screen">
    ${screenHeading("PROGRESS", "See the work add up", "Small daily wins become visible trends here.")}
    <div class="progress-summary-grid">
      <article><span>Current weight</span><strong>${latestWeight != null ? `${latestWeight} kg` : "—"}</strong><small>Goal ${DB.goal.goal_weight} kg</small></article>
      <article><span>Weekly habits</span><strong>${habitPct}%</strong><small>${habitTotal} of ${habitPossible} checks</small></article>
    </div>
    <section class="progress-card">
      <div class="card-heading"><div><span>WEEKLY HABITS</span><h2>Consistency</h2></div><strong>${habitTotal}/${habitPossible}</strong></div>
      ${weekSelector()}
      <div class="progress-days">`;
  DAYS.forEach((name, index) => {
    const count = habitDefs.filter((hb) => isHabitDone(dates[index], hb.id)).length;
    h += `<button class="${selectedDay === index ? "is-active" : ""} ${count === habitDefs.length ? "is-complete" : ""}" data-act="progressDay" data-v="${index}"><span>${name.slice(0, 1)}</span><strong>${count}</strong></button>`;
  });
  h += `</div><div class="habit-editor"><div class="habit-editor-title"><strong>${fmtDate(selectedDate)}</strong><span>Tap to update</span></div>`;
  habitDefs.forEach((hb) => {
    const on = isHabitDone(selectedDate, hb.id);
    h += `<button class="habit-row ${on ? "is-done" : ""}" data-act="habit" data-date="${selectedDate}" data-h="${hb.id}"><span>${hb.icon}</span><strong>${hb.label}</strong><i>${on ? "✓" : ""}</i></button>`;
  });
  const note = DB.weekNotes[week.weekIndex] || "";
  h += `</div><label class="field-label" for="weekNoteInput">Weekly reflection</label><textarea id="weekNoteInput" data-week="${week.weekIndex}" placeholder="Energy, cravings, recovery…">${escapeHtml(note)}</textarea></section>
    <section class="progress-card"><div class="card-heading"><div><span>WEIGHT TREND</span><h2>Body weight</h2></div></div>
      <div class="quick-log"><input id="weighInInput" type="number" inputmode="decimal" step="0.1" placeholder="Today's weight (kg)"/><button class="btn3d" data-act="logWeight" style="--sd:var(--green-d)">Log</button></div>
      <div class="chart-wrap"><canvas id="weightChart"></canvas></div></section>
    <section class="progress-card"><div class="card-heading"><div><span>STRENGTH TREND</span><h2>Best set over time</h2></div></div>
      <select id="strengthExercise">${Object.values(EXERCISES).filter((e) => e.muscle && e.muscle !== "recovery" && e.muscle !== "cardio").map((e) => `<option value="${e.id}" ${ui.strengthExercise === e.id ? "selected" : ""}>${e.name}</option>`).join("")}</select>
      <div class="chart-wrap"><canvas id="strengthChart"></canvas></div></section>
  </div>`;
  return h;
}

// ---------- TAB: HABITS ----------
function habitsTab() {
  ensureHabitWeek(ui.selectedWeek);
  const week = DB.plan.weeks[ui.selectedWeek];
  const dates = weekDates(DB.goal, ui.selectedWeek);
  let h = '<div style="display:flex;flex-direction:column;gap:12px">' + weekSelector();
  h += `<div style="font-size:16px;font-weight:900;color:var(--ink)">Daily Habits — ${week.isPeak ? "Peak Week" : "Week " + (week.weekIndex + 1)}</div>`;
  DAYS.forEach((dn, di) => {
    const date = dates[di];
    const cnt = habitDefs.filter((hb) => isHabitDone(date, hb.id)).length;
    const all = cnt === habitDefs.length;
    h += `<div style="background:${all ? "#F0FBE6" : "#fff"};border:2px solid ${all ? "var(--green)" : "var(--line)"};border-radius:18px;padding:14px">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:15px;font-weight:900;color:${all ? "var(--green-d)" : "var(--ink)"}">${dn} ${all ? "🎉" : ""}</span>
        <span style="font-size:12px;color:#fff;background:${all ? "var(--green)" : "var(--grey)"};padding:2px 10px;border-radius:10px;font-weight:800">${cnt}/${habitDefs.length}</span></div>`;
    habitDefs.forEach((hb) => {
      const on = isHabitDone(date, hb.id);
      h += `<div class="tap" data-act="habit" data-date="${date}" data-h="${hb.id}" style="display:flex;align-items:center;gap:9px;padding:6px 0">
        ${check(on, 20)}<span style="font-size:13px;font-weight:800;color:${on ? "var(--green-d)" : "var(--ink)"}">${hb.icon} ${hb.label}</span></div>`;
    });
    h += "</div>";
  });
  const note = DB.weekNotes[week.weekIndex] || "";
  h += `<div class="card">${sectionTitle("Weekly Note")}
    <textarea id="weekNoteInput" data-week="${week.weekIndex}" placeholder="Energy? Cravings? How's the body feeling?" style="width:100%;min-height:56px;background:var(--soft);border:2px solid var(--line);border-radius:14px;color:var(--ink);padding:10px;font-size:13px;resize:vertical;box-sizing:border-box">${escapeHtml(note)}</textarea></div>`;
  return h + "</div>";
}

// ---------- TAB: GUIDE ----------
function guideTab() {
  let h = '<div class="subscreen-stack">';
  h += `<div class="guide-intro"><div>📖</div><h2>Simple rules that travel well</h2><p>Muscle-sparing, sustainable, and practical enough for everyday life.</p></div>`;
  guideSections.forEach((s) => {
    h += `<article class="guide-card" style="--guide-color:${s.color}"><h3>${escapeHtml(s.title)}</h3>`;
    s.items.forEach((it, j) => {
      h += `<p><span>${j + 1}</span>${escapeHtml(it)}</p>`;
    });
    h += "</article>";
  });
  return h + "</div>";
}

// ---------- TAB: PROFILE ----------
let weightChartInstance = null, strengthChartInstance = null;
if (typeof Chart !== "undefined") { Chart.defaults.font.family = "'Nunito', -apple-system, sans-serif"; Chart.defaults.font.weight = 700; }

function profileTab() {
  const goal = DB.goal;
  const name = AUTH.profile.display_name || "Fitness member";
  const isGuest = Boolean(AUTH.user.is_anonymous || !AUTH.user.email);
  const accountLabel = isGuest ? "Guest account · saved on this device" : AUTH.user.email;
  const initial = name.trim().charAt(0).toUpperCase() || "F";
  const currentWeight = DB.weightEntries.length ? Number(DB.weightEntries[DB.weightEntries.length - 1].weight_kg) : Number(goal.start_weight);
  const weightDistance = Math.abs(Number(goal.start_weight) - Number(goal.goal_weight));
  const goalProgress = weightDistance ? Math.max(0, Math.min(100, Math.round((Math.abs(Number(goal.start_weight) - currentWeight) / weightDistance) * 100))) : 100;
  return `<div class="screen-stack profile-screen">
    ${screenHeading("ME", "Your space", "Goals, reminders, account, and app settings.")}
    <section class="profile-identity"><div class="profile-avatar">${escapeHtml(initial)}</div><div><h2>${escapeHtml(name)}</h2><p>${escapeHtml(accountLabel)}</p></div></section>
    <section class="goal-detail-card">
      <div class="card-heading"><div><span>ACTIVE GOAL</span><h2>${escapeHtml(goal.title)}</h2></div><div class="goal-target">${goal.goal_weight}kg</div></div>
      <div class="goal-route"><span>${goal.start_weight}kg</span><i><b style="width:${goalProgress}%"></b></i><span>${goal.goal_weight}kg</span></div>
      <p>${goal.target_date ? `Target ${fmtDate(goal.target_date)} · ${Math.max(0, daysUntil(goal.target_date))} days remaining` : "No fixed deadline · consistency mode"}</p>
      <button class="secondary-button" data-act="newGoalForm">${ui.newGoalOpen ? "Close goal form" : "Start a new goal"}</button>
      ${ui.newGoalOpen ? newGoalForm() : ""}
    </section>
    <section class="settings-card"><div class="card-heading"><div><span>PREFERENCES</span><h2>App settings</h2></div></div>
      <button class="settings-row" data-act="togglePush"><span class="settings-icon">🔔</span><span><strong>Meal reminders</strong><small>Breakfast, lunch, and dinner nudges</small></span><i>${ui.pushEnabled ? "On" : "Off"}</i></button>
      <button class="settings-row danger" data-act="signOut"><span class="settings-icon">↗</span><span><strong>Sign out</strong><small>${isGuest ? "Guest progress cannot be recovered after sign-out" : "End this session on this device"}</small></span><i>›</i></button>
    </section>
    <details class="advanced-card"><summary><span><strong>Advanced</strong><small>Legacy import and data tools</small></span><i>＋</i></summary>
      <div><p>Import weigh-ins and habit history stored by an older version of this app.</p><button class="secondary-button" data-act="importLegacy">Import legacy backup</button></div>
    </details>
    <p class="medical-note">Fitness Tracker offers general guidance, not medical or dietary advice.</p>
  </div>`;
}

function newGoalForm() {
  return `<div class="inline-form">
    <label class="field-label" for="ngTitle">Goal name</label><input id="ngTitle" placeholder="e.g. 8-week strength block"/>
    <div class="two-column-fields">
      <div><label class="field-label" for="ngCurrent">Current kg</label><input id="ngCurrent" type="number" inputmode="decimal" step="0.1" placeholder="60"/></div>
      <div><label class="field-label" for="ngGoal">Goal kg</label><input id="ngGoal" type="number" inputmode="decimal" step="0.1" placeholder="56.5"/></div>
    </div>
    <label class="field-label" for="ngDate">Target date (optional)</label><input id="ngDate" type="date"/>
    <button class="btn3d primary-button" data-act="createGoal" style="--sd:var(--green-d)">Generate my plan</button>
  </div>`;
}

async function submitNewGoal() {
  const title = document.getElementById("ngTitle").value.trim();
  const current = parseFloat(document.getElementById("ngCurrent").value);
  const goalW = parseFloat(document.getElementById("ngGoal").value);
  const date = document.getElementById("ngDate").value || null;
  if (!title || !current || !goalW) { showToast("Fill in the goal name and both weights.", "is-error"); return; }
  const today = todayStr();
  const templateId = date ? "lean-peak" : "consistency";
  const durationWeeks = date ? Math.max(1, Math.ceil((new Date(date) - new Date(today)) / (7 * 86400000))) : 5;
  await createGoal(AUTH.user.id, {
    title, target_date: date, start_weight: current, goal_weight: goalW,
    template_id: templateId, duration_weeks: durationWeeks, start_date: today, is_active: true,
  });
  await upsertWeightEntry(AUTH.user.id, today, current);
  ui.newGoalOpen = false; ui.selectedWeek = 0; ui.selectedDay = 0;
  await loadAll(); showToast("Your new plan is ready.", "is-success"); render();
}

function renderWeightChart() {
  const canvas = document.getElementById("weightChart");
  if (!canvas || typeof Chart === "undefined") return;
  if (weightChartInstance) { weightChartInstance.destroy(); weightChartInstance = null; }
  const entries = DB.weightEntries;
  weightChartInstance = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: entries.map((e) => fmtDate(e.entry_date)),
      datasets: [{
        label: "Weigh-in", data: entries.map((e) => e.weight_kg),
        borderColor: "#58CC02", backgroundColor: "#58CC02", pointBackgroundColor: "#58CC02",
        pointBorderColor: "#fff", pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 7, borderWidth: 3, tension: 0.3,
      }, {
        label: `Goal (${DB.goal.goal_weight}kg)`, data: entries.map(() => DB.goal.goal_weight),
        borderColor: "#FFC800", borderDash: [6, 6], borderWidth: 2, pointRadius: 0, pointHitRadius: 0, fill: false, tension: 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12, boxHeight: 12, padding: 14, color: "#243129", font: { weight: 800, size: 11 } } } },
      scales: { x: { grid: { display: false }, ticks: { color: "#66736B", font: { weight: 800, size: 10 } } },
        y: { grid: { color: "#DDE6DD" }, ticks: { color: "#66736B", font: { weight: 700, size: 11 }, callback: (v) => v + "kg" } } },
    },
  });
}

async function renderStrengthChart() {
  const canvas = document.getElementById("strengthChart");
  if (!canvas || typeof Chart === "undefined") return;
  const select = document.getElementById("strengthExercise");
  const exerciseId = ui.strengthExercise || (select && select.value) || Object.values(EXERCISES).find((e) => e.muscle && e.muscle !== "recovery" && e.muscle !== "cardio").id;
  const history = await getSetHistory(AUTH.user.id, exerciseId);
  const byDate = {};
  history.forEach((s) => { byDate[s.log_date] = Math.max(byDate[s.log_date] || 0, s.weight_kg || 0); });
  const dates = Object.keys(byDate).sort();
  if (strengthChartInstance) { strengthChartInstance.destroy(); strengthChartInstance = null; }
  strengthChartInstance = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: { labels: dates.map(fmtDate), datasets: [{ label: "Best set (kg)", data: dates.map((d) => byDate[d]),
      borderColor: "#CE82FF", backgroundColor: "#CE82FF", pointBackgroundColor: "#CE82FF", pointBorderColor: "#fff",
      pointBorderWidth: 2, pointRadius: 5, borderWidth: 3, tension: 0.3 }] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: dates.length > 0, position: "bottom", labels: { color: "#243129", font: { weight: 800, size: 11 } } } },
      scales: { x: { grid: { display: false }, ticks: { color: "#66736B", font: { weight: 800, size: 10 } } },
        y: { grid: { color: "#DDE6DD" }, ticks: { color: "#66736B", font: { weight: 700, size: 11 }, callback: (v) => v + "kg" } } } },
  });
  if (!dates.length) {
    canvas.parentElement.insertAdjacentHTML("beforeend", '<div id="strengthEmpty" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--grey);font-weight:700">No sets logged for this exercise yet.</div>');
  }
}

async function importLegacyData() {
  let raw;
  try { raw = JSON.parse(localStorage.getItem("fitnessTracker_app_v1")); } catch (e) {}
  if (!raw) { showToast("No legacy backup was found on this device."); return; }
  let imported = 0;
  if (Array.isArray(raw.weeklyWeights)) {
    for (let i = 0; i < raw.weeklyWeights.length; i++) {
      const w = raw.weeklyWeights[i];
      if (w === "" || w == null) continue;
      const d = new Date(DB.goal.start_date + "T00:00:00"); d.setDate(d.getDate() + i * 7);
      await upsertWeightEntry(AUTH.user.id, todayStr(d), parseFloat(w));
      imported++;
    }
  }
  if (raw.completedHabits) {
    for (const key of Object.keys(raw.completedHabits)) {
      if (!raw.completedHabits[key]) continue;
      const [w, d, habitId] = key.split("-");
      const date = dateForWeekDay(DB.goal, parseInt(w, 10), parseInt(d, 10));
      await toggleHabitLog(AUTH.user.id, date, habitId, true);
      imported++;
    }
  }
  DB.weightEntries = await getWeightEntries(AUTH.user.id);
  DB.habitWeeksLoaded.clear();
  showToast(`Imported ${imported} legacy entries.`, "is-success");
  render();
}

// ---------- push notifications ----------
async function togglePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) { showToast("Push notifications aren't supported in this browser.", "is-error"); return; }
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    await removePushSubscription(existing.endpoint);
    await existing.unsubscribe();
    ui.pushEnabled = false;
  } else {
    try {
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
      await savePushSubscription(AUTH.user.id, sub);
      ui.pushEnabled = true;
    } catch (e) {
      showToast("Couldn't enable reminders. On iPhone, add the app to your Home Screen first.", "is-error");
      return;
    }
  }
  showToast(ui.pushEnabled ? "Meal reminders enabled." : "Meal reminders disabled.", "is-success");
  render();
}
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// ---------- MAIN RENDER ----------
function render() {
  if (!DB.goal) return;
  const tabs = [["dashboard", "Today"], ["workout", "Train"], ["plan", "Plan"], ["progress", "Progress"], ["profile", "Me"]];
  if (!tabs.some((t) => t[0] === ui.activeTab)) ui.activeTab = "dashboard";
  let nav = '<nav class="bottom-nav" aria-label="Primary navigation">';
  tabs.forEach((t) => {
    const a = ui.activeTab === t[0];
    nav += `<button data-act="tab" data-v="${t[0]}" class="${a ? "is-active" : ""}" aria-current="${a ? "page" : "false"}">${navIcon(t[0])}<span>${t[1]}</span></button>`;
  });
  nav += "</nav>";

  let body = "";
  if (ui.activeTab === "dashboard") body = dashboard();
  else if (ui.activeTab === "workout") body = workoutTab();
  else if (ui.activeTab === "plan") body = planTab();
  else if (ui.activeTab === "progress") body = progressTab();
  else if (ui.activeTab === "profile") body = profileTab();

  const displayName = AUTH.profile.display_name || "there";
  const initial = displayName.trim().charAt(0).toUpperCase() || "F";

  document.getElementById("app").innerHTML = `
    <div class="app-shell">
      <header class="app-topbar"><div><span class="app-wordmark">FT</span><span class="app-date">${new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</span></div><button class="topbar-avatar" data-act="tab" data-v="profile" aria-label="Open profile">${escapeHtml(initial)}</button></header>
      <main class="app-main">${body}</main>
      ${nav}
    </div>
    ${mealSheetOverlay()}${swapPickerOverlay()}${adjustFormOverlay()}`;

  saveUi();
  if (ui.activeTab === "progress") { renderWeightChart(); renderStrengthChart(); }
  else { if (weightChartInstance) { weightChartInstance.destroy(); weightChartInstance = null; } if (strengthChartInstance) { strengthChartInstance.destroy(); strengthChartInstance = null; } }
}

// ---------- EVENTS ----------
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]"); if (!btn) return;
  const act = btn.dataset.act;

  if (act === "tab") {
    ui.activeTab = btn.dataset.v; ui.expandedSlot = null; ui.exerciseMenu = null;
    if (ui.activeTab === "workout") { ui.selectedWeek = DB.todayWeekIndex; ui.selectedDay = DB.todayDayIndex; ui.workoutBrowse = false; }
  }
  else if (act === "todayWorkout") {
    ui.activeTab = "workout";
    ui.selectedWeek = DB.todayWeekIndex;
    ui.selectedDay = DB.todayDayIndex;
    ui.expandedSlot = null;
    ui.workoutBrowse = false;
    ui.exerciseMenu = null;
  }
  else if (act === "week") { ui.selectedWeek = parseInt(btn.dataset.v, 10); ui.selectedDay = 0; ui.progressDay = null; }
  else if (act === "day") { ui.selectedDay = parseInt(btn.dataset.v, 10); }
  else if (act === "planSection") { ui.planSection = btn.dataset.v; }
  else if (act === "progressDay") { ui.progressDay = parseInt(btn.dataset.v, 10); }
  else if (act === "toggleWorkoutBrowse") { ui.workoutBrowse = !ui.workoutBrowse; }
  else if (act === "toggleExerciseMenu") { ui.exerciseMenu = ui.exerciseMenu === btn.dataset.key ? null : btn.dataset.key; }
  else if (act === "resumeWorkout") {
    const day = DB.plan.weeks[DB.todayWeekIndex].days[DB.todayDayIndex];
    const next = day.ex.find((slot) => DB.setLogs.filter((s) => s.exercise_id === slot.exerciseId).length < slot.sets);
    if (!next) { ui.activeTab = "dashboard"; render(); return; }
    ui.expandedSlot = `${DB.todayWeekIndex}-${day.day}-${next.slot}`;
    render();
    setTimeout(() => document.getElementById(`exercise-${ui.expandedSlot}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    return;
  }
  else if (act === "openMeal") {
    const type = btn.dataset.type;
    let log = null;
    if (type === "snack" && btn.dataset.id) log = DB.mealLogs.find((l) => l.id === btn.dataset.id);
    else if (type !== "snack") log = DB.mealLogs.find((l) => l.meal_type === type);
    openMealSheet(type, log); return;
  }
  else if (act === "closeMeal") { closeMealSheet(); return; }
  else if (act === "saveMeal") { await saveMealSheet(); return; }
  else if (act === "deleteMeal") { await deleteMealSheetEntry(); return; }
  else if (act === "removePhoto") { ui.mealSheet.photoBlob = null; ui.mealSheet.photoPreviewUrl = null; ui.mealSheet.photoRemoved = true; }
  else if (act === "portion") { ui.mealSheet.portion = ui.mealSheet.portion === btn.dataset.v ? null : btn.dataset.v; }
  else if (act === "feeling") { ui.mealSheet.feeling = ui.mealSheet.feeling === btn.dataset.v ? null : btn.dataset.v; }
  else if (act === "habit") {
    const date = btn.dataset.date, habitId = btn.dataset.h;
    const newVal = !isHabitDone(date, habitId);
    await toggleHabitLog(AUTH.user.id, date, habitId, newVal);
    mergeHabitLogs([{ log_date: date, habit_id: habitId, done: newVal }]);
  }
  else if (act === "toggleSlot") { ui.expandedSlot = ui.expandedSlot === btn.dataset.key ? null : btn.dataset.key; }
  else if (act === "logSet") { await logSetFor(btn.dataset.key, btn.dataset.exercise, parseInt(btn.dataset.setnum, 10)); return; }
  else if (act === "openSwap") { ui.exerciseMenu = null; ui.swapPicker = { key: btn.dataset.key, muscle: btn.dataset.muscle, exerciseId: btn.dataset.exercise }; }
  else if (act === "closeSwap") { ui.swapPicker = null; }
  else if (act === "doSwap") {
    const { weekIndex, dayIndex, slot } = slotFromKey(ui.swapPicker.key);
    await saveOverride(weekIndex, dayIndex, slot, { exerciseId: btn.dataset.exercise });
    ui.swapPicker = null;
  }
  else if (act === "openAdjust") { ui.exerciseMenu = null; ui.adjustSlot = { key: btn.dataset.key }; }
  else if (act === "closeAdjust") { ui.adjustSlot = null; }
  else if (act === "saveAdjust") {
    const { weekIndex, dayIndex, slot } = slotFromKey(ui.adjustSlot.key);
    const sets = parseInt(document.getElementById("adjSets").value, 10) || slot.sets;
    const reps = document.getElementById("adjReps").value || slot.reps;
    const rest = document.getElementById("adjRest").value || slot.rest;
    await saveOverride(weekIndex, dayIndex, slot, { sets, reps, rest });
    ui.adjustSlot = null;
  }
  else if (act === "newGoalForm") { ui.newGoalOpen = !ui.newGoalOpen; }
  else if (act === "createGoal") { await submitNewGoal(); return; }
  else if (act === "logWeight") {
    const val = parseFloat(document.getElementById("weighInInput").value);
    if (!val) { showToast("Enter today's weight.", "is-error"); return; }
    await upsertWeightEntry(AUTH.user.id, todayStr(), val);
    DB.weightEntries = await getWeightEntries(AUTH.user.id);
    showToast("Weight logged.", "is-success");
  }
  else if (act === "importLegacy") { await importLegacyData(); return; }
  else if (act === "togglePush") { await togglePush(); return; }
  else if (act === "signOut") {
    const isGuest = Boolean(AUTH.user?.is_anonymous || !AUTH.user?.email);
    if (isGuest && !window.confirm("Sign out of this guest account? Its progress cannot be recovered.")) return;
    await signOut(); return;
  }
  else return;
  render();
});

document.addEventListener("change", async (e) => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  if (el.dataset.act === "mealPhoto") {
    const file = el.files[0]; if (!file) return;
    const blob = await compressImage(file);
    ui.mealSheet.photoBlob = blob;
    ui.mealSheet.photoPreviewUrl = URL.createObjectURL(blob);
    ui.mealSheet.photoRemoved = false;
    render();
  } else if (el.id === "strengthExercise") {
    ui.strengthExercise = el.value;
    renderStrengthChart();
  }
});
document.addEventListener("input", (e) => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  if (el.dataset.act === "mealNote") { ui.mealSheet.noteDraft = el.value; }
});
document.addEventListener("keydown", (e) => {
  const target = e.target.closest('[data-act="todayWorkout"][role="button"]');
  if (!target || (e.key !== "Enter" && e.key !== " ")) return;
  e.preventDefault();
  target.click();
});
document.addEventListener("blur", async (e) => {
  if (e.target && e.target.id === "weekNoteInput") {
    await upsertWeekNote(AUTH.user.id, DB.goal.id, parseInt(e.target.dataset.week, 10), e.target.value);
    DB.weekNotes[parseInt(e.target.dataset.week, 10)] = e.target.value;
  }
}, true);

// ---------- image compression ----------
function compressImage(file, maxDim, quality) {
  maxDim = maxDim || 1280; quality = quality || 0.82;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
      else if (height >= width && height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => { URL.revokeObjectURL(url); resolve(blob); }, "image/jpeg", quality);
    };
    img.onerror = reject;
    img.src = url;
  });
}
