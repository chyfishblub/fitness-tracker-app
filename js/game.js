/* ============================================================
   game.js — the game rules: XP, levels, weekly stars, the weekly
   boss, badges and personal bests.

   Nothing here is stored. Every number is worked out again from
   the logs app.js already holds (DB), so supabase/schema.sql
   stays exactly as it is.

   House rules (docs/redesign/02-brand.md): nothing is ever taken
   away. No streaks, no lost lives, no penalty for a missed day.
   XP only goes up; a quiet week simply doesn't add a star.
   ============================================================ */

const XP = { meal: 20, habit: 10, set: 5, workout: 30 };

// XP needed to go from level n to n + 1. Level 2 at 100 XP, 3 at 250, 5 at 700, 10 at 2,250.
function levelCost(n) { return 100 + 50 * (n - 1); }
function levelFor(xp) {
  let level = 1, floor = 0;
  while (xp >= floor + levelCost(level)) { floor += levelCost(level); level++; }
  return { level, into: xp - floor, need: levelCost(level) };
}

// Walks, stretches, holds and circuits are ticked off, not weighed.
function isTimedMove(slot) {
  const ex = EXERCISES[slot.exerciseId];
  return (ex && ex.muscle === "recovery") || /min|^\d+\s*s$|circuit/i.test(String(slot.reps));
}

const STAR_DAYS_PER_WEEK = 3;
const BOSS_WORKOUTS = 3;

const BADGES = [
  { id: "first-meal", icon: "🍳", title: "First bite", hint: "Log your first meal" },
  { id: "full-plate", icon: "🍽️", title: "Full plate", hint: "Log breakfast, lunch and dinner in one day" },
  { id: "photo-10", icon: "📷", title: "Food album", hint: "Snap 10 meal photos" },
  { id: "first-workout", icon: "🏋️", title: "First clear", hint: "Clear your first workout" },
  { id: "rest-day", icon: "🌿", title: "Rest is a skill", hint: "Clear a rest day's moves" },
  { id: "all-habits", icon: "✨", title: "Every box ticked", hint: "Tick every habit in one day" },
  { id: "high-score", icon: "⚡", title: "High score", hint: "Lift more than your best on any move" },
  { id: "week-star", icon: "🎉", title: "Star week", hint: "Have 3 good days in one week" },
  { id: "boss", icon: "🎯", title: "Boss down", hint: "Beat a weekly boss" },
  { id: "level-5", icon: "🌱", title: "Level 5", hint: "Reach level 5" },
];

// Habit ticks across every loaded date. DB.historyHabits is the full record once
// history has loaded; before that (and in tests) the per-week cache stands in.
function habitKeySet() {
  if (DB.historyHabits) return DB.historyHabits;
  return new Set(Object.keys(DB.habitLogs));
}

function planDayForDate(date) {
  if (!DB.goal || !DB.plan) return null;
  const start = new Date(DB.goal.start_date + "T00:00:00");
  const days = Math.floor((new Date(date + "T00:00:00") - start) / 86400000);
  if (days < 0 || days >= DB.plan.weeks.length * 7) return null;
  return { weekIndex: Math.floor(days / 7), dayIndex: days % 7, day: DB.plan.weeks[Math.floor(days / 7)].days[days % 7] };
}

// One record per date: what was logged, and what it earned.
function buildDays() {
  const today = todayStr();
  const days = {};
  const get = (date) => (days[date] ||= { date, meals: new Set(), mealCount: 0, photos: 0, habits: 0, sets: [] });
  const history = DB.history || { meals: [], sets: [] };

  history.meals.forEach((m) => { if (m.log_date < today) addMeal(get(m.log_date), m); });
  DB.mealLogs.forEach((m) => addMeal(get(today), m));
  history.sets.forEach((s) => { if (s.log_date < today) get(s.log_date).sets.push(s); });
  DB.setLogs.forEach((s) => get(today).sets.push({ ...s, log_date: today }));
  habitKeySet().forEach((key) => {
    const [date, id] = key.split("|");
    if (habitDefs.some((h) => h.id === id)) get(date).habits++;
  });

  Object.values(days).forEach((d) => {
    const pd = planDayForDate(d.date);
    d.planDay = pd;
    if (pd) {
      const slots = pd.day.ex;
      const totalSets = slots.reduce((sum, s) => sum + (Number(s.sets) || 0), 0);
      d.cleared = slots.length > 0 && slots.every((slot) => d.sets.filter((s) => s.exercise_id === slot.exerciseId).length >= slot.sets);
      d.setXpCount = Math.min(d.sets.length, totalSets);
      d.isRest = pd.day.type === "rest";
    } else {
      d.cleared = false; d.setXpCount = d.sets.length; d.isRest = false;
    }
    d.xp = d.meals.size * XP.meal + d.habits * XP.habit + d.setXpCount * XP.set + (d.cleared ? XP.workout : 0);
    // A good day: you showed up for at least two of the three quests.
    d.good = [d.meals.size > 0, d.habits > 0, d.sets.length > 0].filter(Boolean).length >= 2;
  });
  return days;
}
function addMeal(day, m) {
  if (m.meal_type !== "snack") day.meals.add(m.meal_type);
  day.mealCount++;
  if (m.photo_path) day.photos++;
}

