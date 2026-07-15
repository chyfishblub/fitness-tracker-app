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
  return { activeTab: "dashboard", selectedWeek: 0, selectedDay: 0, expandedSlot: null, mealSheet: null, adjustSlot: null, swapPicker: null };
}
const ui = loadUi();
function saveUi() {
  try { localStorage.setItem(UI_KEY, JSON.stringify({ activeTab: ui.activeTab, selectedWeek: ui.selectedWeek, selectedDay: ui.selectedDay })); } catch (e) {}
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
  const goal = DB.goal;
  let h = '<div style="display:flex;flex-direction:column;gap:16px">';

  if (goal.target_date) {
    const days = daysUntil(goal.target_date);
    h += `<div style="background:var(--blue);border-radius:20px;padding:22px;text-align:center;box-shadow:0 4px 0 var(--blue-d)">
      <div style="font-size:12px;color:#fff;font-weight:800;letter-spacing:1px;opacity:0.9">🎯 ${escapeHtml(goal.title).toUpperCase()}</div>
      <div style="font-size:56px;font-weight:900;color:#fff;line-height:1;margin-top:6px">${days}</div>
      <div style="font-size:14px;color:#fff;opacity:0.9;font-weight:800">days to go</div></div>`;
  } else {
    const daySince = Math.floor((new Date(today) - new Date(goal.start_date + "T00:00:00")) / 86400000) + 1;
    h += `<div style="background:var(--blue);border-radius:20px;padding:22px;text-align:center;box-shadow:0 4px 0 var(--blue-d)">
      <div style="font-size:12px;color:#fff;font-weight:800;letter-spacing:1px;opacity:0.9">🎯 ${escapeHtml(goal.title).toUpperCase()}</div>
      <div style="font-size:56px;font-weight:900;color:#fff;line-height:1;margin-top:6px">Day ${Math.max(1, daySince)}</div>
      <div style="font-size:14px;color:#fff;opacity:0.9;font-weight:800">of staying consistent</div></div>`;
  }

  h += mealJournalCard(today);
  h += todayGlanceCard(today);

  return h + "</div>";
}

function mealJournalCard(today) {
  const currentWindow = currentMealWindow();
  const byType = {};
  const snacks = [];
  DB.mealLogs.forEach((l) => { if (l.meal_type === "snack") snacks.push(l); else byType[l.meal_type] = l; });

  let h = `<div class="card">${sectionTitle("Today's Food Journal")}
    <div style="font-size:12px;color:var(--grey);margin-bottom:12px;font-weight:700">Snap or upload what you actually ate — no calorie counting required.</div>`;

  [["breakfast", "🍳", "Breakfast"], ["lunch", "🍚", "Lunch"], ["dinner", "🍽️", "Dinner"]].forEach(([type, icon, label]) => {
    const log = byType[type];
    const isNow = currentWindow === type;
    const win = MEAL_WINDOWS[type];
    h += `<div class="tap" data-act="openMeal" data-type="${type}" style="display:flex;align-items:center;gap:12px;padding:12px;margin-bottom:8px;
      background:${log ? "#F0FBE6" : isNow ? "#FFF9E8" : "#fff"};border:2px solid ${log ? "var(--green)" : isNow ? "var(--gold)" : "var(--line)"};border-radius:16px">
      ${mealThumb(log, icon)}
      <div style="flex:1;min-width:0">
        <div class="row" style="align-items:center;gap:6px">
          <span style="font-size:14px;font-weight:900;color:var(--ink)">${label}</span>
          ${isNow && !log ? '<span style="font-size:10px;background:var(--gold);color:#fff;padding:2px 7px;border-radius:8px;font-weight:800">NOW</span>' : ""}
          ${log ? '<span style="font-size:10px;color:var(--green-d);font-weight:800">✓ Logged</span>' : ""}
        </div>
        <div style="font-size:11px;color:var(--grey);font-weight:700">${log ? (log.note ? escapeHtml(log.note) : "Tap to view/edit") : `Window: ${win.start}–${win.end}`}</div>
      </div>
      <div style="font-size:18px;color:var(--grey)">›</div>
    </div>`;
  });

  if (snacks.length) {
    h += `<div style="font-size:11px;font-weight:800;color:var(--grey);margin:10px 0 6px;letter-spacing:0.5px">SNACKS & DRINKS</div>`;
    snacks.forEach((s) => {
      h += `<div class="tap" data-act="openMeal" data-type="snack" data-id="${s.id}" style="display:flex;align-items:center;gap:12px;padding:10px 12px;margin-bottom:8px;background:#F5F0FF;border:2px solid var(--purple);border-radius:16px">
        ${mealThumb(s, "🥤")}
        <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:800;color:var(--ink)">${s.note ? escapeHtml(s.note) : "Snack"}</div>
        <div style="font-size:10px;color:var(--grey);font-weight:700">${new Date(s.logged_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</div></div>
      </div>`;
    });
  }

  h += `<button class="btn3d" data-act="openMeal" data-type="snack" style="width:100%;padding:11px;font-size:13px;background:var(--purple);--sd:var(--purple-d)">＋ Add snack</button>`;
  h += "</div>";
  return h;
}
function mealThumb(log, fallbackIcon) {
  if (!log || !log.photo_path) return `<div style="width:48px;height:48px;border-radius:12px;background:var(--soft);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${fallbackIcon}</div>`;
  const url = photoUrlFor(log.photo_path);
  if (!url) return `<div style="width:48px;height:48px;border-radius:12px;background:var(--soft);flex-shrink:0"></div>`;
  return `<img src="${url}" style="width:48px;height:48px;border-radius:12px;object-fit:cover;flex-shrink:0"/>`;
}

