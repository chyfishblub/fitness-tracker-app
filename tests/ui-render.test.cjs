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
  for (const file of ["js/data.js", "js/plan.js", "js/game.js", "js/spotter.js", "js/home.js", "js/app.js"]) {
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
  assert.match(sw, /fitness-tracker-v17/);
  assert.match(sw, /"\.\/js\/home\.js"/, "home.js is cached for offline use");
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
  assert.match(html, /js\/spotter\.js[\s\S]*js\/app\.js/, "spotter.js loads before app.js");
  assert.match(html, /js\/game\.js[\s\S]*js\/spotter\.js[\s\S]*js\/home\.js[\s\S]*js\/app\.js/, "home.js loads after game.js and spotter.js, before app.js");
  assert.match(sw, /\.\/js\/spotter\.js/);
  // The background tune: every bar of the waltz is three beats.
  const waltz = vm.runInNewContext(pixelJs.match(/const WALTZ = (\[[\s\S]*?\n  \]);/)[1]);
  assert.equal(waltz.length, 32);
  waltz.forEach(([, tune], i) => assert.equal(tune.split(" ").reduce((sum, t) => sum + Number(t.split(":")[1] || 1), 0), 3, `bar ${i + 1} is 3 beats`));
  assert.match(pixelJs, /row\("music"/, "Me has a Music switch");
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
  vm.runInContext(fs.readFileSync("js/spotter.js", "utf8"), context, { filename: "js/spotter.js" });
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
  assert.match(appNode.innerHTML, /data-spotter-kind="frog"/, "onboarding lets the player pick a buddy");
  assert.match(appNode.innerHTML, /data-spotter-color="mint"/);
}

async function testGameLayer() {
  const { context, handlers, appNode } = appHarness();
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
  // Workout is quest 2, habits are quest 3 and sit below it; the habit list is short.
  assert.ok(appNode.innerHTML.indexOf("QUEST 2 · ") < appNode.innerHTML.indexOf("QUEST 3 · DAILY HABITS"));
  assert.match(appNode.innerHTML, /QUEST 2 · (WORKOUT|REST DAY)/);
  assert.ok(run(`habitDefs.length`) <= 3, "three habits at most");
  assert.doesNotMatch(appNode.innerHTML, /Hit 120g protein|Drink your water|Snacks I planned/);
  assert.doesNotMatch(appNode.innerHTML, /workout-goal/, "the workout is no longer repeated as a habit tile");
  assert.doesNotMatch(appNode.innerHTML, /of 3 logged/, "the meal count isn't repeated in the ring");
  run(`ui.activeTab = "profile"; render();`);
  assert.match(appNode.innerHTML, /PLAYER LEVEL/);
  assert.match(appNode.innerHTML, /Your collection/);
  assert.match(appNode.innerHTML, /class="level-chip"/);
  assert.match(appNode.innerHTML, /class="spotter-card"/, "Me has a Spotter card");
  assert.match(appNode.innerHTML, /Name and style your buddy/);
  run(`AUTH.user.user_metadata = { spotter_name: "Bean", spotter_look: { kind: "frog", color: "mint" } }; render();`);
  assert.match(appNode.innerHTML, /Change name or look/);
  assert.match(appNode.innerHTML, /Bean cheers every quest/);
  assert.equal(run(`JSON.stringify(spotterLook())`), JSON.stringify({ kind: "frog", color: "mint" }));
  assert.equal(run(`JSON.stringify(normalizeSpotterLook({ kind: "dragon", color: "plaid" }))`), JSON.stringify({ kind: "bunny", color: "lilac" }), "unknown looks fall back to the default");
  // Editing: the picker restyles the draft and keeps the typed name.
  run(`ui.spotterDraft = { name: "Bean", kind: "frog", color: "mint" }; render();`);
  assert.match(appNode.innerHTML, /id="spotterInput"/);
  assert.match(appNode.innerHTML, /data-spotter-kind="frog" aria-pressed="true"/);
  const nameInput = { value: "Beanie" };
  const byId = context.document.getElementById;
  context.document.getElementById = (id) => id === "spotterInput" ? nameInput : byId(id);
  const pickTarget = (data) => ({ closest: (sel) => sel.includes("spotter-kind") ? { dataset: data } : null });
  await handlers.click[0]({ target: pickTarget({ spotterKind: "cat" }) });
  await handlers.click[0]({ target: pickTarget({ spotterColor: "peach" }) });
  assert.equal(run(`JSON.stringify(ui.spotterDraft)`), JSON.stringify({ name: "Beanie", kind: "cat", color: "peach" }));
  let saved = null;
  context.saveSpotter = async (fields) => { saved = fields; return { id: "user-1", user_metadata: { spotter_name: fields.name, spotter_look: fields.look } }; };
  context.showToast = () => {};
  await handlers.click[0]({ target: { closest: (sel) => sel === "[data-act]" ? { dataset: { act: "saveSpotter" } } : null } });
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), { name: "Beanie", look: { kind: "cat", color: "peach" } });
  assert.equal(run(`ui.spotterDraft`), null);
  context.document.getElementById = byId;
  // Every buddy draws in every colour and frame, and the frames differ.
  const looks = run(`Object.keys(SPOTTER_KINDS).flatMap((k) => Object.keys(SPOTTER_COLORS).map((c) => ({ kind: k, color: c })))`);
  for (const look of looks) {
    const [idle, blink, cheer] = ["idle", "blink", "cheer"].map((f) => run(`spotterSVG(${JSON.stringify(look)}, "${f}")`));
    assert.match(idle, /^<svg viewBox="0 0 16 16"/);
    assert.notEqual(idle, blink, `${look.kind} blinks`);
    assert.notEqual(blink, cheer, `${look.kind} cheers`);
  }

  // A quest with no weight goal still renders.
  run(`DB.goal.start_weight = null; DB.goal.goal_weight = null; render(); ui.activeTab = "progress"; render();`);
  assert.doesNotMatch(appNode.innerHTML, /null kg|undefined/);

  // Tapping ✓ with an empty reps box logs the planned reps shown as its hint.
  const logged = [];
  context.logSet = async (_userId, entry) => { logged.push(entry); };
  context.getSetLogsForDate = async () => [];
  const inputs = { "setWeight-k": { value: "" }, "setReps-k": { value: "", placeholder: "8" } };
  const getById = context.document.getElementById;
  context.document.getElementById = (id) => inputs[id] || getById(id);
  await vm.runInContext(`logSetFor("k", "bench-press", 1, false)`, context);
  assert.equal(logged.length, 1, "an empty reps box still logs the set");
  assert.equal(logged[0].reps, 8);
  assert.equal(logged[0].weightKg, null);
  inputs["setReps-k"].value = "12";
  await vm.runInContext(`logSetFor("k", "bench-press", 2, false)`, context);
  assert.equal(logged[1].reps, 12, "typed reps win over the hint");
}

