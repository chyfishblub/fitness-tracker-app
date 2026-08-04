const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function appHarness() {
  const handlers = {};
  const appNode = { innerHTML: "" };
  const context = {
    console, Date, Intl, URL, Blob, setTimeout, clearTimeout,
    requestAnimationFrame: (fn) => fn(),
    localStorage: { getItem: () => null, setItem() {} },
    document: {
      body: { appendChild() {} },
      createElement: () => ({ setAttribute() {}, classList: { add() {}, remove() {} } }),
      getElementById: (id) => id === "app" ? appNode : null,
      addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    },
    window: {}, navigator: {}, getLastSetLogs: async () => [],
  };
  vm.createContext(context);
  for (const file of ["js/data.js", "js/plan.js", "js/app.js"]) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }
  vm.runInContext(`
    AUTH.user = { id: "user-1", email: "fish@example.com" };
    AUTH.profile = { display_name: "Fish" };
    DB.goal = { id: "goal-1", title: "Build strength", start_date: todayStr(), target_date: null,
      start_weight: 60, goal_weight: 57, duration_weeks: 5, template_id: "consistency" };
    const generated = generatePlan(DB.goal);
    DB.plan = { template: generated.template, weeks: applyOverrides(generated.weeks, []) };
    DB.todayWeekIndex = 0; DB.todayDayIndex = 0; DB.mealLogs = []; DB.setLogs = [];
    DB.weightEntries = [{ entry_date: todayStr(), weight_kg: 60 }];
    DB.habitWeeksLoaded.add(0);
  `, context);
  return { context, handlers, appNode };
}

async function testSignedInApp() {
  const { context, handlers, appNode } = appHarness();
  const screens = {};
  for (const tab of ["dashboard", "workout", "plan", "progress", "profile"]) {
    vm.runInContext(`ui.activeTab = "${tab}"; render();`, context);
    screens[tab] = appNode.innerHTML;
  }

  const nav = screens.dashboard.match(/<nav class="bottom-nav"[\s\S]*?<\/nav>/)[0];
  assert.equal((nav.match(/<button/g) || []).length, 5, "bottom nav has five destinations");
  assert.match(screens.dashboard, /Log what you eat/);
  assert.match(screens.dashboard, /data-act="openMealHistory"/);
  assert.match(screens.workout, /Today.s workout/);
  assert.match(screens.plan, /Your playbook/);
  assert.match(screens.progress, /Weekly habits/);
  assert.match(screens.profile, /App settings/);

  vm.runInContext(`
    ui.activeTab = "workout";
    const first = DB.plan.weeks[0].days[0].ex[0];
    ui.expandedSlot = "0-Day 1-" + first.slot;
    render();
  `, context);
  assert.match(appNode.innerHTML, /class="set-table"/);
  assert.match(appNode.innerHTML, /PREVIOUS/);
  assert.match(appNode.innerHTML, /aria-label="Complete set 1"/);

  vm.runInContext(`ui.activeTab = "plan"; ui.planSection = "guide"; render();`, context);
  assert.match(appNode.innerHTML, /Simple rules that travel well/);

  await handlers.click[0]({ target: { closest: () => ({ dataset: { act: "todayWorkout" } }) } });
  const route = vm.runInContext(`({ tab: ui.activeTab, week: ui.selectedWeek, day: ui.selectedDay })`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(route)), { tab: "workout", week: 0, day: 0 });

  const css = fs.readFileSync("styles.css", "utf8");
  assert.match(css, /grid-template-columns:repeat\(5,1fr\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media \(max-width:370px\)/);

  vm.runInContext(`
    DB.mealHistoryLogs = [{ id: "meal-1", log_date: "2026-08-04", meal_type: "lunch",
      note: "Chicken rice", portion: "normal", feeling: "Satisfied", photo_path: null,
      logged_at: "2026-08-04T05:30:00.000Z" }];
    ui.mealHistoryMonth = "2026-08";
    ui.mealHistorySelectedDate = "2026-08-04";
    ui.mealHistoryLoading = false;
    ui.activeTab = "mealHistory";
    render();
  `, context);
  assert.match(appNode.innerHTML, /Your food journal/);
  assert.match(appNode.innerHTML, /August 2026/);
  assert.match(appNode.innerHTML, /Chicken rice/);
  assert.match(appNode.innerHTML, /data-act="selectMealHistoryDay"/);
}

async function testMealPersistence() {
  const calls = [];
  const context = {
    console, Date,
    SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "public-key",
    window: { supabase: { createClient: () => ({
      from(table) {
        return {
          insert(payload) { calls.push({ op: "insert", table, payload }); return Promise.resolve({ error: null }); },
          update(payload) {
            calls.push({ op: "update", table, payload });
            const query = { eq(column, value) { calls.push({ op: "eq", column, value }); return query; }, then(resolve) { resolve({ error: null }); } };
            return query;
          },
        };
      },
    }) } },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("js/supabase.js", "utf8"), context, { filename: "js/supabase.js" });
  await vm.runInContext(`upsertMealLog("user-1", { logDate:"2026-08-04", mealType:"breakfast", photoPath:null, note:"Eggs", portion:"normal", feeling:null })`, context);
  await vm.runInContext(`upsertMealLog("user-1", { logId:"meal-1", logDate:"2026-08-04", mealType:"breakfast", photoPath:null, note:"Eggs and toast", portion:"normal", feeling:null })`, context);
  assert.equal(calls.filter((call) => call.op === "insert").length, 1, "new meals are inserted without invalid onConflict upsert");
  assert.equal(calls.filter((call) => call.op === "update").length, 1, "existing meals are updated by id");
  assert.ok(calls.some((call) => call.op === "eq" && call.column === "id" && call.value === "meal-1"));
}

async function testAuthScreens() {
  const appNode = { innerHTML: "" };
  const inertNode = () => ({ value: "", style: {}, addEventListener() {} });
  const context = {
    console, Date, setTimeout, clearTimeout,
    document: { getElementById: (id) => id === "app" ? appNode : inertNode(), querySelectorAll: () => [] },
    getSession: async () => null, getProfile: async () => ({}), onAuthChange() {},
    sendMagicLink: async () => ({}), signInAsGuest: async () => ({}), completeOnboarding: async () => {}, createGoal: async () => {},
    upsertWeightEntry: async () => {}, initApp() {},
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("js/auth.js", "utf8"), context, { filename: "js/auth.js" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(appNode.innerHTML, /Know what to do/);
  assert.match(appNode.innerHTML, /Photo-first meal journal/);
  assert.match(appNode.innerHTML, /Continue as guest/);
  assert.match(appNode.innerHTML, /tied to this browser/);
  assert.match(appNode.innerHTML, /save across devices/);
  vm.runInContext(`renderOnboarding({ id: "user-1" }, { display_name: "" })`, context);
  assert.match(appNode.innerHTML, /1 of 3/);
  assert.match(appNode.innerHTML, /Start with where you are/);
}

Promise.resolve()
  .then(testSignedInApp)
  .then(testMealPersistence)
  .then(testAuthScreens)
  .then(() => console.log("UI render checks passed."))
  .catch((error) => { console.error(error); process.exitCode = 1; });
