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
  mealHistoryLogs: [],
  weekNotes: {}, habitLogs: {}, habitWeeksLoaded: new Set(),
  photoUrls: {}, pendingPhotoFetches: new Set(),
  lastSetCache: {}, pendingLastSetFetches: new Set(),
  todayWeekIndex: 0, todayDayIndex: 0,
  // Every meal, habit and set ever logged (light columns only), for XP, levels and badges.
  history: null, historyHabits: null,
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
if (!ui.mealHistoryMonth) ui.mealHistoryMonth = todayStr().slice(0, 7);
if (!ui.mealHistorySelectedDate) ui.mealHistorySelectedDate = todayStr();
if (ui.mealHistoryLoading == null) ui.mealHistoryLoading = false;
function saveUi() {
  const savedTab = ui.activeTab === "mealHistory" ? "dashboard" : ui.activeTab;
  try { localStorage.setItem(UI_KEY, JSON.stringify({ activeTab: savedTab, selectedWeek: ui.selectedWeek, selectedDay: ui.selectedDay, planSection: ui.planSection })); } catch (e) {}
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
  try {
    DB.history = await getActivityHistory(AUTH.user.id);
    DB.historyHabits = new Set(DB.history.habits.map((h) => `${h.log_date}|${h.habit_id}`));
  } catch (e) {
    // The game layer falls back to what's loaded; logging still works.
    console.error("History load failed", e);
    DB.history = null; DB.historyHabits = null;
  }
}

function renderNoGoal() {
  document.getElementById("app").innerHTML = `<div style="padding:40px 20px;text-align:center">
    <div style="font-size:15px;font-weight:800;color:var(--ink)">We couldn't find your quest.</div>
    <div style="font-size:13px;color:var(--grey);margin-top:6px;font-weight:700">Sign out and back in. Your history is kept.</div></div>`;
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

// ---------- the Spotter ----------
// Juno is the app. The Spotter is the buddy who speaks, and each person names their own.
function spotterName() {
  const name = AUTH.user && AUTH.user.user_metadata && AUTH.user.user_metadata.spotter_name;
  return name ? String(name).trim() : "";
}

// ---------- small render helpers ----------
function appLoadingState() {
  return `<div class="app-loading" role="status" aria-label="Loading today's quests">
    <div class="app-loading-mark">J</div><div class="loading-bar"><span></span></div><p>Loading today's quests…</p>
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
function weekSelector() {
  const many = DB.plan.weeks.length > 5;
  let h = `<div class="row week-picker ${many ? "is-scrollable" : ""}" role="group" aria-label="Choose a week">`;
  DB.plan.weeks.forEach((wk) => {
    const cur = ui.selectedWeek === wk.weekIndex;
    const base = wk.isPeak ? "var(--gold)" : "var(--green)", sd = wk.isPeak ? "var(--gold-d)" : "var(--green-d)";
    h += `<button class="pill" data-act="week" data-v="${wk.weekIndex}" aria-pressed="${cur}" aria-label="${wk.isPeak ? "Peak week, the final week" : `Week ${wk.weekIndex + 1}`}" style="${cur ? `background:${base};color:#fff;box-shadow:0 3px 0 ${sd}` : "background:#fff;color:var(--grey);border:2px solid var(--line)"}">${wk.isPeak ? "Peak" : "Wk " + (wk.weekIndex + 1)}</button>`;
  });
  return h + "</div>";
}
// Days show their real weekday and date, so all seven fit without scrolling.
function dayTabs(days) {
  let h = '<div class="day-picker" role="group" aria-label="Choose a day">';
  days.forEach((d, i) => {
    const cur = ui.selectedDay === i;
    const date = new Date(dateForWeekDay(DB.goal, ui.selectedWeek, i) + "T00:00:00");
    h += `<button class="pill" data-act="day" data-v="${i}" aria-pressed="${cur}" aria-label="${d.day}, ${date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}: ${d.focus}"
      style="${cur ? `background:${d.color};color:#fff` : "background:var(--soft);color:var(--grey);border:2px solid var(--line)"}"><span>${date.toLocaleDateString(undefined, { weekday: "short" })}</span><b>${date.getDate()}</b></button>`;
  });
  return h + "</div>";
}
function fmtDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// ---------- TAB: DASHBOARD (Home) ----------
function greetingFor(hour) {
  return hour >= 5 && hour < 12 ? "Morning" : hour >= 17 || hour < 5 ? "Evening" : "Hey";
}
function dashboard(game) {
  const today = todayStr();
  const first = escapeHtml((AUTH.profile.display_name || "there").split(" ")[0]);
  return `<div class="home-stack">
    ${screenHeading("TODAY'S QUESTS", `${greetingFor(new Date().getHours())}, ${first}`, goalLine(today))}
    ${nextQuestCard(today)}
    ${mealJournalCard(today)}
    ${dailyGoalsCard(today)}
    ${workoutPlanCard()}
    ${game ? weekCard(game) : ""}
  </div>`;
}

// The main quest in one line, under the greeting (it used to be its own card).
function goalLine(today) {
  const goal = DB.goal;
  const status = goal.target_date
    ? `${Math.max(0, daysUntil(goal.target_date))} days to go`
    : `Day ${Math.max(1, Math.floor((new Date(today) - new Date(goal.start_date + "T00:00:00")) / 86400000) + 1)}`;
  return `<span class="goal-line">🎯 <strong>${escapeHtml(goal.title)}</strong> · ${status}</span>`;
}