function todayGlanceCard(today) {
  const day = DB.plan.weeks[DB.todayWeekIndex].days[DB.todayDayIndex];
  let h = `<div class="card">${sectionTitle("Today at a Glance")}`;

  if (day.ex.length === 0 || day.type === "rest" && day.ex.every((e) => EXERCISES[e.exerciseId] && EXERCISES[e.exerciseId].muscle === "recovery")) {
    h += `<div class="tap" data-act="tab" data-v="workout" style="display:flex;align-items:center;gap:10px;padding:10px 0">
      <div style="font-size:22px">🌿</div><div><div style="font-size:14px;font-weight:800;color:var(--ink)">${day.focus}</div>
      <div style="font-size:11px;color:var(--grey);font-weight:700">Rest day — tap to see recovery tips</div></div></div>`;
  } else {
    const doneCount = day.ex.filter((slot) => DB.setLogs.filter((s) => s.exercise_id === slot.exerciseId).length >= slot.sets).length;
    const pct = (doneCount / day.ex.length) * 100;
    h += `<div class="tap" data-act="tab" data-v="workout" style="padding:4px 0 10px">
      <div class="row" style="justify-content:space-between;align-items:center">
        <div><div style="font-size:14px;font-weight:800;color:var(--ink)">🏋️ ${day.focus}</div>
        <div style="font-size:11px;color:var(--grey);font-weight:700">${doneCount}/${day.ex.length} exercises done</div></div>
        <div style="font-size:18px;color:var(--grey)">›</div></div>
      <div style="height:8px;background:var(--soft);border-radius:5px;margin-top:8px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:var(--green);border-radius:5px"></div></div></div>`;
  }

  h += `<div style="height:2px;background:var(--line);margin:10px 0"></div>`;
  h += '<div class="row" style="gap:6px">';
  habitDefs.forEach((hb) => {
    const on = isHabitDone(today, hb.id);
    h += `<button class="streakNode" data-act="habit" data-date="${today}" data-h="${hb.id}" style="flex:1;height:48px;
      ${on ? "background:var(--orange);color:#fff;box-shadow:0 3px 0 var(--orange-d)" : "background:var(--soft);color:var(--grey);border:2px solid var(--line)"}" title="${hb.label}">${hb.icon}</button>`;
  });
  h += "</div>";
  h += `<div style="font-size:10px;color:var(--grey);margin-top:8px;font-weight:700;text-align:center">Tap an icon to mark today's habit done</div>`;
  h += "</div>";
  return h;
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

  return `<div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:100;display:flex;align-items:flex-end;justify-content:center">
    <div style="background:#fff;width:100%;max-width:480px;border-radius:24px 24px 0 0;padding:20px;max-height:88vh;overflow-y:auto;box-sizing:border-box">
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
    alert("Couldn't save that entry — check your connection and try again.");
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

  let h = '<div style="display:flex;flex-direction:column;gap:12px">' + weekSelector() + dayTabs(week.days);
  h += `<div style="background:${day.color};border-radius:20px;padding:16px;box-shadow:0 4px 0 rgba(0,0,0,0.12)">
    <div style="font-size:11px;color:#fff;font-weight:800;letter-spacing:1px;opacity:0.9">${week.isPeak ? "PEAK WEEK" : "WEEK " + (week.weekIndex + 1)} · ${day.day}</div>
    <div style="font-size:20px;font-weight:900;color:#fff;margin-top:2px">${day.focus}</div>
    ${isToday ? `<div style="font-size:12px;color:#fff;opacity:0.9;font-weight:800;margin-top:4px">${doneSlots}/${totalSlots} done</div>
    <div style="height:10px;background:rgba(255,255,255,0.3);border-radius:6px;margin-top:8px;overflow:hidden"><div style="height:100%;width:${pct}%;background:#fff;border-radius:6px;transition:width .3s"></div></div>`
    : `<div style="font-size:12px;color:#fff;opacity:0.85;font-weight:800;margin-top:4px">${isFuture(week, day) ? "Upcoming" : "Past day"} · logging is only open on today's workout</div>`}
    ${day.note ? `<div style="font-size:12px;color:#fff;opacity:0.95;font-weight:700;margin-top:8px;background:rgba(255,255,255,0.15);border-radius:10px;padding:8px 10px">${day.note}</div>` : ""}
  </div>`;

  day.ex.forEach((slot) => h += exerciseCard(week, day, slot, isToday));
  if (!day.ex.length) h += `<div class="card" style="text-align:center;color:var(--grey);font-size:13px;font-weight:700">Nothing scheduled — enjoy the rest. 🌿</div>`;

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

  let h = `<div style="background:${allDone ? "#F0FBE6" : "#fff"};border:2px solid ${allDone ? "var(--green)" : "var(--line)"};border-radius:16px;overflow:hidden">
    <div class="tap" data-act="toggleSlot" data-key="${key}" style="display:flex;align-items:center;gap:12px;padding:14px">
      ${check(allDone)}
      <div style="flex:1">
        <div style="font-size:14px;font-weight:800;color:${allDone ? "var(--green-d)" : "var(--ink)"}">${exercise.name}</div>
        <div style="font-size:11px;color:var(--grey);font-weight:700">${slot.sets}×${slot.reps}${slot.rest !== "-" ? " · rest " + slot.rest : ""}</div>
      </div>
      <div style="font-size:16px;color:var(--grey)">${expanded ? "︿" : "﹀"}</div>
    </div>`;

  if (expanded) {
    h += `<div style="padding:0 14px 14px">`;
    const last = lastSetsFor(slot.exerciseId);
    if (last && last.length) {
      h += `<div style="font-size:11px;color:var(--grey);font-weight:700;margin-bottom:8px">Last time: ${last.map((s) => `${s.weight_kg}kg×${s.reps}`).join(", ")}</div>`;
    }

    if (isToday) {
      loggedSets.forEach((s, i) => {
        h += `<div class="row" style="align-items:center;gap:8px;padding:6px 0;font-size:13px;font-weight:800;color:var(--ink)">
          <div style="width:22px;height:22px;border-radius:7px;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0">${i + 1}</div>
          <div>${s.weight_kg}kg × ${s.reps} reps</div></div>`;
      });
      if (loggedSets.length < slot.sets || true) {
        h += `<div class="row" style="gap:8px;align-items:center;margin-top:8px">
          <input type="number" step="0.5" placeholder="kg" id="setWeight-${key}" style="width:64px;padding:9px;background:var(--soft);border:2px solid var(--line);border-radius:10px;font-size:13px;font-weight:800;text-align:center"/>
          <span style="color:var(--grey);font-weight:800">×</span>
          <input type="number" placeholder="reps" id="setReps-${key}" style="width:64px;padding:9px;background:var(--soft);border:2px solid var(--line);border-radius:10px;font-size:13px;font-weight:800;text-align:center"/>
          <button class="btn3d" data-act="logSet" data-key="${key}" data-exercise="${slot.exerciseId}" data-setnum="${loggedSets.length + 1}" style="flex:1;padding:10px;font-size:12px;background:var(--green);--sd:var(--green-d)">Log set ${loggedSets.length + 1}</button>
        </div>`;
      }
    } else {
      h += `<div style="font-size:12px;color:var(--grey);font-weight:700;margin-bottom:8px">Set logging opens when this is today's workout.</div>`;
    }

    h += `<div class="row" style="gap:8px;margin-top:12px">
      <button class="pill" data-act="openSwap" data-key="${key}" data-muscle="${exercise.muscle}" data-exercise="${slot.exerciseId}" style="flex:1;padding:10px;font-size:12px;background:var(--soft);color:var(--ink);border:2px solid var(--line)">🔁 Swap</button>
      <button class="pill" data-act="openAdjust" data-key="${key}" style="flex:1;padding:10px;font-size:12px;background:var(--soft);color:var(--ink);border:2px solid var(--line)">⚙️ Adjust</button>
    </div>`;
    h += `</div>`;
  }
  h += "</div>";
  return h;
}

