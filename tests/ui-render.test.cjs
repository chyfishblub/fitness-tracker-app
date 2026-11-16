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
  for (const file of ["js/data.js", "js/plan.js", "js/game.js", "js/app.js"]) {
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
  assert.match(screens.dashboard, /Snap your meals/);
  assert.match(screens.dashboard, /data-act="openMealHistory"/);
  assert.match(screens.workout, /Today.s workout/);
  assert.match(screens.plan, /Your playbook/);
  assert.match(screens.progress, /Weekly habits/);
  assert.match(screens.profile, /App settings/);
  // Brand voice (docs/redesign/02-brand.md): no streak pressure, no food morality.
  for (const [tab, html] of Object.entries(screens)) {
    assert.doesNotMatch(html, /streak|guilty|cheat\b|behind|failed/i, `${tab} uses a banned brand word`);
  }

  vm.runInContext(`
    ui.activeTab = "workout";
    const first = DB.plan.weeks[0].days[0].ex[0];
    ui.expandedSlot = "0-Day 1-" + first.slot;
    render();
  `, context);
  assert.match(appNode.innerHTML, /class="set-table"/);
  assert.match(appNode.innerHTML, /LAST TIME/);
  assert.match(appNode.innerHTML, /aria-label="Complete set 1"/);

  vm.runInContext(`ui.activeTab = "plan"; ui.planSection = "guide"; render();`, context);
  assert.match(appNode.innerHTML, /Power-ups for real life/);

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
  const state = { duplicateNext: false };
  const context = {
    console, Date,
    SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "public-key",
    window: { supabase: { createClient: () => ({
      from(table) {
        return {
          insert(payload) {
            calls.push({ op: "insert", table, payload });
            if (state.duplicateNext) { state.duplicateNext = false; return Promise.resolve({ error: { code: "23505" } }); }
            return Promise.resolve({ error: null });
          },
          update(payload) {
            calls.push({ op: "update", table, payload });
            const query = { eq(column, value) { calls.push({ op: "eq", column, value }); return query; }, then(resolve) { resolve({ error: null }); } };
            return query;
          },
          select() {
            const query = {
              eq(column, value) { calls.push({ op: "lookup-eq", column, value }); return query; },
              maybeSingle() { calls.push({ op: "lookup" }); return Promise.resolve({ data: { id: "existing-meal" }, error: null }); },
            };
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
  state.duplicateNext = true;
  await vm.runInContext(`upsertMealLog("user-1", { logDate:"2026-08-04", mealType:"breakfast", photoPath:null, note:"Recovered stale row", portion:"light", feeling:null })`, context);
  assert.equal(calls.filter((call) => call.op === "insert").length, 2, "new meals are inserted without invalid onConflict upsert");
  assert.equal(calls.filter((call) => call.op === "update").length, 2, "existing and stale duplicate meals are updated by id");
  assert.ok(calls.some((call) => call.op === "eq" && call.column === "id" && call.value === "meal-1"));
  assert.ok(calls.some((call) => call.op === "eq" && call.column === "id" && call.value === "existing-meal"));
  assert.ok(calls.some((call) => call.op === "lookup"), "duplicate named meals recover through an explicit lookup");

  const sw = fs.readFileSync("sw.js", "utf8");
  const html = fs.readFileSync("index.html", "utf8");
  assert.match(sw, /fitness-tracker-v13/);
  assert.match(sw, /\.\/pixel\.css/, "service worker caches the pixel skin");
  assert.match(sw, /\.\/js\/pixel\.js/);
  assert.match(html, /js\/app\.js[\s\S]*js\/pixel\.js[\s\S]*js\/auth\.js/, "pixel.js loads after app.js and before auth.js");
  assert.match(sw, /fetch\(event\.request\)[\s\S]*caches\.match\(event\.request\)/, "service worker uses network-first app assets");
  assert.match(html, /updateViaCache:\s*"none"/);
  // The pixel look is the only look: fixed in the markup, no on/off switch left behind.
  assert.match(html, /<html lang="en" class="pixel">/);
  assert.doesNotMatch(html, /fitnessTracker_pixel_v1/);
  const pixelJs = fs.readFileSync("js/pixel.js", "utf8");
  assert.doesNotMatch(pixelJs, /"Pixel mode"/, "the Pixel mode switch is gone");
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
  assert.match(appNode.innerHTML, /Your fitness buddy/);
  assert.match(appNode.innerHTML, /Snap-a-photo meal log/);
  assert.match(appNode.innerHTML, /Play as guest/);
  assert.match(appNode.innerHTML, /stays in this browser/);
  assert.match(appNode.innerHTML, /save your progress on every device/);
  vm.runInContext(`renderOnboarding({ id: "user-1" }, { display_name: "" })`, context);
  assert.match(appNode.innerHTML, /1 of 3/);
  assert.match(appNode.innerHTML, /Create your player/);
  assert.doesNotMatch(appNode.innerHTML, /obCurrentWeight/, "weight is not asked for on the first step");
  assert.match(appNode.innerHTML, /Name your Spotter/, "the buddy is a Spotter the player names");
  assert.match(appNode.innerHTML, /data-spotter="Bean"/);
}

async function testGameLayer() {
  const { context, appNode } = appHarness();
  const run = (code) => vm.runInContext(code, context);
  // Levels: 100 XP for level 2, then 150 more for level 3.
  assert.deepEqual(JSON.parse(JSON.stringify(run("levelFor(0)"))), { level: 1, into: 0, need: 100 });
  assert.equal(run("levelFor(100).level"), 2);
  assert.equal(run("levelFor(249).level"), 2);
  assert.equal(run("levelFor(250).level"), 3);
  // Walks and holds are ticked, lifts are weighed.
  assert.equal(run(`isTimedMove({ exerciseId: "lightWalk", reps: "30min" })`), true);
  assert.equal(run(`isTimedMove({ exerciseId: "plank", reps: "45s" })`), true);
  assert.equal(run(`isTimedMove({ exerciseId: "benchPress", reps: "8-10" })`), false);

  // History from earlier days counts toward lifetime XP, badges and personal bests.
  run(`
    const d = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return todayStr(x); };
    DB.history = {
      meals: [{ log_date: d(1), meal_type: "breakfast", photo_path: "a.jpg" }, { log_date: d(1), meal_type: "lunch" }, { log_date: d(1), meal_type: "dinner" }],
      habits: [], sets: [{ log_date: d(1), exercise_id: "benchPress", set_number: 1, weight_kg: 20, reps: 10 }],
    };
    DB.historyHabits = new Set([d(1) + "|water"]);
    DB.setLogs = [{ exercise_id: "benchPress", set_number: 1, weight_kg: 22.5, reps: 8 }];
  `);
  const game = JSON.parse(JSON.stringify(run(`(() => { const g = gameState(); return { xp: g.lifetimeXp, level: g.level, badges: g.badges.filter((b) => b.earned).map((b) => b.id) }; })()`)));
  // Yesterday: 3 meals (60) + 1 habit (10) + 1 set (5). Today: 1 set (5).
  assert.equal(game.xp, 80);
  assert.ok(game.badges.includes("first-meal"));
  assert.ok(game.badges.includes("full-plate"));
  assert.ok(game.badges.includes("high-score"), "22.5 kg beats yesterday's 20 kg");
  assert.ok(!game.badges.includes("first-workout"));
  assert.equal(run(`bestWeightFor("benchPress")`), 22.5);

  run(`ui.activeTab = "dashboard"; render();`);
  assert.match(appNode.innerHTML, /class="next-quest"/, "Today opens with one next step");
  assert.match(appNode.innerHTML, /WEEKLY BOSS/);
  assert.doesNotMatch(appNode.innerHTML, /workout-goal/, "the workout is no longer repeated as a habit tile");
  assert.doesNotMatch(appNode.innerHTML, /of 3 logged/, "the meal count isn't repeated in the ring");
  run(`ui.activeTab = "profile"; render();`);
  assert.match(appNode.innerHTML, /PLAYER LEVEL/);
  assert.match(appNode.innerHTML, /Your collection/);
  assert.match(appNode.innerHTML, /class="level-chip"/);
  assert.match(appNode.innerHTML, /Give your buddy a name/, "Me offers to name the Spotter");
  run(`AUTH.user.user_metadata = { spotter_name: "Bean" }; render();`);
  assert.match(appNode.innerHTML, /Bean · tap to rename/);

  // A quest with no weight goal still renders.
  run(`DB.goal.start_weight = null; DB.goal.goal_weight = null; render(); ui.activeTab = "progress"; render();`);
  assert.doesNotMatch(appNode.innerHTML, /null kg|undefined/);
}

Promise.resolve()
  .then(testSignedInApp)
  .then(testGameLayer)
  .then(testMealPersistence)
  .then(testAuthScreens)
  .then(() => console.log("UI render checks passed."))
  .catch((error) => { console.error(error); process.exitCode = 1; });