// One clear next step at the top of Today, so you never have to hunt for it.
const MEAL_ICONS = { breakfast: "🍳", lunch: "🍚", dinner: "🍽️" };
function nextQuest(today) {
  const logged = new Set(DB.mealLogs.filter((l) => l.meal_type !== "snack").map((l) => l.meal_type));
  const win = currentMealWindow();
  const workout = todayWorkoutProgress();
  const habitsLeft = habitDefs.filter((hb) => !isHabitDone(today, hb.id));
  const meal = (type) => ({ icon: MEAL_ICONS[type], title: `Snap your ${type}`, meta: `+${XP.meal} XP · photo optional`, cta: "Log it", act: `data-act="openMeal" data-type="${type}"` });
  if (win && !logged.has(win)) return meal(win);
  if (workout.total && !workout.complete) {
    const rest = workout.day.type === "rest";
    const left = workout.total - workout.done;
    return { icon: rest ? "🌿" : "🏋️", title: `${workout.done ? "Finish" : "Start"} ${escapeHtml(workout.day.focus)}`,
      meta: `${left} ${left === 1 ? "move" : "moves"} left · +${XP.workout} XP to clear`, cta: workout.done ? "Go" : "Start", act: 'data-act="todayWorkout"' };
  }
  if (habitsLeft.length) {
    const hb = habitsLeft[0];
    return { icon: hb.icon, title: hb.label, meta: `+${XP.habit} XP · ${habitsLeft.length} ${habitsLeft.length === 1 ? "habit" : "habits"} left`, cta: "Tick it",
      act: `data-act="habit" data-date="${today}" data-h="${hb.id}"` };
  }
  const mealLeft = ["breakfast", "lunch", "dinner"].find((t) => !logged.has(t));
  if (mealLeft) return meal(mealLeft);
  return { icon: "🎉", title: "Every quest cleared", meta: "That's a perfect day. Go enjoy your evening.", cta: null, act: null };
}
function nextQuestCard(today) {
  const q = nextQuest(today);
  const inner = `<span class="next-quest-icon">${q.icon}</span>
    <span class="next-quest-copy"><span class="next-quest-label">${q.act ? "UP NEXT" : "ALL CLEAR"}</span><strong>${q.title}</strong><small>${q.meta}</small></span>
    ${q.cta ? `<span class="next-quest-cta">${q.cta}</span>` : ""}`;
  return q.act ? `<button class="next-quest" ${q.act}>${inner}</button>` : `<div class="next-quest is-clear">${inner}</div>`;
}

// This week's boss and stars. Shared by Today and Progress.
function weekCard(game) {
  const w = game.thisWeek;
  const today = todayStr();
  const pips = Array.from({ length: w.bossNeed }, (_, i) => `<i class="${i < w.bossDone ? "is-hit" : ""}"></i>`).join("");
  const stars = w.dates.map((date) => {
    const d = game.days[date];
    const label = new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "narrow" });
    const state = d && d.good ? "is-good" : date > today ? "is-future" : "";
    return `<span class="week-star ${state} ${date === today ? "is-today" : ""}" aria-label="${fmtDate(date)}${d && d.good ? ", good day" : ""}"><b>${d && d.good ? "⭐" : ""}</b><small>${label}</small></span>`;
  }).join("");
  const left = Math.max(0, STAR_DAYS_PER_WEEK - w.goodDays);
  const starNote = w.star ? "This week's star is yours. ⭐" : `${left} more good ${left === 1 ? "day" : "days"} earns this week's star.`;
  return `<section class="card home-card week-card">
    <div class="home-section-heading"><div><div class="home-eyebrow">WEEKLY BOSS</div><div class="home-section-title">${w.bossNeed ? (w.bossBeaten ? "Boss defeated!" : `Clear ${w.bossNeed} workouts`) : "No boss this week"}</div></div>${w.bossNeed ? `<span class="home-count-badge">${w.bossDone}/${w.bossNeed}</span>` : ""}</div>
    ${w.bossNeed ? `<div class="boss-pips" aria-hidden="true">${pips}</div>` : ""}
    <div class="week-stars" role="group" aria-label="Good days this week">${stars}</div>
    <p class="week-note">${starNote} A good day is any day you start two of your three quests. Quiet days never take anything away.</p>
  </section>`;
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
    <div class="home-section-heading"><div><div class="home-eyebrow">QUEST 1 · MEALS</div><div class="home-section-title">Snap your meals</div></div><div class="meal-heading-actions"><button class="meal-history-link" data-act="openMealHistory">History</button><span class="home-count-badge">${loggedCount}/3</span></div></div>
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
      <div class="meal-ring-center"><small>${loggedCount === 3 ? "Meals clear!" : `+${XP.meal} XP each`}</small></div>
    </div>
    <div class="meal-chip-grid">`;

  meals.forEach(([type, icon, label]) => {
    const log = byType[type];
    const isNow = currentWindow === type;
    h += `<button class="meal-chip ${log ? "is-logged" : isNow ? "is-now" : ""}" data-act="openMeal" data-type="${type}">
      <span class="meal-chip-icon">${log && log.photo_path ? mealThumb(log, icon) : icon}</span>
      <span class="meal-chip-copy"><strong>${label}</strong><small>${log ? "✓ Logged" : isNow ? "Up next" : MEAL_WINDOWS[type].start}</small></span>
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

  h += `<button class="add-snack-button" data-act="openMeal" data-type="snack"><span>＋</span> Add a snack or drink</button>`;
  if (loggedCount === 3) h += `<div class="completion-note">🎉 All three meals logged. Quest 1 cleared!</div>`;
  h += "</section>";
  return h;
}
function mealThumb(log, fallbackIcon) {
  if (!log || !log.photo_path) return `<span class="meal-thumb meal-thumb-fallback">${fallbackIcon}</span>`;
  const url = photoUrlFor(log.photo_path);
  if (!url) return `<span class="meal-thumb"></span>`;
  return `<img src="${url}" class="meal-thumb" alt=""/>`;
}

