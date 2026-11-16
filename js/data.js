/* ============================================================
   data.js — the building blocks a plan is generated FROM:
   the exercise library (with swap alternatives), the weekly
   workout/diet templates, habits, and guide content. Nothing
   in here is a user's actual plan — js/plan.js turns these
   into one, parameterized by a goal's template/duration/level.
   See docs/REFERENCE.md §3 before editing this file.
   ============================================================ */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MEAL_WINDOWS = {
  breakfast: { start: "07:00", end: "09:00" },
  lunch: { start: "12:00", end: "15:00" },
  dinner: { start: "18:00", end: "20:00" },
};

// ---------- exercise library ----------
// Every exercise a plan can reference. `alternatives` powers the swap picker —
// keep it bidirectional (if A lists B, B should list A) within a muscle group.
const EXERCISES = {
  benchPress: { id: "benchPress", name: "Barbell Bench Press", muscle: "chest", alternatives: ["inclineDbPress", "pushUps"] },
  inclineDbPress: { id: "inclineDbPress", name: "Incline DB Press", muscle: "chest", alternatives: ["benchPress", "pushUps"] },
  inclineDbFlyes: { id: "inclineDbFlyes", name: "Incline DB Flyes", muscle: "chest", alternatives: ["cableFlyes", "pushUps"] },
  cableFlyes: { id: "cableFlyes", name: "Cable Flyes", muscle: "chest", alternatives: ["inclineDbFlyes", "benchPress"] },
  pushUps: { id: "pushUps", name: "Push-Ups", muscle: "chest", alternatives: ["benchPress", "inclineDbPress"] },

  dbShoulderPress: { id: "dbShoulderPress", name: "DB Shoulder Press", muscle: "shoulders", alternatives: ["arnoldPress", "machineShoulderPress"] },
  arnoldPress: { id: "arnoldPress", name: "Arnold Press", muscle: "shoulders", alternatives: ["dbShoulderPress", "machineShoulderPress"] },
  machineShoulderPress: { id: "machineShoulderPress", name: "Machine Shoulder Press", muscle: "shoulders", alternatives: ["dbShoulderPress", "arnoldPress"] },
  lateralRaises: { id: "lateralRaises", name: "Lateral Raises", muscle: "shoulders", alternatives: ["cableLateralRaise"] },
  cableLateralRaise: { id: "cableLateralRaise", name: "Cable Lateral Raise", muscle: "shoulders", alternatives: ["lateralRaises"] },

  tricepPushdown: { id: "tricepPushdown", name: "Tricep Rope Pushdown", muscle: "triceps", alternatives: ["tricepDips", "skullCrushers"] },
  tricepDips: { id: "tricepDips", name: "Tricep Dips", muscle: "triceps", alternatives: ["tricepPushdown", "skullCrushers"] },
  skullCrushers: { id: "skullCrushers", name: "Skull Crushers", muscle: "triceps", alternatives: ["tricepPushdown", "tricepDips"] },

  plank: { id: "plank", name: "Plank Hold", muscle: "core", alternatives: ["deadBug", "hangingLegRaise"] },
  deadBug: { id: "deadBug", name: "Dead Bug", muscle: "core", alternatives: ["plank", "russianTwist"] },
  hangingLegRaise: { id: "hangingLegRaise", name: "Hanging Leg Raises", muscle: "core", alternatives: ["plank", "russianTwist"] },
  russianTwist: { id: "russianTwist", name: "Russian Twists", muscle: "core", alternatives: ["deadBug", "hangingLegRaise"] },

  backSquat: { id: "backSquat", name: "Barbell Back Squat", muscle: "quads", alternatives: ["gobletSquat", "legPress"] },
  gobletSquat: { id: "gobletSquat", name: "Goblet Squat", muscle: "quads", alternatives: ["backSquat", "legPress"] },
  legPress: { id: "legPress", name: "Leg Press", muscle: "quads", alternatives: ["backSquat", "gobletSquat"] },
  walkingLunges: { id: "walkingLunges", name: "Walking Lunges", muscle: "quads", alternatives: ["bulgarianSplitSquat"] },
  bulgarianSplitSquat: { id: "bulgarianSplitSquat", name: "Bulgarian Split Squat", muscle: "quads", alternatives: ["walkingLunges"] },

  romanianDeadlift: { id: "romanianDeadlift", name: "Romanian Deadlift", muscle: "hamstrings", alternatives: ["legCurl", "sumoDeadlift"] },
  legCurl: { id: "legCurl", name: "Leg Curl", muscle: "hamstrings", alternatives: ["romanianDeadlift"] },
  sumoDeadlift: { id: "sumoDeadlift", name: "Sumo Deadlift", muscle: "hamstrings", alternatives: ["romanianDeadlift"] },

  hipThrust: { id: "hipThrust", name: "Hip Thrust", muscle: "glutes", alternatives: ["gluteBridge", "cableKickback"] },
  gluteBridge: { id: "gluteBridge", name: "Glute Bridge", muscle: "glutes", alternatives: ["hipThrust", "cableKickback"] },
  cableKickback: { id: "cableKickback", name: "Cable Kickbacks", muscle: "glutes", alternatives: ["hipThrust", "gluteBridge"] },

  calfRaises: { id: "calfRaises", name: "Calf Raises", muscle: "calves", alternatives: ["seatedCalfRaise"] },
  seatedCalfRaise: { id: "seatedCalfRaise", name: "Seated Calf Raise", muscle: "calves", alternatives: ["calfRaises"] },

  latPulldown: { id: "latPulldown", name: "Lat Pulldown", muscle: "back", alternatives: ["pullUps", "seatedCableRow"] },
  pullUps: { id: "pullUps", name: "Pull-Ups", muscle: "back", alternatives: ["latPulldown", "seatedCableRow"] },
  seatedCableRow: { id: "seatedCableRow", name: "Seated Cable Row", muscle: "back", alternatives: ["bentOverRow", "latPulldown"] },
  bentOverRow: { id: "bentOverRow", name: "Bent-Over Barbell Row", muscle: "back", alternatives: ["seatedCableRow"] },
  facePulls: { id: "facePulls", name: "Face Pulls", muscle: "rear-delts", alternatives: ["reverseFlyes"] },
  reverseFlyes: { id: "reverseFlyes", name: "Reverse Flyes", muscle: "rear-delts", alternatives: ["facePulls"] },

  dbBicepCurl: { id: "dbBicepCurl", name: "DB Bicep Curls", muscle: "biceps", alternatives: ["hammerCurl", "cableCurl"] },
  hammerCurl: { id: "hammerCurl", name: "Hammer Curls", muscle: "biceps", alternatives: ["dbBicepCurl", "cableCurl"] },
  cableCurl: { id: "cableCurl", name: "Cable Curls", muscle: "biceps", alternatives: ["dbBicepCurl", "hammerCurl"] },

  kettlebellSwings: { id: "kettlebellSwings", name: "Kettlebell Swings", muscle: "cardio", alternatives: ["battleRopes"] },
  boxJumps: { id: "boxJumps", name: "Box Jumps / Step-ups", muscle: "cardio", alternatives: ["burpees"] },
  battleRopes: { id: "battleRopes", name: "Battle Ropes", muscle: "cardio", alternatives: ["kettlebellSwings"] },
  burpees: { id: "burpees", name: "Burpees", muscle: "cardio", alternatives: ["boxJumps"] },
  inclineWalk: { id: "inclineWalk", name: "Incline Walk", muscle: "cardio", alternatives: ["lightWalk"] },
  lightWalk: { id: "lightWalk", name: "Light Walk", muscle: "recovery", alternatives: ["inclineWalk", "walkOutdoors"] },
  longWalk: { id: "longWalk", name: "Long Walk", muscle: "recovery", alternatives: ["lightWalk"] },
  gentleWalk: { id: "gentleWalk", name: "Gentle Walk", muscle: "recovery", alternatives: ["lightWalk"] },
  foamRolling: { id: "foamRolling", name: "Foam Rolling / Stretch", muscle: "recovery", alternatives: ["gentleYoga"] },
  gentleYoga: { id: "gentleYoga", name: "Gentle Yoga / Stretch", muscle: "recovery", alternatives: ["foamRolling", "walkOutdoors"] },
  walkOutdoors: { id: "walkOutdoors", name: "Walk Outdoors", muscle: "recovery", alternatives: ["lightWalk", "gentleYoga"] },
  fullBodyCircuit: { id: "fullBodyCircuit", name: "Full-Body Circuit (pump, not max effort)", muscle: "fullbody", alternatives: [] },
};