async function logSetFor(key, exerciseId, setNumber) {
  const wEl = document.getElementById(`setWeight-${key}`), rEl = document.getElementById(`setReps-${key}`);
  const weight = parseFloat(wEl.value), reps = parseInt(rEl.value, 10);
  if (!weight || !reps) { alert("Enter both weight and reps."); return; }
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
  return `<div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:100;display:flex;align-items:flex-end;justify-content:center">
    <div style="background:#fff;width:100%;max-width:480px;border-radius:24px 24px 0 0;padding:20px;max-height:80vh;overflow-y:auto;box-sizing:border-box">
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
  return `<div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:100;display:flex;align-items:flex-end;justify-content:center">
    <div style="background:#fff;width:100%;max-width:480px;border-radius:24px 24px 0 0;padding:20px;box-sizing:border-box">
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

// ---------- TAB: MEALS (suggested plan) ----------
function mealsTab() {
  const week = DB.plan.weeks[ui.selectedWeek];
  const day = week.days[ui.selectedDay];
  const plan = getMealsForDay(DB.plan.template, week, day, ui.selectedDay);
  const total = plan ? plan.meals.reduce((s, m) => s + m.cals, 0) : 0;
  const barColor = week.isPeak ? "var(--green)" : "var(--blue)";

  let h = '<div style="display:flex;flex-direction:column;gap:12px">' + weekSelector() + dayTabs(week.days);
  if (plan) {
    h += `<div style="background:${barColor};border-radius:20px;padding:16px;text-align:center;box-shadow:0 4px 0 ${week.isPeak ? "var(--green-d)" : "var(--blue-d)"}">
      <div style="font-size:11px;color:#fff;font-weight:800;opacity:0.9;letter-spacing:0.5px">${plan.label}</div>
      <div style="font-size:34px;font-weight:900;color:#fff;margin-top:4px">~${total}<span style="font-size:15px;opacity:0.8"> kcal</span></div>
      <div class="row" style="justify-content:center;gap:14px;margin-top:6px">
        <span style="font-size:12px;color:#fff;font-weight:800">P ${plan.protein}</span>
        <span style="font-size:12px;color:#fff;font-weight:800">C ${plan.carbs}</span>
        <span style="font-size:12px;color:#fff;font-weight:800">F ${plan.fat}</span></div></div>`;
    plan.meals.forEach((meal) => {
      h += `<div style="background:#fff;border:2px solid var(--line);border-radius:16px;padding:14px">
        <div class="row" style="justify-content:space-between;align-items:center">
          <span style="font-size:14px;font-weight:900;color:var(--ink)">${meal.name}</span>
          <span style="font-size:11px;color:#fff;background:var(--gold);padding:2px 8px;border-radius:10px;font-weight:800">${meal.cals}</span></div>
        <div style="font-size:11px;color:var(--grey);font-weight:800">${meal.time}</div>
        <div style="font-size:12px;color:var(--ink);margin-top:5px;line-height:1.5;font-weight:600">${meal.desc}</div>
        <div class="row" style="gap:10px;margin-top:5px">
          <span style="font-size:10px;color:var(--red);font-weight:800">P:${meal.p}g</span>
          <span style="font-size:10px;color:var(--blue);font-weight:800">C:${meal.c}g</span>
          <span style="font-size:10px;color:var(--orange);font-weight:800">F:${meal.f}g</span></div></div>`;
    });
  }
  h += `<div style="background:#E8F7FF;border:2px solid var(--blue);border-radius:16px;padding:12px 14px;font-size:13px;font-weight:800;color:var(--blue-d)">
    💡 This is your suggested plan. Log what you actually ate on the <b>Home</b> tab.</div>`;
  return h + "</div>";
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
  let h = '<div style="display:flex;flex-direction:column;gap:14px">';
  h += `<div style="background:var(--purple);border-radius:20px;padding:18px;box-shadow:0 4px 0 var(--purple-d)">
    <div style="font-size:18px;font-weight:900;color:#fff">📖 Your Playbook</div>
    <div style="font-size:12px;color:#fff;opacity:0.95;margin-top:4px;line-height:1.5;font-weight:700">Muscle-sparing, not extreme. The goal is looking lean & strong — not a crash diet that eats your muscle.</div></div>`;
  guideSections.forEach((s) => {
    h += `<div class="card" style="border-color:${s.color}"><div style="font-size:15px;font-weight:900;color:${s.color};margin-bottom:8px">${s.title}</div>`;
    s.items.forEach((it, j) => {
      h += `<div style="font-size:12px;color:var(--ink);padding:6px 0;line-height:1.5;font-weight:700;border-bottom:${j < s.items.length - 1 ? "2px solid var(--line)" : "none"}">${it}</div>`;
    });
    h += "</div>";
  });
  return h + "</div>";
}

// ---------- TAB: PROFILE ----------
let weightChartInstance = null, strengthChartInstance = null;
if (typeof Chart !== "undefined") { Chart.defaults.font.family = "'Nunito', -apple-system, sans-serif"; Chart.defaults.font.weight = 700; }

function profileTab() {
  const goal = DB.goal;
  let h = '<div style="display:flex;flex-direction:column;gap:14px">';

  h += `<div class="card">${sectionTitle("Account")}
    <div style="font-size:14px;font-weight:800;color:var(--ink);margin-bottom:2px">${escapeHtml(AUTH.profile.display_name || "")}</div>
    <div style="font-size:12px;color:var(--grey);font-weight:700;margin-bottom:12px">${AUTH.user.email}</div>
    <div class="row" style="gap:8px">
      <button class="pill" data-act="togglePush" style="flex:1;padding:11px;font-size:12px;background:var(--soft);color:var(--ink);border:2px solid var(--line)">${ui.pushEnabled ? "🔕 Disable reminders" : "🔔 Enable meal reminders"}</button>
      <button class="pill" data-act="signOut" style="flex:1;padding:11px;font-size:12px;background:var(--soft);color:var(--red);border:2px solid var(--line)">Sign out</button>
    </div></div>`;

  h += `<div class="card">${sectionTitle("Current Goal")}
    <div style="font-size:15px;font-weight:900;color:var(--ink)">${escapeHtml(goal.title)}</div>
    <div style="font-size:12px;color:var(--grey);font-weight:700;margin-top:2px">${goal.target_date ? "Target: " + fmtDate(goal.target_date) : "No fixed deadline"} · ${goal.start_weight}kg → ${goal.goal_weight}kg</div>
    <button class="pill" data-act="newGoalForm" style="width:100%;padding:11px;font-size:12px;background:var(--soft);color:var(--ink);border:2px solid var(--line);margin-top:12px">🎯 Start a new goal</button>
    ${ui.newGoalOpen ? newGoalForm() : ""}
  </div>`;

  h += `<div class="card">${sectionTitle("Weight Trend")}
    <div class="row" style="gap:8px;margin-bottom:10px">
      <input id="weighInInput" type="number" step="0.1" placeholder="Today's weight (kg)" style="flex:1;padding:11px;background:var(--soft);border:2px solid var(--line);border-radius:12px;font-size:13px;font-weight:800;box-sizing:border-box"/>
      <button class="btn3d" data-act="logWeight" style="padding:11px 16px;font-size:12px;background:var(--green);--sd:var(--green-d)">Log</button>
    </div>
    <div style="position:relative;height:190px"><canvas id="weightChart"></canvas></div></div>`;

  h += `<div class="card">${sectionTitle("Strength Progress")}
    <select id="strengthExercise" style="width:100%;padding:11px;background:var(--soft);border:2px solid var(--line);border-radius:12px;font-size:13px;font-weight:800;margin-bottom:10px">
      ${Object.values(EXERCISES).filter((e) => e.muscle && e.muscle !== "recovery" && e.muscle !== "cardio").map((e) => `<option value="${e.id}" ${ui.strengthExercise === e.id ? "selected" : ""}>${e.name}</option>`).join("")}
    </select>
    <div style="position:relative;height:180px"><canvas id="strengthChart"></canvas></div></div>`;

  h += `<div class="card">${sectionTitle("What You Control")}
    <div style="font-size:12px;color:var(--grey);margin-bottom:12px;font-weight:700">The habits that move the needle, regardless of what the scale says.</div>`;
  const ctrl = [["🍗", "Protein 120g", "Protects muscle in a deficit"], ["👟", "8,000+ steps", "More weekly burn than any workout"], ["😴", "Sleep 7+ hrs", "Poor sleep holds fat, loses muscle"], ["🥗", "A real deficit", "Not a crash — sustainable wins"], ["🏋️", "Consistent training", "Show up, especially on hard days"]];
  ctrl.forEach((r, i) => {
    h += `<div class="row" style="gap:12px;align-items:center;padding:9px 0;border-bottom:${i < 4 ? "2px solid var(--line)" : "none"}">
      <div style="font-size:22px">${r[0]}</div><div><div style="font-size:14px;color:var(--ink);font-weight:800">${r[1]}</div>
      <div style="font-size:11px;color:var(--grey);font-weight:700">${r[2]}</div></div></div>`;
  });
  h += "</div>";

  h += `<div class="card">${sectionTitle("Legacy Data")}
    <div style="font-size:12px;color:var(--grey);margin-bottom:10px;font-weight:700">Have weigh-ins from the old version of this app on this device? Import them once.</div>
    <button class="pill" data-act="importLegacy" style="width:100%;padding:11px;font-size:12px;background:var(--soft);color:var(--ink);border:2px solid var(--line)">⬆️ Import legacy backup</button></div>`;

  return h + "</div>";
}

function newGoalForm() {
  return `<div style="margin-top:14px;padding-top:14px;border-top:2px solid var(--line);display:flex;flex-direction:column;gap:10px">
    <input id="ngTitle" placeholder="Goal title (e.g. 8-week cut)" style="padding:11px;background:var(--soft);border:2px solid var(--line);border-radius:12px;font-size:13px;font-weight:700;box-sizing:border-box"/>
    <div class="row" style="gap:8px">
      <input id="ngCurrent" type="number" step="0.1" placeholder="Current kg" style="flex:1;padding:11px;background:var(--soft);border:2px solid var(--line);border-radius:12px;font-size:13px;font-weight:700;box-sizing:border-box"/>
      <input id="ngGoal" type="number" step="0.1" placeholder="Goal kg" style="flex:1;padding:11px;background:var(--soft);border:2px solid var(--line);border-radius:12px;font-size:13px;font-weight:700;box-sizing:border-box"/>
    </div>
    <input id="ngDate" type="date" style="padding:11px;background:var(--soft);border:2px solid var(--line);border-radius:12px;font-size:13px;font-weight:700;box-sizing:border-box"/>
    <button class="btn3d" data-act="createGoal" style="padding:12px;font-size:13px;background:var(--green);--sd:var(--green-d)">Generate plan</button>
  </div>`;
}

async function submitNewGoal() {
  const title = document.getElementById("ngTitle").value.trim();
  const current = parseFloat(document.getElementById("ngCurrent").value);
  const goalW = parseFloat(document.getElementById("ngGoal").value);
  const date = document.getElementById("ngDate").value || null;
  if (!title || !current || !goalW) { alert("Fill in title, current weight, and goal weight."); return; }
  const today = todayStr();
  const templateId = date ? "lean-peak" : "consistency";
  const durationWeeks = date ? Math.max(1, Math.ceil((new Date(date) - new Date(today)) / (7 * 86400000))) : 5;
  await createGoal(AUTH.user.id, {
    title, target_date: date, start_weight: current, goal_weight: goalW,
    template_id: templateId, duration_weeks: durationWeeks, start_date: today, is_active: true,
  });
  await upsertWeightEntry(AUTH.user.id, today, current);
  ui.newGoalOpen = false; ui.selectedWeek = 0; ui.selectedDay = 0;
  await loadAll(); render();
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
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12, boxHeight: 12, padding: 14, color: "#4B4B4B", font: { weight: 800, size: 11 } } } },
      scales: { x: { grid: { display: false }, ticks: { color: "#AFAFAF", font: { weight: 800, size: 10 } } },
        y: { grid: { color: "#E5E5E5" }, ticks: { color: "#AFAFAF", font: { weight: 700, size: 11 }, callback: (v) => v + "kg" } } },
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
      plugins: { legend: { display: dates.length > 0, position: "bottom", labels: { color: "#4B4B4B", font: { weight: 800, size: 11 } } } },
      scales: { x: { grid: { display: false }, ticks: { color: "#AFAFAF", font: { weight: 800, size: 10 } } },
        y: { grid: { color: "#E5E5E5" }, ticks: { color: "#AFAFAF", font: { weight: 700, size: 11 }, callback: (v) => v + "kg" } } } },
  });
  if (!dates.length) {
    canvas.parentElement.insertAdjacentHTML("beforeend", '<div id="strengthEmpty" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--grey);font-weight:700">No sets logged for this exercise yet.</div>');
  }
}