// ---------- Meal history ----------
function mealMonthBounds(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const days = new Date(year, month, 0).getDate();
  return { start: `${monthKey}-01`, end: `${monthKey}-${String(days).padStart(2, "0")}`, year, month, days };
}
function shiftMealMonth(monthKey, amount) {
  const [year, month] = monthKey.split("-").map(Number);
  const d = new Date(year, month - 1 + amount, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
async function loadMealHistoryMonth(monthKey) {
  ui.activeTab = "mealHistory";
  ui.mealHistoryMonth = monthKey;
  ui.mealHistoryLoading = true;
  ui.mealHistoryError = "";
  render();
  try {
    const bounds = mealMonthBounds(monthKey);
    DB.mealHistoryLogs = await getMealLogsForRange(AUTH.user.id, bounds.start, bounds.end);
    const currentSelectionIsVisible = ui.mealHistorySelectedDate.startsWith(`${monthKey}-`);
    if (!currentSelectionIsVisible) {
      ui.mealHistorySelectedDate = DB.mealHistoryLogs.length ? DB.mealHistoryLogs[0].log_date : bounds.start;
    }
  } catch (e) {
    console.error("Meal history load failed", e);
    DB.mealHistoryLogs = [];
    ui.mealHistoryError = "We couldn't load this month's meals. Pull down or try again.";
  }
  ui.mealHistoryLoading = false;
  render();
}
function mealHistoryPhoto(log, fallbackIcon) {
  if (!log || !log.photo_path) return `<span class="history-photo-fallback">${fallbackIcon}</span>`;
  const url = photoUrlFor(log.photo_path);
  return url ? `<img src="${url}" alt=""/>` : `<span class="history-photo-fallback is-loading"></span>`;
}
function mealHistoryTab() {
  const bounds = mealMonthBounds(ui.mealHistoryMonth);
  const monthDate = new Date(bounds.year, bounds.month - 1, 1);
  const monthLabel = monthDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const firstWeekday = monthDate.getDay();
  const byDate = {};
  DB.mealHistoryLogs.forEach((log) => { (byDate[log.log_date] ||= []).push(log); });
  const selectedDate = ui.mealHistorySelectedDate;
  const selectedLogs = byDate[selectedDate] || [];
  const monthTotal = DB.mealHistoryLogs.length;
  const mealMeta = {
    breakfast: ["🍳", "Breakfast"], lunch: ["🍚", "Lunch"],
    dinner: ["🍽️", "Dinner"], snack: ["🍎", "Snack or drink"],
  };

  let calendar = '<div class="meal-calendar-weekdays">' + ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => `<span>${day}</span>`).join("") + '</div><div class="meal-calendar-grid">';
  for (let i = 0; i < firstWeekday; i++) calendar += '<span class="meal-calendar-spacer"></span>';
  for (let day = 1; day <= bounds.days; day++) {
    const date = `${ui.mealHistoryMonth}-${String(day).padStart(2, "0")}`;
    const logs = byDate[date] || [];
    const first = logs[0];
    const icon = first ? mealMeta[first.meal_type][0] : "";
    calendar += `<button class="meal-calendar-day ${logs.length ? "has-meals" : ""} ${selectedDate === date ? "is-selected" : ""}" data-act="selectMealHistoryDay" data-date="${date}" aria-label="${fmtDate(date)}${logs.length ? `, ${logs.length} meal${logs.length === 1 ? "" : "s"} logged` : ", no meals logged"}">
      <span class="meal-calendar-number">${day}</span>
      ${logs.length ? `<span class="meal-calendar-visual">${mealHistoryPhoto(first, icon)}${logs.length > 1 ? `<b>${logs.length}</b>` : ""}</span>` : '<span class="meal-calendar-dot"></span>'}
    </button>`;
  }
  calendar += "</div>";

  let details = `<section class="history-day-section"><div class="history-day-heading"><div><span>THIS DAY</span><h2>${fmtDate(selectedDate)}</h2></div><strong>${selectedLogs.length} ${selectedLogs.length === 1 ? "meal" : "meals"}</strong></div>`;
  if (!selectedLogs.length) {
    details += '<div class="history-empty"><div>🍽️</div><h3>Nothing logged this day</h3><p>Tap a day with a photo or a number to see what you ate.</p></div>';
  } else {
    details += '<div class="history-meal-list">';
    selectedLogs.forEach((log) => {
      const [icon, label] = mealMeta[log.meal_type] || ["🍴", "Meal"];
      const time = new Date(log.logged_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      const tags = [log.portion ? `${PORTION_LABELS[log.portion] || log.portion} portion` : "", feelingLabel(log.feeling)].filter(Boolean);
      details += `<article class="history-meal-row"><div class="history-meal-photo">${mealHistoryPhoto(log, icon)}</div><div class="history-meal-copy"><div><span>${label}</span><time>${time}</time></div><h3>${escapeHtml(log.note || "No note")}</h3>${tags.length ? `<p>${escapeHtml(tags.join(" · "))}</p>` : ""}</div></article>`;
    });
    details += "</div>";
  }
  details += "</section>";

  return `<div class="meal-history-screen">
    <header class="meal-history-header"><button data-act="closeMealHistory" aria-label="Back to Today">‹</button><div><span>MEAL HISTORY</span><h1>Your food journal</h1></div><i aria-hidden="true">◷</i></header>
    <section class="meal-history-summary"><div><strong>${monthTotal}</strong><span>meals logged this month</span></div><p>A photo album of what you ate. No calorie counting, no scores.</p></section>
    <section class="meal-calendar-card">
      <div class="meal-month-nav"><button data-act="changeMealHistoryMonth" data-v="-1" aria-label="Previous month">‹</button><h2>${monthLabel}</h2><button data-act="changeMealHistoryMonth" data-v="1" aria-label="Next month">›</button></div>
      ${ui.mealHistoryLoading ? '<div class="history-loading">Loading your meals…</div>' : ui.mealHistoryError ? `<div class="history-error">${escapeHtml(ui.mealHistoryError)}</div>` : calendar}
    </section>
    ${ui.mealHistoryLoading ? "" : details}
  </div>`;
}

function dailyGoalsCard(today) {
  const done = habitDefs.filter((hb) => isHabitDone(today, hb.id)).length;
  const total = habitDefs.length;
  const pct = Math.round((done / total) * 100);
  let h = `<section class="card home-card daily-goals-card ${done === total ? "all-complete" : ""}">
    <div class="home-section-heading"><div><div class="home-eyebrow">QUEST 2 · DAILY HABITS</div><div class="home-section-title">Tick off your habits</div></div><span class="home-count-badge is-orange">${done}/${total}</span></div>
    <div class="goal-progress"><span style="width:${pct}%"></span></div>
    <div class="daily-goal-list">`;
  habitDefs.forEach((hb) => {
    const on = isHabitDone(today, hb.id);
    h += `<button class="daily-goal ${on ? "is-done" : ""}" data-act="habit" data-date="${today}" data-h="${hb.id}" aria-pressed="${on}">
      <span class="daily-goal-icon">${hb.icon}</span><span class="daily-goal-label">${hb.label}</span><span class="daily-goal-xp">${on ? "" : `+${XP.habit}`}</span><span class="daily-goal-check">${on ? "✓" : ""}</span>
    </button>`;
  });
  h += `</div>${done === total ? '<div class="completion-note">✨ Every habit ticked. Quest 2 cleared!</div>' : ""}</section>`;
  return h;
}

function workoutPlanCard() {
  const workout = todayWorkoutProgress();
  const pct = workout.total ? Math.round((workout.done / workout.total) * 100) : 100;
  return `<section class="today-workout-card tap" data-act="todayWorkout" role="button" tabindex="0" aria-label="Open today's workout: ${escapeHtml(workout.day.focus)}" style="--workout-color:${workout.day.color}">
    <div class="workout-card-icon">${workout.day.type === "rest" ? "🌿" : "🏋️"}</div>
    <div class="workout-card-copy"><div class="workout-card-eyebrow">QUEST 3 · ${workout.day.type === "rest" ? "REST DAY" : "WORKOUT"}</div>
      <div class="workout-card-title">${escapeHtml(workout.day.focus)}</div>
      <div class="workout-card-meta">${!workout.total ? "Nothing planned. Enjoy the rest." : workout.complete ? `Cleared · +${XP.workout} XP` : workout.day.type === "rest" ? `${workout.done} of ${workout.total} rest moves · walk and stretch for XP` : `${workout.total} moves · ${workout.done} done · +${XP.workout} XP to clear`}</div>
      <div class="workout-card-progress"><span style="width:${pct}%"></span></div>
    </div>
    <div class="workout-card-arrow">›</div>
  </section>`;
}

// Stored values stay the same; only what people read changes.
const PORTION_LABELS = { light: "Small", normal: "Regular", heavy: "Big" };
// How a meal left you feeling. No food morality: never "guilty", "bad" or "cheat".
const FEELINGS = [["satisfied", "😋", "Satisfied"], ["energized", "⚡", "Energized"], ["hungry", "🍽️", "Still hungry"], ["heavy", "😑", "Heavy"]];
// Older entries used good / sluggish / guilty; show them in today's words.
const LEGACY_FEELINGS = { good: "energized", sluggish: "heavy", guilty: "heavy" };
function feelingLabel(value) {
  if (!value) return "";
  const key = LEGACY_FEELINGS[value] || value;
  const found = FEELINGS.find(([v]) => v === key);
  return found ? found[2] : value;
}

function escapeHtml(s) { return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// ---------- Meal log bottom sheet ----------
function mealSheetOverlay() {
  if (!ui.mealSheet) return "";
  const { type, log } = ui.mealSheet;
  const label = type === "snack" ? "a snack or drink" : type;
  const saveLabel = log ? "Save changes" : type === "snack" ? "Save snack" : "Save meal · +20 XP";
  const preview = ui.mealSheet.photoPreviewUrl || (log && log.photo_path ? photoUrlFor(log.photo_path) : null);
  const portion = ui.mealSheet.portion !== undefined ? ui.mealSheet.portion : (log ? log.portion : null);
  const rawFeeling = ui.mealSheet.feeling !== undefined ? ui.mealSheet.feeling : (log ? log.feeling : null);
  const feeling = LEGACY_FEELINGS[rawFeeling] || rawFeeling;
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
             <span style="font-size:28px">📷</span><span style="font-size:12px;font-weight:800;color:var(--grey)">Snap a photo (optional)</span>
             <input type="file" accept="image/*" capture="environment" data-act="mealPhoto" style="display:none"/></label>`}
      </div>

      <div style="font-size:12px;font-weight:800;color:var(--grey);margin-bottom:6px">What did you eat? (optional)</div>
      <textarea id="mealNoteInput" data-act="mealNote" placeholder="e.g. Chicken rice, half rice"style="width:100%;min-height:56px;background:var(--soft);border:2px solid var(--line);border-radius:14px;padding:10px;font-size:13px;resize:vertical;box-sizing:border-box;margin-bottom:14px">${escapeHtml(noteVal)}</textarea>

      <div style="font-size:12px;font-weight:800;color:var(--grey);margin-bottom:6px">Portion</div>
      <div class="row" style="gap:8px;margin-bottom:14px">
        ${["light", "normal", "heavy"].map((p) => `<button class="pill" data-act="portion" data-v="${p}" style="flex:1;padding:10px;font-size:12px;
          ${portion === p ? "background:var(--green);color:#fff" : "background:var(--soft);color:var(--grey);border:2px solid var(--line)"}">${PORTION_LABELS[p]}</button>`).join("")}
      </div>

      <div style="font-size:12px;font-weight:800;color:var(--grey);margin-bottom:6px">How do you feel after it?</div>
      <div class="row" style="gap:8px;margin-bottom:18px;flex-wrap:wrap">
        ${FEELINGS.map(([f, e, text]) => `<button class="pill" data-act="feeling" data-v="${f}" style="padding:9px 12px;font-size:12px;
          ${feeling === f ? "background:var(--purple);color:#fff" : "background:var(--soft);color:var(--grey);border:2px solid var(--line)"}">${e} ${text}</button>`).join("")}
      </div>

      <div class="row" style="gap:8px">
        ${log ? `<button class="btn3d" data-act="deleteMeal" style="padding:14px 16px;font-size:13px;background:var(--red);--sd:var(--red-d)">Delete</button>` : ""}
        <button class="btn3d" data-act="saveMeal" style="flex:1;padding:14px;font-size:14px;background:var(--green);--sd:var(--green-d)">${ui.mealSheet.saving ? "Saving…" : saveLabel}</button>
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
  let saveStage = "photo";
  s.saving = true; render();
  try {
    const today = todayStr();
    let photoPath = s.log ? s.log.photo_path : null;
    if (s.photoBlob) photoPath = await uploadMealPhoto(AUTH.user.id, today, s.type, s.photoBlob);
    else if (s.photoRemoved) photoPath = null;

    saveStage = "entry";
    const note = document.getElementById("mealNoteInput") ? document.getElementById("mealNoteInput").value : (s.noteDraft || "");
    await upsertMealLog(AUTH.user.id, {
      logId: s.log ? s.log.id : null, logDate: today, mealType: s.type, photoPath,
      note: note || null,
      portion: s.portion !== undefined ? s.portion : (s.log ? s.log.portion : null),
      feeling: s.feeling !== undefined ? s.feeling : (s.log ? s.log.feeling : null),
    });
    saveStage = "refresh";
    DB.mealLogs = await getMealLogsForDate(AUTH.user.id, today);
    ui.mealSheet = null;
  } catch (e) {
    console.error(`Meal ${saveStage} failed`, e);
    const code = e && (e.code || e.statusCode || e.status);
    const action = saveStage === "photo" ? "upload the photo" : saveStage === "refresh" ? "refresh your meals" : "save the entry";
    showToast(`We couldn't ${action}.${code ? ` Error ${code}.` : ""} Tap save to try again.`, "is-error");
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
    ${screenHeading("TRAIN", isToday ? "Today's workout" : "Workout schedule", isToday ? "Beat your last numbers, one set at a time. Every set is +5 XP." : "Peek at any day. Logging stays on today.")}
    <button class="schedule-toggle" data-act="toggleWorkoutBrowse"><span>📅 ${fmtDate(date)}</span><strong>${ui.workoutBrowse ? "Hide other days" : "See other days"}</strong></button>
    ${ui.workoutBrowse ? `<div class="schedule-browser">${weekSelector()}${dayTabs(week.days)}</div>` : ""}
    <section class="workout-hero" style="--day-color:${day.color}">
      <div class="workout-hero-top"><span>${week.isPeak ? "PEAK WEEK" : "WEEK " + (week.weekIndex + 1)} · ${day.day}</span><span>${isToday ? "TODAY" : isFuture(week, day) ? "UPCOMING" : "PAST"}</span></div>
      <h2>${escapeHtml(day.focus)}</h2>
      <p>${totalSlots ? `${totalSlots} moves · ${doneSlots} done` : "Rest is part of the game."}</p>
      <div class="workout-hero-progress"><span style="width:${pct}%"></span></div>
      ${day.note ? `<div class="workout-note">${escapeHtml(day.note)}</div>` : ""}
    </section>`;

  day.ex.forEach((slot) => h += exerciseCard(week, day, slot, isToday));
  if (!day.ex.length) h += `<div class="empty-state"><div>🌿</div><h3>Rest day</h3><p>Nothing to log. Walk, stretch and recharge. Muscle grows on days like this.</p></div>`;

  if (isToday && totalSlots) {
    const actionLabel = doneSlots >= totalSlots ? "Workout cleared!" : doneSlots ? `Keep going · ${doneSlots}/${totalSlots}` : "Start workout";
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
  const timed = isTimedMove(slot);

  let h = `<section class="exercise-card ${allDone ? "is-complete" : ""}" id="exercise-${key}">
    <div class="exercise-card-header">
      <button class="exercise-expand" data-act="toggleSlot" data-key="${key}" aria-expanded="${expanded}">
        <span class="exercise-status">${allDone ? "✓" : slot.slot + 1}</span>
        <span class="exercise-title"><strong>${escapeHtml(exercise.name)}</strong><small>${slot.sets} ${slot.sets === 1 ? "set" : "sets"} · ${timed ? slot.reps : slot.reps + " reps"}${slot.rest !== "-" ? " · " + slot.rest + " rest" : ""}</small></span>
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
      const goalCell = (text) => `<span class="set-goal">${text}</span>`;
      const setText = (row) => (row.weight_kg ? `${row.weight_kg}×${row.reps || 0}` : row.reps ? `${row.reps} reps` : "Done");
      h += `<div class="set-table${timed ? " is-timed" : ""}"><div class="set-row set-head"><span>SET</span><span>LAST TIME</span>${timed ? "<span>GOAL</span>" : "<span>KG</span><span>REPS</span>"}<span></span></div>`;
      for (let i = 1; i <= slot.sets; i++) {
        const current = loggedSets.find((s) => s.set_number === i) || loggedSets[i - 1];
        const previous = last && (last.find((s) => s.set_number === i) || last[i - 1]);
        const isNext = !current && i === loggedSets.length + 1;
        const logButton = `<button class="set-log-button" data-act="logSet" data-key="${key}" data-exercise="${slot.exerciseId}" data-setnum="${i}" data-timed="${timed ? 1 : 0}" aria-label="Complete set ${i}">✓</button>`;
        let cells;
        if (timed) {
          cells = current ? `${goalCell("Done")}<span class="set-check">✓</span>`
            : isNext ? `${goalCell(escapeHtml(String(slot.reps)))}${logButton}`
            : `${goalCell(escapeHtml(String(slot.reps)))}<span class="set-pending"></span>`;
        } else {
          cells = current ? `<strong>${current.weight_kg || "—"}</strong><strong>${current.reps || 0}</strong><span class="set-check">✓</span>`
            : isNext ? `<input type="number" inputmode="decimal" step="0.5" placeholder="kg" id="setWeight-${key}" aria-label="Weight in kilograms for set ${i}. Leave empty for bodyweight."/><input type="number" inputmode="numeric" placeholder="${String(slot.reps).replace(/[^0-9].*$/, "") || "reps"}" id="setReps-${key}" aria-label="Repetitions for set ${i}"/>${logButton}`
            : `<span>—</span><span>—</span><span class="set-pending"></span>`;
        }
        h += `<div class="set-row ${current ? "is-complete" : isNext ? "is-next" : ""}">
          <span class="set-number">${i}</span>
          <span class="set-previous">${previous ? setText(previous) : "—"}</span>
          ${cells}
        </div>`;
      }
      h += `</div>`;
    } else {
      h += `<div class="locked-note">This one unlocks on its day. You can still swap it or change the sets now.</div>`;
    }
    h += `</div>`;
  }
  h += "</section>";
  return h;
}

async function logSetFor(key, exerciseId, setNumber, timed) {
  let weight = null, reps = null;
  if (!timed) {
    const wEl = document.getElementById(`setWeight-${key}`), rEl = document.getElementById(`setReps-${key}`);
    weight = parseFloat(wEl.value) || null;
    // An empty reps box shows the plan's reps as its hint, and people read that as filled in,
    // so tapping ✓ on an empty box logs the planned reps.
    reps = parseInt(rEl.value, 10) || parseInt(rEl.placeholder, 10);
    if (!reps) { showToast("Add your reps first. Leave the weight empty for bodyweight moves.", "is-error"); return; }
  }
  const best = weight ? bestWeightFor(exerciseId) : 0;
  try {
    await logSet(AUTH.user.id, { logDate: todayStr(), exerciseId, setNumber, weightKg: weight, reps });
    DB.setLogs = await getSetLogsForDate(AUTH.user.id, todayStr());
  } catch (e) {
    console.error("Set save failed", e);
    showToast("That set didn't save. Tap ✓ to try again.", "is-error");
    return;
  }
  render();
  if (weight && best > 0 && weight > best) {
    const name = (EXERCISES[exerciseId] || {}).name || "this move";
    celebrate("New high score!", `${name}: ${weight} kg. Your best was ${best} kg.`);
  }
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
        : `<div style="font-size:13px;color:var(--grey);font-weight:700">No other moves for this muscle yet.</div>`}
    </div></div>`;
}

function adjustFormOverlay() {
  if (!ui.adjustSlot) return "";
  const { key } = ui.adjustSlot;
  const { slot } = slotFromKey(key);
  return `<div class="sheet-backdrop">
    <div class="bottom-sheet">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="font-size:17px;font-weight:900;color:var(--ink)">Adjust sets and reps</div>
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
      <button class="btn3d" data-act="saveAdjust" style="width:100%;padding:13px;font-size:14px;background:var(--green);--sd:var(--green-d)">Save changes</button>
    </div></div>`;
}

// ---------- TAB: PLAN ----------
function planTab() {
  return `<div class="screen-stack plan-screen">
    ${screenHeading("PLAN", "Your playbook", "Meal ideas and power-ups for your quest.")}
    <div class="segmented-control" role="tablist" aria-label="Plan sections">
      <button class="${ui.planSection === "meals" ? "is-active" : ""}" data-act="planSection" data-v="meals" role="tab">Meal ideas</button>
      <button class="${ui.planSection === "guide" ? "is-active" : ""}" data-act="planSection" data-v="guide" role="tab">Power-ups</button>
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
      <div><span>IDEAS FOR THIS DAY</span><h2>${escapeHtml(plan.label)}</h2><p>Ideas, not rules. Log what you really eat on Today.</p></div>
      <div class="macro-summary"><strong>~${total}<small>kcal</small></strong><span>P ${plan.protein}</span><span>C ${plan.carbs}</span><span>F ${plan.fat}</span></div>
    </section>`;
    plan.meals.forEach((meal) => {
      h += `<article class="meal-plan-card"><div class="meal-plan-time">${meal.time}</div><div class="meal-plan-copy">
        <div><h3>${escapeHtml(meal.name)}</h3><span>${meal.cals} kcal</span></div><p>${escapeHtml(meal.desc)}</p>
        <small>P ${meal.p}g · C ${meal.c}g · F ${meal.f}g</small></div></article>`;
    });
  }
  h += `<div class="info-callout">💡 This is a menu of ideas. You log your real meals on <strong>Today</strong>.</div>`;
  return h + "</div>";
}

// ---------- TAB: PROGRESS ----------
function progressTab(game) {
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
    ${screenHeading("PROGRESS", "Your wins add up", "Every tick, set and weigh-in lands here.")}
    ${game ? weekCard(game) : ""}
    <div class="progress-summary-grid">
      <article><span>Weight now</span><strong>${latestWeight != null ? `${latestWeight} kg` : "—"}</strong><small>${DB.goal.goal_weight != null ? `Goal ${DB.goal.goal_weight} kg` : latestWeight != null ? "No goal weight set" : "Log one below, if you like"}</small></article>
      <article><span>Weekly habits</span><strong>${habitTotal}</strong><small>${habitTotal === 1 ? "tick" : "ticks"} this week</small></article>
    </div>
    <section class="progress-card">
      <div class="card-heading"><div><span>WEEKLY HABITS</span><h2>Your habit board</h2></div><strong>${habitPct}%</strong></div>
      ${weekSelector()}
      <div class="progress-days">`;
  DAYS.forEach((name, index) => {
    const count = habitDefs.filter((hb) => isHabitDone(dates[index], hb.id)).length;
    // Weeks start on the quest's start day, so label each button with its real weekday.
    const weekday = new Date(dates[index] + "T00:00:00").toLocaleDateString(undefined, { weekday: "narrow" });
    h += `<button class="${selectedDay === index ? "is-active" : ""} ${count === habitDefs.length ? "is-complete" : ""}" data-act="progressDay" data-v="${index}" aria-label="${fmtDate(dates[index])}: ${count} of ${habitDefs.length} habits"><span>${weekday}</span><strong>${count}</strong></button>`;
  });
  h += `</div><div class="habit-editor"><div class="habit-editor-title"><strong>${fmtDate(selectedDate)}</strong><span>Tap to tick</span></div>`;
  habitDefs.forEach((hb) => {
    const on = isHabitDone(selectedDate, hb.id);
    h += `<button class="habit-row ${on ? "is-done" : ""}" data-act="habit" data-date="${selectedDate}" data-h="${hb.id}"><span>${hb.icon}</span><strong>${hb.label}</strong><i>${on ? "✓" : ""}</i></button>`;
  });
  const note = DB.weekNotes[week.weekIndex] || "";
  h += `</div><label class="field-label" for="weekNoteInput">Week notes</label><textarea id="weekNoteInput" data-week="${week.weekIndex}" placeholder="How did this week feel? Energy, sleep, cycle, mood…">${escapeHtml(note)}</textarea></section>
    <section class="progress-card"><div class="card-heading"><div><span>WEIGHT TREND</span><h2>Your trend line</h2></div></div>
      <div class="quick-log"><input id="weighInInput" type="number" inputmode="decimal" step="0.1" placeholder="Today's weight (kg)" aria-label="Today's weight in kilograms"/><button class="btn3d" data-act="logWeight" style="--sd:var(--green-d)">Log</button></div>
      <div class="chart-wrap"><canvas id="weightChart"></canvas></div></section>
    <section class="progress-card"><div class="card-heading"><div><span>STRENGTH TREND</span><h2>Your heaviest set</h2></div></div>
      <select id="strengthExercise">${Object.values(EXERCISES).filter((e) => e.muscle && e.muscle !== "recovery" && e.muscle !== "cardio").map((e) => `<option value="${e.id}" ${ui.strengthExercise === e.id ? "selected" : ""}>${e.name}</option>`).join("")}</select>
      <div class="chart-wrap"><canvas id="strengthChart"></canvas></div></section>
  </div>`;
  return h;
}

// ---------- TAB: GUIDE ----------
function guideTab() {
  let h = '<div class="subscreen-stack">';
  h += `<div class="guide-intro"><div>📖</div><h2>Power-ups for real life</h2><p>Short rules that protect your muscle and still fit a busy week.</p></div>`;
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

function profileTab(game) {
  const goal = DB.goal;
  const name = AUTH.profile.display_name || "Player 1";
  const isGuest = Boolean(AUTH.user.is_anonymous || !AUTH.user.email);
  const accountLabel = isGuest ? "Guest player · saved in this browser" : AUTH.user.email;
  const initial = name.trim().charAt(0).toUpperCase() || "J";
  const currentWeight = DB.weightEntries.length ? Number(DB.weightEntries[DB.weightEntries.length - 1].weight_kg) : Number(goal.start_weight);
  const hasWeightGoal = goal.start_weight != null && goal.goal_weight != null;
  const weightDistance = hasWeightGoal ? Math.abs(Number(goal.start_weight) - Number(goal.goal_weight)) : 0;
  const goalProgress = weightDistance ? Math.max(0, Math.min(100, Math.round((Math.abs(Number(goal.start_weight) - currentWeight) / weightDistance) * 100))) : 100;
  return `<div class="screen-stack profile-screen">
    ${screenHeading("ME", "Your player card", "Your quest, reminders, account and settings.")}
    <section class="profile-identity"><div class="profile-avatar">${escapeHtml(initial)}</div><div><h2>${escapeHtml(name)}</h2><p>${escapeHtml(accountLabel)}</p></div></section>
    ${game ? playerLevelCard(game) + badgeCard(game) : ""}
    <section class="goal-detail-card">
      <div class="card-heading"><div><span>MAIN QUEST</span><h2>${escapeHtml(goal.title)}</h2></div>${goal.goal_weight != null ? `<div class="goal-target">${goal.goal_weight} kg</div>` : ""}</div>
      ${hasWeightGoal ? `<div class="goal-route"><span>${goal.start_weight} kg</span><i><b style="width:${goalProgress}%"></b></i><span>${goal.goal_weight} kg</span></div>` : ""}
      <p>${goal.target_date ? `${Math.max(0, daysUntil(goal.target_date))} days left · ends ${fmtDate(goal.target_date)}` : "No end date · open-ended quest"}</p>
      <button class="secondary-button" data-act="newGoalForm">${ui.newGoalOpen ? "Close" : "Start a new quest"}</button>
      ${ui.newGoalOpen ? newGoalForm() : ""}
    </section>
    <section class="settings-card"><div class="card-heading"><div><span>PREFERENCES</span><h2>App settings</h2></div></div>
      <button class="settings-row" data-act="togglePush"><span class="settings-icon">🔔</span><span><strong>Meal reminders</strong><small>A gentle ping at breakfast, lunch and dinner</small></span><i>${ui.pushEnabled ? "On" : "Off"}</i></button>
      <button class="settings-row" data-act="editSpotter" aria-expanded="${!!ui.spotterEdit}"><span class="settings-icon">🌱</span><span><strong>Your Spotter</strong><small>${spotterName() ? `${escapeHtml(spotterName())} · tap to rename` : "Give your buddy a name"}</small></span><i>›</i></button>
      ${ui.spotterEdit ? `<div class="inline-form spotter-form"><label class="field-label" for="spotterInput">Spotter's name</label><input id="spotterInput" maxlength="20" autocomplete="off" placeholder="e.g. Mo, Bean, Captain" value="${escapeHtml(spotterName())}"/><button class="btn3d primary-button" data-act="saveSpotter" style="--sd:var(--green-d)">Save name</button></div>` : ""}
      <button class="settings-row danger" data-act="signOut"><span class="settings-icon">↗</span><span><strong>Sign out</strong><small>${isGuest ? "Guest progress can't be recovered after you sign out" : "Sign out on this device. Your history is kept."}</small></span><i>›</i></button>
    </section>
    <details class="advanced-card"><summary><span><strong>Advanced</strong><small>Import old data</small></span><i>＋</i></summary>
      <div><p>Bring in weigh-ins and habits saved by the older Fitness Tracker app on this device.</p><button class="secondary-button" data-act="importLegacy">Import old backup</button></div>
    </details>
    <p class="medical-note">Juno gives general fitness guidance, not medical or dietary advice.</p>
  </div>`;
}

function playerLevelCard(game) {
  const pct = Math.round((game.into / game.need) * 100);
  return `<section class="player-level-card">
    <div class="card-heading"><div><span>PLAYER LEVEL</span><h2>Level ${game.level}</h2></div><strong>${game.lifetimeXp.toLocaleString()} XP</strong></div>
    <div class="level-bar" role="img" aria-label="${game.into} of ${game.need} XP to level ${game.level + 1}"><span style="width:${pct}%"></span></div>
    <p>${(game.need - game.into).toLocaleString()} XP to level ${game.level + 1} · ${game.starsCollected} weekly ${game.starsCollected === 1 ? "star" : "stars"} collected</p>
  </section>`;
}
function badgeCard(game) {
  const earned = game.badges.filter((b) => b.earned).length;
  return `<section class="badge-card">
    <div class="card-heading"><div><span>BADGES</span><h2>Your collection</h2></div><strong>${earned}/${game.badges.length}</strong></div>
    <div class="badge-grid">${game.badges.map((b) => `<div class="badge ${b.earned ? "is-earned" : ""}" aria-label="${escapeHtml(b.title)}: ${b.earned ? "unlocked" : "locked. " + escapeHtml(b.hint)}">
      <span class="badge-icon">${b.icon}</span><strong>${escapeHtml(b.title)}</strong><small>${b.earned ? "Unlocked" : escapeHtml(b.hint)}</small></div>`).join("")}</div>
  </section>`;
}

function newGoalForm() {
  return `<div class="inline-form">
    <label class="field-label" for="ngTitle">Quest name</label><input id="ngTitle" placeholder="e.g. 8-week strength block"/>
    <div class="two-column-fields">
      <div><label class="field-label" for="ngCurrent">Weight now (kg, optional)</label><input id="ngCurrent" type="number" inputmode="decimal" step="0.1" placeholder="60"/></div>
      <div><label class="field-label" for="ngGoal">Goal weight (kg, optional)</label><input id="ngGoal" type="number" inputmode="decimal" step="0.1" placeholder="56.5"/></div>
    </div>
    <label class="field-label" for="ngDate">Finish date (optional)</label><input id="ngDate" type="date"/>
    <button class="btn3d primary-button" data-act="createGoal" style="--sd:var(--green-d)">Build my quest</button>
  </div>`;
}

async function submitNewGoal() {
  const title = document.getElementById("ngTitle").value.trim();
  const current = parseFloat(document.getElementById("ngCurrent").value) || null;
  const goalW = parseFloat(document.getElementById("ngGoal").value) || null;
  const date = document.getElementById("ngDate").value || null;
  if (!title) { showToast("Give your quest a name first.", "is-error"); return; }
  const today = todayStr();
  const templateId = date ? "lean-peak" : "consistency";
  const durationWeeks = date ? Math.max(1, Math.ceil((new Date(date) - new Date(today)) / (7 * 86400000))) : 5;
  await createGoal(AUTH.user.id, {
    title, target_date: date, start_weight: current, goal_weight: goalW,
    template_id: templateId, duration_weeks: durationWeeks, start_date: today, is_active: true,
  });
  if (current) await upsertWeightEntry(AUTH.user.id, today, current);
  ui.newGoalOpen = false; ui.selectedWeek = 0; ui.selectedDay = 0;
  await loadAll(); showToast("New quest unlocked. Your plan is ready.", "is-success"); render();
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
      }].concat(DB.goal.goal_weight != null ? [{
        label: `Goal (${DB.goal.goal_weight} kg)`, data: entries.map(() => DB.goal.goal_weight),
        borderColor: "#FFC800", borderDash: [6, 6], borderWidth: 2, pointRadius: 0, pointHitRadius: 0, fill: false, tension: 0,
      }] : []),
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
    canvas.parentElement.insertAdjacentHTML("beforeend", '<div id="strengthEmpty" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--grey);font-weight:700">No sets for this move yet. Your first one starts the line.</div>');
  }
}

async function importLegacyData() {
  let raw;
  try { raw = JSON.parse(localStorage.getItem("fitnessTracker_app_v1")); } catch (e) {}
  if (!raw) { showToast("No old backup on this device."); return; }
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
  showToast(`Imported ${imported} old entries.`, "is-success");
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
      showToast("Reminders didn't turn on. On iPhone, add Juno to your Home Screen first.", "is-error");
      return;
    }
  }
  showToast(ui.pushEnabled ? "Meal reminders on." : "Meal reminders off.", "is-success");
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
  if (!tabs.some((t) => t[0] === ui.activeTab) && ui.activeTab !== "mealHistory") ui.activeTab = "dashboard";
  let nav = '<nav class="bottom-nav" aria-label="Primary navigation">';
  tabs.forEach((t) => {
    const a = ui.activeTab === t[0] || (ui.activeTab === "mealHistory" && t[0] === "dashboard");
    nav += `<button data-act="tab" data-v="${t[0]}" class="${a ? "is-active" : ""}" aria-current="${a ? "page" : "false"}">${navIcon(t[0])}<span>${t[1]}</span></button>`;
  });
  nav += "</nav>";

  const game = gameState();
  let body = "";
  if (ui.activeTab === "dashboard") body = dashboard(game);
  else if (ui.activeTab === "mealHistory") body = mealHistoryTab();
  else if (ui.activeTab === "workout") body = workoutTab();
  else if (ui.activeTab === "plan") body = planTab();
  else if (ui.activeTab === "progress") body = progressTab(game);
  else if (ui.activeTab === "profile") body = profileTab(game);

  document.getElementById("app").innerHTML = `
    <div class="app-shell">
      <header class="app-topbar"><div><span class="app-wordmark" aria-label="Juno">J</span><span class="app-date">${new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</span></div>${game ? `<button class="level-chip" data-act="tab" data-v="profile" aria-label="Level ${game.level}. Open your player card"><b>LV</b>${game.level}</button>` : ""}</header>
      <main class="app-main">${body}</main>
      ${nav}
    </div>
    ${mealSheetOverlay()}${swapPickerOverlay()}${adjustFormOverlay()}`;

  saveUi();
  checkUnlocks(game);
  if (ui.activeTab === "progress") { renderWeightChart(); renderStrengthChart(); }
  else { if (weightChartInstance) { weightChartInstance.destroy(); weightChartInstance = null; } if (strengthChartInstance) { strengthChartInstance.destroy(); strengthChartInstance = null; } }
}

// ---------- level-ups, badges, stars and bosses ----------
// A pixel banner with confetti (pixel.js). The toast is only a fallback if pixel.js didn't load.
function celebrate(title, sub) {
  if (window.PixelMode && window.PixelMode.celebrate) window.PixelMode.celebrate(title, sub);
  else showToast(sub ? `${title} ${sub}` : title, "is-success");
}
// What this browser has already celebrated, so each moment shows once.
// Only ever added to: un-ticking a habit never takes a badge back or replays a banner.
function checkUnlocks(game) {
  if (!game || !DB.history) return;
  const key = `juno_seen_v1_${AUTH.user.id}`;
  let seen = null;
  try { seen = JSON.parse(localStorage.getItem(key)); } catch (e) {}
  const now = {
    level: game.level,
    badges: game.badges.filter((b) => b.earned).map((b) => b.id),
    stars: game.weeks.filter((w) => w.star).map((w) => w.weekIndex),
    bosses: game.weeks.filter((w) => w.bossBeaten).map((w) => w.weekIndex),
  };
  if (seen) {
    const fresh = (list, old) => list.filter((x) => !(old || []).includes(x));
    if (now.level > seen.level) celebrate(`Level ${now.level}!`, `${game.lifetimeXp.toLocaleString()} XP and counting.`);
    fresh(now.bosses, seen.bosses).forEach(() => celebrate("Boss defeated!", "You cleared this week's workouts."));
    fresh(now.stars, seen.stars).forEach(() => celebrate("Weekly star!", "Three good days this week."));
    fresh(now.badges, seen.badges).forEach((id) => { const b = BADGES.find((x) => x.id === id); celebrate("Badge unlocked!", b.title); });
  }
  const union = (a, b) => Array.from(new Set([...(a || []), ...(b || [])]));
  const merged = seen
    ? { level: Math.max(seen.level || 1, now.level), badges: union(seen.badges, now.badges), stars: union(seen.stars, now.stars), bosses: union(seen.bosses, now.bosses) }
    : now;
  try { localStorage.setItem(key, JSON.stringify(merged)); } catch (e) {}
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
  else if (act === "openMealHistory") { await loadMealHistoryMonth(todayStr().slice(0, 7)); return; }
  else if (act === "closeMealHistory") { ui.activeTab = "dashboard"; render(); return; }
  else if (act === "changeMealHistoryMonth") {
    await loadMealHistoryMonth(shiftMealMonth(ui.mealHistoryMonth, parseInt(btn.dataset.v, 10)));
    return;
  }
  else if (act === "selectMealHistoryDay") { ui.mealHistorySelectedDate = btn.dataset.date; }
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
    if (DB.historyHabits) DB.historyHabits[newVal ? "add" : "delete"](`${date}|${habitId}`);
  }
  else if (act === "toggleSlot") { ui.expandedSlot = ui.expandedSlot === btn.dataset.key ? null : btn.dataset.key; }
  else if (act === "logSet") { await logSetFor(btn.dataset.key, btn.dataset.exercise, parseInt(btn.dataset.setnum, 10), btn.dataset.timed === "1"); return; }
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
  else if (act === "editSpotter") { ui.spotterEdit = !ui.spotterEdit; }
  else if (act === "saveSpotter") {
    const name = document.getElementById("spotterInput").value.trim();
    if (!name) { showToast("Give your Spotter a name first.", "is-error"); return; }
    try { AUTH.user = await saveSpotterName(name); }
    catch (e) { console.error("Spotter name didn't save", e); showToast("That name didn't save. Try again.", "is-error"); return; }
    ui.spotterEdit = false;
    showToast(`${name} is ready to spot you.`, "is-success");
  }
  else if (act === "newGoalForm") { ui.newGoalOpen = !ui.newGoalOpen; }
  else if (act === "createGoal") { await submitNewGoal(); return; }
  else if (act === "logWeight") {
    const val = parseFloat(document.getElementById("weighInInput").value);
    if (!val) { showToast("Add today's weight first.", "is-error"); return; }
    await upsertWeightEntry(AUTH.user.id, todayStr(), val);
    DB.weightEntries = await getWeightEntries(AUTH.user.id);
    showToast("Weigh-in saved. Your trend line just grew.", "is-success");
  }
  else if (act === "importLegacy") { await importLegacyData(); return; }
  else if (act === "togglePush") { await togglePush(); return; }
  else if (act === "signOut") {
    const isGuest = Boolean(AUTH.user?.is_anonymous || !AUTH.user?.email);
    if (isGuest && !window.confirm("Sign out of this guest account? Its progress can't be recovered.")) return;
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