// ---------- weekly workout template ----------
// One repeating training week. `slot` index within a day is stable — it's what
// workout_overrides key against, so don't reorder exercises within a day.
const WORKOUT_WEEK = [
  { day: "Day 1", focus: "Upper Push + Core", type: "training", color: "var(--red)", ex: [
    { exerciseId: "benchPress", sets: 4, reps: "8-10", rest: "90s" },
    { exerciseId: "dbShoulderPress", sets: 3, reps: "10-12", rest: "60s" },
    { exerciseId: "inclineDbFlyes", sets: 3, reps: "12", rest: "60s" },
    { exerciseId: "lateralRaises", sets: 3, reps: "15", rest: "45s" },
    { exerciseId: "tricepPushdown", sets: 3, reps: "12-15", rest: "45s" },
    { exerciseId: "plank", sets: 3, reps: "45s", rest: "30s" },
  ]},
  { day: "Day 2", focus: "Lower Strength", type: "training", color: "var(--blue)", ex: [
    { exerciseId: "backSquat", sets: 4, reps: "8-10", rest: "120s" },
    { exerciseId: "romanianDeadlift", sets: 4, reps: "10", rest: "90s" },
    { exerciseId: "walkingLunges", sets: 3, reps: "12 each", rest: "60s" },
    { exerciseId: "legPress", sets: 3, reps: "12", rest: "60s" },
    { exerciseId: "legCurl", sets: 3, reps: "12-15", rest: "45s" },
    { exerciseId: "calfRaises", sets: 4, reps: "15", rest: "30s" },
  ]},
  { day: "Day 3", focus: "Upper Pull + Arms", type: "training", color: "var(--purple)", ex: [
    { exerciseId: "latPulldown", sets: 4, reps: "10-12", rest: "60s" },
    { exerciseId: "seatedCableRow", sets: 4, reps: "10-12", rest: "60s" },
    { exerciseId: "facePulls", sets: 3, reps: "15", rest: "45s" },
    { exerciseId: "dbBicepCurl", sets: 3, reps: "12", rest: "45s" },
    { exerciseId: "hammerCurl", sets: 3, reps: "12", rest: "45s" },
    { exerciseId: "reverseFlyes", sets: 3, reps: "15", rest: "45s" },
  ]},
  { day: "Day 4", focus: "Rest / Recovery", type: "rest", color: "var(--grey)", ex: [
    { exerciseId: "lightWalk", sets: 1, reps: "30min", rest: "-" },
    { exerciseId: "foamRolling", sets: 1, reps: "15min", rest: "-" },
  ]},
  { day: "Day 5", focus: "Glutes & Legs + Core", type: "training", color: "var(--orange)", ex: [
    { exerciseId: "hipThrust", sets: 4, reps: "10-12", rest: "90s" },
    { exerciseId: "bulgarianSplitSquat", sets: 3, reps: "10 each", rest: "60s" },
    { exerciseId: "sumoDeadlift", sets: 4, reps: "8-10", rest: "90s" },
    { exerciseId: "cableKickback", sets: 3, reps: "15 each", rest: "45s" },
    { exerciseId: "hangingLegRaise", sets: 3, reps: "12", rest: "45s" },
    { exerciseId: "russianTwist", sets: 3, reps: "20", rest: "30s" },
  ]},
  { day: "Day 6", focus: "HIIT + Cardio", type: "training", color: "#EC4899", ex: [
    { exerciseId: "kettlebellSwings", sets: 4, reps: "15", rest: "30s" },
    { exerciseId: "boxJumps", sets: 3, reps: "12", rest: "30s" },
    { exerciseId: "battleRopes", sets: 3, reps: "30s", rest: "30s" },
    { exerciseId: "burpees", sets: 3, reps: "10", rest: "30s" },
    { exerciseId: "inclineWalk", sets: 1, reps: "15min", rest: "-" },
  ]},
  { day: "Day 7", focus: "Full Rest", type: "rest", color: "var(--grey)", ex: [
    { exerciseId: "gentleYoga", sets: 1, reps: "20min", rest: "-" },
    { exerciseId: "walkOutdoors", sets: 1, reps: "30min", rest: "-" },
  ]},
];