async function testHome() {
  const { context, handlers, appNode } = appHarness();
  const run = (code) => vm.runInContext(code, context);
  run(`AUTH.user.user_metadata = { spotter_name: "Bean", spotter_look: { kind: "frog", color: "mint" }, home_items: ["rug", "sofa", "nonsense"] };`);
  const fakeGame = (level, badges) => JSON.stringify({ level, badges: run("BADGES").map((b) => ({ ...b, earned: badges.includes(b.id) })) });
  const states = (level, badges) => Object.fromEntries(run(`furnitureList(${fakeGame(level, badges)}).map((p) => [p.id, p.state])`));

  // Every piece has art, a fixed spot inside the room, and an unlock that exists.
  const ids = run("FURNITURE_ORDER");
  assert.equal(ids.length, 14);
  assert.deepEqual(JSON.parse(run("JSON.stringify(FURNITURE_LAYERS.slice().sort())")), JSON.parse(JSON.stringify(ids)).sort(), "every piece is drawn in the room");
  for (const id of ids) {
    const f = run(`FURNITURE["${id}"]`);
    assert.ok(f.x >= 0 && f.y >= 0 && f.x + f.w <= 200 && f.y + f.h <= 150, `${id} fits in the room`);
    if (f.unlock.type === "badge") assert.ok(run(`BADGES.some((b) => b.id === "${f.unlock.id}")`), `${id} unlocks from a real badge`);
    assert.match(run(`furnitureSVG("${id}")`), /^<svg viewBox="0 0 48 48"[\s\S]*<rect/);
  }

  // Level 1, no badges: the starters are in, a claimed piece stays in even before it's earned again, the rest are locked.
  let st = states(1, []);
  assert.equal(st.bed, "in"); assert.equal(st.window, "in");
  assert.equal(st.rug, "in"); assert.equal(st.sofa, "in", "claimed pieces are never taken back");
  assert.equal(st.lamp, "locked"); assert.equal(st.rack, "locked");
  assert.deepEqual(JSON.parse(run("JSON.stringify(homeClaimedIds())")), ["rug", "sofa"], "unknown ids are ignored");
  // Level 4 with First clear: the plant, lamp and dumbbell rack are ready to claim.
  st = states(4, ["first-workout"]);
  assert.equal(st.plant, "ready"); assert.equal(st.lamp, "ready"); assert.equal(st.rack, "ready");
  assert.equal(st.shelf, "locked");

  // Today has the door; Home renders the room, the Spotter, claim tags and the catalogue.
  run(`ui.activeTab = "dashboard"; render();`);
  assert.match(appNode.innerHTML, /data-act="goHome"/);
  run(`ui.activeTab = "home"; render();`);
  const home = appNode.innerHTML;
  assert.match(home, /class="home-room"/);
  assert.match(home, /class="home-room-art"/);
  assert.match(home, /class="home-buddy/);
  assert.match(home, /Bean/);
  assert.match(home, /data-act="leaveHome"/);
  // Pat, dance and nap are icon buttons in the room's action bar, inside the frame.
  assert.match(home, /<div class="home-room">[\s\S]*<div class="home-hud"[\s\S]*data-v="pat"[\s\S]*data-v="dance"[\s\S]*data-v="nap"[\s\S]*<\/div><\/div>\s*<section class="home-talk">/);
  assert.doesNotMatch(home, /home-acts/);
  // Icon outlines aren't clipped: every coloured pixel has a ring of room for its ink outline.
  for (const k of ["pat", "dance", "nap"]) {
    const svg = run(`homeIconSVG("${k}")`);
    const [vw, vh] = svg.match(/viewBox="0 0 (\d+) (\d+)"/).slice(1).map(Number);
    const fills = [...svg.matchAll(/x="(\d+)" y="(\d+)" width="1" height="1" fill="([^"]+)"/g)].filter((m) => m[3] !== "#2A1F3D").map((m) => [Number(m[1]), Number(m[2])]);
    assert.ok(fills.length > 0);
    assert.ok(fills.every(([x, y]) => x > 0 && y > 0 && x < vw - 1 && y < vh - 1), `${k} icon has room for its outline`);
  }
  assert.match(home, /aria-current="page"[^>]*>[\s\S]*?Today/, "Today stays lit in the nav at home");
  assert.equal((home.match(/class="home-tile /g) || []).length, 14);
  assert.doesNotMatch(home, /streak|guilty|cheat\b|behind|failed|missed|undefined/i);

  // Claiming: a locked piece can't be claimed; a ready one is saved and lands in the room.
  let saved = null;
  context.saveHomeItems = async (items) => { saved = items; return { id: "user-1", user_metadata: { spotter_name: "Bean", home_items: items } }; };
  context.showToast = () => {};
  const click = (act, v) => handlers.click[0]({ target: { closest: (sel) => sel === "[data-act]" ? { dataset: { act, v } } : null } });
  await click("claimFurniture", "arcade");
  assert.equal(saved, null, "a locked piece isn't claimed");
  run(`realGameState = gameState; gameState = () => (${fakeGame(4, ["first-workout"])});`);
  await click("claimFurniture", "lamp");
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), ["rug", "sofa", "lamp"]);
  assert.equal(run(`furnitureList(gameState()).find((p) => p.id === "lamp").state`), "in");
  assert.match(appNode.innerHTML, /The lamp looks perfect there!/);

  // Pat, dance and nap change what the Spotter does and says.
  await click("homeAct", "nap");
  assert.match(appNode.innerHTML, /home-buddy is-nap/);
  assert.match(appNode.innerHTML, /home-zz/);
  assert.match(appNode.innerHTML, /home-hud-btn is-on" data-act="homeAct" data-v="nap" aria-pressed="true"/);
  await click("homeAct", "pat");
  assert.match(appNode.innerHTML, /home-heart/);
  run(`gameState = realGameState;`);
  await click("leaveHome");
  assert.equal(run("ui.activeTab"), "dashboard");
  assert.equal(run("ui.homeAct"), null);
}

Promise.resolve()
  .then(testSignedInApp)
  .then(testHome)
  .then(testGameLayer)
  .then(testMealPersistence)
  .then(testAuthScreens)
  .then(() => console.log("UI render checks passed."))
  .catch((error) => { console.error(error); process.exitCode = 1; });