// The whole game state, worked out fresh on every render.
function gameState() {
  if (!DB.goal || !DB.plan) return null;
  const today = todayStr();
  const days = buildDays();
  const list = Object.values(days);
  const lifetimeXp = list.reduce((sum, d) => sum + d.xp, 0);
  const lv = levelFor(lifetimeXp);

  // Weeks of the current quest, up to this one.
  const weeks = [];
  for (let w = 0; w <= DB.todayWeekIndex && w < DB.plan.weeks.length; w++) {
    const dates = weekDates(DB.goal, w);
    const goodDays = dates.filter((date) => date <= today && days[date] && days[date].good).length;
    const trainingDays = DB.plan.weeks[w].days.map((day, i) => ({ day, date: dates[i] })).filter((x) => x.day.type === "training");
    const bossNeed = Math.min(BOSS_WORKOUTS, trainingDays.length);
    const bossDone = trainingDays.filter((x) => x.date <= today && days[x.date] && days[x.date].cleared).length;
    weeks.push({ weekIndex: w, dates, goodDays, star: goodDays >= STAR_DAYS_PER_WEEK, bossNeed, bossDone: Math.min(bossDone, bossNeed), bossBeaten: bossNeed > 0 && bossDone >= bossNeed });
  }
  const thisWeek = weeks[weeks.length - 1] || { dates: weekDates(DB.goal, 0), goodDays: 0, star: false, bossNeed: 0, bossDone: 0, bossBeaten: false };

  // Personal bests, in date order: a set heavier than every earlier day's sets on that move.
  const best = {};
  let highScores = 0;
  list.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((d) => {
    const dayMax = {};
    d.sets.forEach((s) => { const w = Number(s.weight_kg) || 0; if (w > (dayMax[s.exercise_id] || 0)) dayMax[s.exercise_id] = w; });
    Object.entries(dayMax).forEach(([id, w]) => {
      if (best[id] && w > best[id]) highScores++;
      best[id] = Math.max(best[id] || 0, w);
    });
  });

  const photos = list.reduce((sum, d) => sum + d.photos, 0);
  const earned = {
    "first-meal": list.some((d) => d.mealCount > 0),
    "full-plate": list.some((d) => d.meals.size === 3),
    "photo-10": photos >= 10,
    "first-workout": list.some((d) => d.cleared && !d.isRest),
    "rest-day": list.some((d) => d.cleared && d.isRest),
    "all-habits": list.some((d) => d.habits >= habitDefs.length),
    "high-score": highScores > 0,
    "week-star": weeks.some((w) => w.star),
    boss: weeks.some((w) => w.bossBeaten),
    "level-5": lv.level >= 5,
  };

  return {
    today: days[today] || { xp: 0, good: false },
    lifetimeXp, ...lv,
    weeks, thisWeek, days,
    starsCollected: weeks.filter((w) => w.star).length,
    badges: BADGES.map((b) => ({ ...b, earned: !!earned[b.id] })),
  };
}

// Heaviest weight ever lifted on a move, before the set being logged now.
function bestWeightFor(exerciseId) {
  const rows = (DB.history ? DB.history.sets.filter((s) => s.log_date < todayStr()) : []).concat(DB.setLogs);
  return rows.filter((s) => s.exercise_id === exerciseId).reduce((max, s) => Math.max(max, Number(s.weight_kg) || 0), 0);
}