// Final week of the "lean-peak" template: lighter training, carb/water manipulation.
const PEAK_WORKOUT_WEEK = [
  { day: "Day 1", focus: "Upper (moderate)", type: "training", color: "var(--red)", ex: [
    { exerciseId: "benchPress", sets: 3, reps: "10", rest: "60s" },
    { exerciseId: "dbShoulderPress", sets: 3, reps: "12", rest: "60s" },
    { exerciseId: "latPulldown", sets: 3, reps: "12", rest: "60s" },
    { exerciseId: "cableCurl", sets: 3, reps: "12", rest: "45s" },
    { exerciseId: "tricepPushdown", sets: 3, reps: "12", rest: "45s" },
  ]},
  { day: "Day 2", focus: "Lower (moderate)", type: "training", color: "var(--blue)", ex: [
    { exerciseId: "gobletSquat", sets: 3, reps: "12", rest: "60s" },
    { exerciseId: "romanianDeadlift", sets: 3, reps: "10", rest: "60s" },
    { exerciseId: "hipThrust", sets: 3, reps: "12", rest: "60s" },
    { exerciseId: "calfRaises", sets: 3, reps: "15", rest: "30s" },
  ]},
  { day: "Day 3", focus: "Full Body Pump", type: "training", color: "var(--purple)", ex: [
    { exerciseId: "fullBodyCircuit", sets: 3, reps: "circuit", rest: "45s" },
  ]},
  { day: "Day 4", focus: "Steps + Walk only", type: "rest", color: "var(--grey)", ex: [
    { exerciseId: "longWalk", sets: 1, reps: "45min", rest: "-" },
  ]},
  { day: "Day 5", focus: "Light Full Body", type: "training", color: "var(--orange)", ex: [
    { exerciseId: "fullBodyCircuit", sets: 3, reps: "circuit", rest: "45s" },
    { exerciseId: "russianTwist", sets: 3, reps: "15", rest: "30s" },
  ]},
  { day: "Day 6", focus: "Rest — carb up starts", type: "rest", color: "var(--green)", ex: [
    { exerciseId: "gentleWalk", sets: 1, reps: "20min", rest: "-" },
  ], note: "Switch to carb-refill meals from today." },
  { day: "Day 7", focus: "Peak Day", type: "rest", color: "var(--green)", ex: [],
    note: "Final level. You did the work. Go enjoy it. ✈️" },
];