async function importLegacyData() {
  let raw;
  try { raw = JSON.parse(localStorage.getItem("fitnessTracker_app_v1")); } catch (e) {}
  if (!raw) { alert("No legacy backup found on this device."); return; }
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
  alert(`Imported ${imported} legacy entries.`);
  render();
}

// ---------- push notifications ----------
async function togglePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) { alert("Push notifications aren't supported in this browser."); return; }
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
      alert("Couldn't enable reminders. On iPhone, add this app to your Home Screen first (Share → Add to Home Screen).");
    }
  }
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
  const tabs = [["dashboard", "Home", "🏠"], ["workout", "Train", "🏋️"], ["meals", "Eat", "🍽️"], ["habits", "Habits", "✅"], ["guide", "Guide", "📖"], ["profile", "Me", "👤"]];
  let nav = '<div class="row" style="gap:4px;padding:6px 10px 8px;overflow-x:auto;position:sticky;top:0;background:#fff;z-index:10;border-bottom:2px solid var(--line)">';
  tabs.forEach((t) => {
    const a = ui.activeTab === t[0];
    nav += `<button class="pill" data-act="tab" data-v="${t[0]}" style="padding:9px 12px;font-size:12px;white-space:nowrap;
      ${a ? "background:var(--green);color:#fff;box-shadow:0 3px 0 var(--green-d)" : "background:transparent;color:var(--grey)"}">${t[2]} ${t[1]}</button>`;
  });
  nav += "</div>";

  let body = "";
  if (ui.activeTab === "dashboard") body = dashboard();
  else if (ui.activeTab === "workout") body = workoutTab();
  else if (ui.activeTab === "meals") body = mealsTab();
  else if (ui.activeTab === "habits") body = habitsTab();
  else if (ui.activeTab === "guide") body = guideTab();
  else if (ui.activeTab === "profile") body = profileTab();

  document.getElementById("app").innerHTML = `
    <div style="padding:18px 16px 12px;background:#fff">
      <div style="font-size:11px;color:var(--green);font-weight:900;letter-spacing:2px">FITNESS TRACKER</div>
      <div style="font-size:24px;font-weight:900;color:var(--ink);margin-top:2px">${escapeHtml(DB.goal.title)} 🏋️</div>
      <div style="font-size:12px;color:var(--grey);margin-top:1px;font-weight:700">Never lose the habit. Get measurably stronger.</div>
    </div>
    ${nav}
    <div style="padding:14px 14px 48px">${body}</div>
    ${mealSheetOverlay()}${swapPickerOverlay()}${adjustFormOverlay()}`;

  saveUi();
  if (ui.activeTab === "profile") { renderWeightChart(); renderStrengthChart(); }
  else { if (weightChartInstance) { weightChartInstance.destroy(); weightChartInstance = null; } if (strengthChartInstance) { strengthChartInstance.destroy(); strengthChartInstance = null; } }
}

