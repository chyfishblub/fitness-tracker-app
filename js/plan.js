/* ============================================================
   plan.js — turns a `goal` row into a concrete weekly schedule.
   Plans are never stored pre-computed: generatePlan() rebuilds
   them from the goal's (template_id, duration_weeks) every time,
   and applyOverrides() layers personal swap/adjust on top. See
   docs/REFERENCE.md §3.
   ============================================================ */

// weeks: array of { weekIndex, isPeak, days: [ {day,focus,type,color,note,ex:[{slot,exerciseId,sets,reps,rest}]} ] }
function generatePlan(goal) {
  const template = PLAN_TEMPLATES[goal.template_id] || PLAN_TEMPLATES.consistency;
  const totalWeeks = Math.max(1, goal.duration_weeks || 1);
  const peakWeeks = template.hasPeakWeek && goal.target_date ? 1 : 0;
  const regularWeeks = Math.max(0, totalWeeks - peakWeeks);

  const weeks = [];
  for (let w = 0; w < regularWeeks; w++) {
    weeks.push({ weekIndex: w, isPeak: false, days: cloneWeek(template.week) });
  }
  if (peakWeeks) {
    weeks.push({ weekIndex: weeks.length, isPeak: true, days: cloneWeek(template.peakWeek) });
  }
  if (!weeks.length) weeks.push({ weekIndex: 0, isPeak: false, days: cloneWeek(template.week) });

  return { template, weeks };
}

function cloneWeek(week) {
  return week.map((day) => ({
    ...day,
    ex: day.ex.map((slot, i) => ({ slot: i, ...slot })),
  }));
}

// Layers workout_overrides rows onto a generated plan's weeks. Non-mutating.
function applyOverrides(weeks, overrides) {
  if (!overrides || !overrides.length) return weeks;
  const byKey = {};
  overrides.forEach((o) => { byKey[`${o.week}-${o.day}-${o.slot}`] = o; });

  return weeks.map((week) => ({
    ...week,
    days: week.days.map((day, di) => ({
      ...day,
      ex: day.ex
        .map((slot) => {
          const o = byKey[`${week.weekIndex}-${di}-${slot.slot}`];
          if (!o) return slot;
          if (o.removed) return null;
          return {
            ...slot,
            exerciseId: o.exercise_id || slot.exerciseId,
            sets: o.sets != null ? o.sets : slot.sets,
            reps: o.reps || slot.reps,
            rest: o.rest || slot.rest,
          };
        })
        .filter(Boolean),
    })),
  }));
}

// Which week/day of the plan corresponds to a given date, based on goal.start_date.
function getWeekDayForDate(goal, plan, dateStr) {
  const start = new Date(goal.start_date + "T00:00:00");
  const target = new Date(dateStr + "T00:00:00");
  const daysSince = Math.max(0, Math.floor((target - start) / 86400000));
  const totalDays = plan.weeks.length * 7;
  const clamped = Math.min(daysSince, totalDays - 1);
  return { weekIndex: Math.floor(clamped / 7), dayIndex: clamped % 7 };
}

function getMealsForDay(template, week, day, dayIndex) {
  if (week.isPeak) return template.getMeals(true, dayIndex);
  return dietForDay(day.type);
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const ms = new Date(dateStr + "T00:00:00") - new Date(new Date().toDateString());
  return Math.max(0, Math.ceil(ms / 86400000));
}

// Resolves which named meal (breakfast/lunch/dinner) should be highlighted right now.
function currentMealWindow(now) {
  now = now || new Date();
  const hm = now.getHours() * 60 + now.getMinutes();
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  for (const [key, w] of Object.entries(MEAL_WINDOWS)) {
    if (hm >= toMin(w.start) && hm < toMin(w.end)) return key;
  }
  // Outside all windows: point at whichever named meal is next, or dinner if the day is done.
  const order = ["breakfast", "lunch", "dinner"];
  for (const key of order) {
    if (hm < toMin(MEAL_WINDOWS[key].start)) return key;
  }
  return "dinner";
}