// ---------- diet templates ----------
const trainingMeals = { label: "Training Day (~1500 kcal)", protein: "125g", carbs: "130g", fat: "50g", meals: [
  { time: "7:30 AM", name: "Breakfast", desc: "2 whole eggs + 3 egg whites, 1 slice whole grain toast, 1/2 avocado", cals: 350, p: 30, c: 22, f: 18 },
  { time: "10:30 AM", name: "Snack", desc: "Greek yogurt (150g) + 10 almonds + 1/2 cup berries", cals: 180, p: 15, c: 14, f: 8 },
  { time: "1:00 PM", name: "Lunch", desc: "150g chicken breast / fish, 1 cup brown rice, stir-fried veggies + 1 tsp olive oil", cals: 420, p: 40, c: 45, f: 10 },
  { time: "4:00 PM", name: "Pre-workout", desc: "1 banana + 1 scoop whey protein", cals: 200, p: 25, c: 27, f: 2 },
  { time: "7:30 PM", name: "Dinner", desc: "150g salmon / lean beef, sweet potato (100g), large salad", cals: 350, p: 35, c: 20, f: 14 },
]};
const restMeals = { label: "Rest Day (~1350 kcal)", protein: "125g", carbs: "90g", fat: "55g", meals: [
  { time: "8:00 AM", name: "Breakfast", desc: "Overnight oats: 40g oats + 1 scoop protein + chia + almond milk", cals: 320, p: 28, c: 35, f: 10 },
  { time: "11:00 AM", name: "Snack", desc: "2 boiled eggs + cucumber + hummus (2 tbsp)", cals: 200, p: 15, c: 8, f: 13 },
  { time: "1:30 PM", name: "Lunch", desc: "Tuna salad bowl: 1 can tuna, greens, cherry tomatoes, olive oil & vinegar", cals: 350, p: 38, c: 18, f: 14 },
  { time: "4:00 PM", name: "Snack", desc: "Protein shake + 1 tbsp peanut butter", cals: 180, p: 22, c: 6, f: 9 },
  { time: "7:00 PM", name: "Dinner", desc: "Chicken / tofu stir-fry, light soy, cauliflower rice", cals: 300, p: 32, c: 15, f: 12 },
]};
const peakLow = { label: "Peak Days 1-5 (~1400 kcal, lower carb, high water)", protein: "130g", carbs: "70g", fat: "55g", meals: [
  { time: "7:30 AM", name: "Breakfast", desc: "3 whole eggs + 2 whites, sauteed spinach & mushroom, 1/4 avocado", cals: 330, p: 28, c: 8, f: 22 },
  { time: "10:30 AM", name: "Snack", desc: "Greek yogurt (150g) + 8 almonds (skip berries this week)", cals: 160, p: 16, c: 8, f: 8 },
  { time: "1:00 PM", name: "Lunch", desc: "180g chicken / fish, big plate greens & veg, 1 tsp olive oil (no rice)", cals: 340, p: 45, c: 12, f: 12 },
  { time: "4:00 PM", name: "Snack", desc: "1 scoop whey protein with water", cals: 130, p: 25, c: 3, f: 1 },
  { time: "7:00 PM", name: "Dinner", desc: "180g salmon / lean beef, large salad, steamed broccoli", cals: 360, p: 40, c: 10, f: 18 },
]};
const peakRefill = { label: "Peak Days 6-7 (~1500 kcal, carbs UP, sodium/water DOWN)", protein: "120g", carbs: "170g", fat: "40g", meals: [
  { time: "7:30 AM", name: "Breakfast", desc: "Oats (50g) + 1 scoop protein + banana + honey drizzle", cals: 380, p: 28, c: 55, f: 6 },
  { time: "10:30 AM", name: "Snack", desc: "Rice cakes (2) + 1 tbsp jam + protein shake", cals: 240, p: 22, c: 34, f: 2 },
  { time: "1:00 PM", name: "Lunch", desc: "150g chicken, 1.5 cups white rice, veggies (LOW salt, no soy sauce)", cals: 460, p: 38, c: 62, f: 6 },
  { time: "4:00 PM", name: "Snack", desc: "1 banana + small handful dried fruit", cals: 150, p: 2, c: 36, f: 0 },
  { time: "7:00 PM", name: "Dinner", desc: "120g white fish, sweet potato (150g), steamed veg — herbs not salt", cals: 320, p: 30, c: 35, f: 6 },
]};