// ---------- EVENTS ----------
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]"); if (!btn) return;
  const act = btn.dataset.act;

  if (act === "tab") { ui.activeTab = btn.dataset.v; ui.expandedSlot = null; }
  else if (act === "week") { ui.selectedWeek = parseInt(btn.dataset.v, 10); ui.selectedDay = 0; }
  else if (act === "day") { ui.selectedDay = parseInt(btn.dataset.v, 10); }
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
  else if (act === "openSwap") { ui.swapPicker = { key: btn.dataset.key, muscle: btn.dataset.muscle, exerciseId: btn.dataset.exercise }; }
  else if (act === "closeSwap") { ui.swapPicker = null; }
  else if (act === "doSwap") {
    const { weekIndex, dayIndex, slot } = slotFromKey(ui.swapPicker.key);
    await saveOverride(weekIndex, dayIndex, slot, { exerciseId: btn.dataset.exercise });
    ui.swapPicker = null;
  }
  else if (act === "openAdjust") { ui.adjustSlot = { key: btn.dataset.key }; }
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
    if (!val) { alert("Enter a weight."); return; }
    await upsertWeightEntry(AUTH.user.id, todayStr(), val);
    DB.weightEntries = await getWeightEntries(AUTH.user.id);
  }
  else if (act === "importLegacy") { await importLegacyData(); return; }
  else if (act === "togglePush") { await togglePush(); return; }
  else if (act === "signOut") { await signOut(); return; }
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
