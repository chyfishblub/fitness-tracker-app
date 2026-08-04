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
}

async function testAuthScreens() {
  const appNode = { innerHTML: "" };
  const inertNode = () => ({ value: "", style: {}, addEventListener() {} });
  const context = {
    console, Date, setTimeout, clearTimeout,
    document: { getElementById: (id) => id === "app" ? appNode : inertNode(), querySelectorAll: () => [] },
    getSession: async () => null, getProfile: async () => ({}), onAuthChange() {},
    sendMagicLink: async () => ({}), completeOnboarding: async () => {}, createGoal: async () => {},
    upsertWeightEntry: async () => {}, initApp() {},
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("js/auth.js", "utf8"), context, { filename: "js/auth.js" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(appNode.innerHTML, /Know what to do/);
  assert.match(appNode.innerHTML, /Photo-first meal journal/);
  vm.runInContext(`renderOnboarding({ id: "user-1" }, { display_name: "" })`, context);
  assert.match(appNode.innerHTML, /1 of 3/);
  assert.match(appNode.innerHTML, /Start with where you are/);
}

Promise.resolve()
  .then(testSignedInApp)
  .then(testAuthScreens)
  .then(() => console.log("UI render checks passed."))
  .catch((error) => { console.error(error); process.exitCode = 1; });