// ---------- plan templates ----------
// A goal's `template_id` picks one of these. `hasPeakWeek` templates append
// PEAK_WORKOUT_WEEK as the final week when the goal has a target_date.
const PLAN_TEMPLATES = {
  "lean-peak": {
    id: "lean-peak", label: "Lean & Peak (event-based)", hasPeakWeek: true,
    week: WORKOUT_WEEK, peakWeek: PEAK_WORKOUT_WEEK,
    getMeals: (isPeak, dayIndex) => {
      if (!isPeak) return null; // resolved per-day training/rest below
      return dayIndex >= 5 ? peakRefill : peakLow;
    },
  },
  "consistency": {
    id: "consistency", label: "Consistency (ongoing)", hasPeakWeek: false,
    week: WORKOUT_WEEK, peakWeek: null,
    getMeals: () => null,
  },
};
function dietForDay(dayType) { return dayType === "rest" ? restMeals : trainingMeals; }

// ---------- habits ----------
// Labels are what people read; ids are stored in habit_logs, so never rename an id.
// Keep this list to three at most: a short list gets ticked, a long one gets skipped.
const habitDefs = [
  { id: "sleep", label: "Sleep 7+ hours", icon: "😴" },
  { id: "steps", label: "Walk 8,000 steps", icon: "👟" },
];
// Habits that used to be on the list. Their old ticks still count for XP in game.js.
const retiredHabitIds = ["protein", "water", "nosnack"];

// ---------- guide ----------
const guideSections = [
  { title: "Power-up 1: Protein, 120g a day", color: "var(--red)", items: [
    "1 scoop of whey is about 25g. Two shakes get you to 50g.",
    "A palm of chicken or fish is about 30g. Two palms a day is 60g.",
    "3 eggs are about 18g. A tub of Greek yogurt is about 15g.",
    "Hit 120g and the rest of the day gets easier."]},
  { title: "Power-up 2: Eating out in Malaysia", color: "var(--orange)", items: [
    "Chicken rice: breast, skin off, half rice",
    "Yong tau foo: soup, load up on tofu, egg and veg",
    "Economy rice: steamed fish, egg, veg and a small scoop of rice",
    "Nasi campur: pick protein first, add ulam, sambal sikit",
    "Teh tarik and kuih are treats, not meals. Enjoy them on purpose."]},
  { title: "Power-up 3: Peak week, the final 7 days", color: "var(--green)", items: [
    "Days 1-5: fewer carbs, 3L+ of water, lighter training",
    "Days 6-7: carbs back up, less added salt and soy, normal water",
    "This fills your muscles and drops water puffiness",
    "It's water, not fat. The scale will bounce, and that's fine.",
    "You'll feel your strongest on the day you fly"]},
  { title: "Power-up 4: Feeling stuck?", color: "var(--purple)", items: [
    "First check: are you really hitting 120g protein most days?",
    "Second: are you sleeping 7+ hours? Short sleep stalls progress.",
    "Third: under 8,000 steps? Add one daily walk.",
    "Don't eat less to break a stall. You'll lose muscle. Fix the three above first.",
    "Stuck for 3 months? A dietitian can find the real cause."]},
];
