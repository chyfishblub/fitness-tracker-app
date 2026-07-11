/* ============================================================
   data.js — the PLAN itself, separated from the app logic.
   This is lesson #2: keep DATA apart from CODE. When you want
   to tweak a meal or add an exercise, you edit here and never
   touch app.js. These are plain global variables (no build tools
   needed) so the app still runs by double-clicking index.html.
   ============================================================ */

const TOTAL_WEEKS = 5;
const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const TRIP_DATE = "2026-08-06T00:00:00";   // change this if your trip moves
const isPeak = (w) => w === 4;             // week 5 (index 4) is peak week

const START_WEIGHT = 60.0;
const GOAL_WEIGHT = 56.5;   // realistic lean target for Phuket — not a crash-diet 55.0

const weeklyTargets = [
  { focus: "Lock in protein + steps", note: "Dial in the deficit. Scale may barely move — ignore it." },
  { focus: "Consistency compounds", note: "Fat loss starts showing. Trust the process." },
  { focus: "Push training intensity", note: "Add weight or reps. Protect that muscle." },
  { focus: "Final full week", note: "Tighten everything. Sleep is non-negotiable now." },
  { focus: "PEAK WEEK ✈️", note: "Look your leanest for Phuket. Carb + water manipulation." },
];

const trainingMeals = { label: "Training Day (~1500 kcal)", protein: "125g", carbs: "130g", fat: "50g", meals: [
  { time:"7:30 AM", name:"Breakfast", desc:"2 whole eggs + 3 egg whites, 1 slice whole grain toast, 1/2 avocado", cals:350, p:30,c:22,f:18 },
  { time:"10:30 AM", name:"Snack", desc:"Greek yogurt (150g) + 10 almonds + 1/2 cup berries", cals:180, p:15,c:14,f:8 },
  { time:"1:00 PM", name:"Lunch", desc:"150g chicken breast / fish, 1 cup brown rice, stir-fried veggies + 1 tsp olive oil", cals:420, p:40,c:45,f:10 },
  { time:"4:00 PM", name:"Pre-workout", desc:"1 banana + 1 scoop whey protein", cals:200, p:25,c:27,f:2 },
  { time:"7:30 PM", name:"Dinner", desc:"150g salmon / lean beef, sweet potato (100g), large salad", cals:350, p:35,c:20,f:14 },
]};
const restMeals = { label: "Rest Day (~1350 kcal)", protein:"125g", carbs:"90g", fat:"55g", meals: [
  { time:"8:00 AM", name:"Breakfast", desc:"Overnight oats: 40g oats + 1 scoop protein + chia + almond milk", cals:320, p:28,c:35,f:10 },
  { time:"11:00 AM", name:"Snack", desc:"2 boiled eggs + cucumber + hummus (2 tbsp)", cals:200, p:15,c:8,f:13 },
  { time:"1:30 PM", name:"Lunch", desc:"Tuna salad bowl: 1 can tuna, greens, cherry tomatoes, olive oil & vinegar", cals:350, p:38,c:18,f:14 },
  { time:"4:00 PM", name:"Snack", desc:"Protein shake + 1 tbsp peanut butter", cals:180, p:22,c:6,f:9 },
  { time:"7:00 PM", name:"Dinner", desc:"Chicken / tofu stir-fry, light soy, cauliflower rice", cals:300, p:32,c:15,f:12 },
]};
const peakLow = { label:"Peak Days 1-5 (~1400 kcal, lower carb, high water)", protein:"130g", carbs:"70g", fat:"55g", meals: [
  { time:"7:30 AM", name:"Breakfast", desc:"3 whole eggs + 2 whites, sauteed spinach & mushroom, 1/4 avocado", cals:330, p:28,c:8,f:22 },
  { time:"10:30 AM", name:"Snack", desc:"Greek yogurt (150g) + 8 almonds (skip berries this week)", cals:160, p:16,c:8,f:8 },
  { time:"1:00 PM", name:"Lunch", desc:"180g chicken / fish, big plate greens & veg, 1 tsp olive oil (no rice)", cals:340, p:45,c:12,f:12 },
  { time:"4:00 PM", name:"Snack", desc:"1 scoop whey protein with water", cals:130, p:25,c:3,f:1 },
  { time:"7:00 PM", name:"Dinner", desc:"180g salmon / lean beef, large salad, steamed broccoli", cals:360, p:40,c:10,f:18 },
]};
const peakRefill = { label:"Peak Days 6-7 (~1500 kcal, carbs UP, sodium/water DOWN)", protein:"120g", carbs:"170g", fat:"40g", meals: [
  { time:"7:30 AM", name:"Breakfast", desc:"Oats (50g) + 1 scoop protein + banana + honey drizzle", cals:380, p:28,c:55,f:6 },
  { time:"10:30 AM", name:"Snack", desc:"Rice cakes (2) + 1 tbsp jam + protein shake", cals:240, p:22,c:34,f:2 },
  { time:"1:00 PM", name:"Lunch", desc:"150g chicken, 1.5 cups white rice, veggies (LOW salt, no soy sauce)", cals:460, p:38,c:62,f:6 },
  { time:"4:00 PM", name:"Snack", desc:"1 banana + small handful dried fruit", cals:150, p:2,c:36,f:0 },
  { time:"7:00 PM", name:"Dinner", desc:"120g white fish, sweet potato (150g), steamed veg — herbs not salt", cals:320, p:30,c:35,f:6 },
]};
function getMeals(w, d, type) {
  if (!isPeak(w)) return type === "rest" ? restMeals : trainingMeals;
  return d >= 5 ? peakRefill : peakLow;
}

const workouts = [
  { day:"Day 1", focus:"Upper Push + Core", type:"training", color:"var(--red)", ex:[
    {n:"Barbell Bench Press",s:"4x8-10",r:"90s"},{n:"DB Shoulder Press",s:"3x10-12",r:"60s"},{n:"Incline DB Flyes",s:"3x12",r:"60s"},{n:"Lateral Raises",s:"3x15",r:"45s"},{n:"Tricep Rope Pushdown",s:"3x12-15",r:"45s"},{n:"Plank Hold",s:"3x45s",r:"30s"}]},
  { day:"Day 2", focus:"Lower Strength", type:"training", color:"var(--blue)", ex:[
    {n:"Barbell Back Squat",s:"4x8-10",r:"120s"},{n:"Romanian Deadlift",s:"4x10",r:"90s"},{n:"Walking Lunges",s:"3x12 each",r:"60s"},{n:"Leg Press",s:"3x12",r:"60s"},{n:"Leg Curl",s:"3x12-15",r:"45s"},{n:"Calf Raises",s:"4x15",r:"30s"}]},
  { day:"Day 3", focus:"Upper Pull + Arms", type:"training", color:"var(--purple)", ex:[
    {n:"Lat Pulldown",s:"4x10-12",r:"60s"},{n:"Seated Cable Row",s:"4x10-12",r:"60s"},{n:"Face Pulls",s:"3x15",r:"45s"},{n:"DB Bicep Curls",s:"3x12",r:"45s"},{n:"Hammer Curls",s:"3x12",r:"45s"},{n:"Reverse Flyes",s:"3x15",r:"45s"}]},
  { day:"Day 4", focus:"Rest / Recovery", type:"rest", color:"var(--grey)", ex:[
    {n:"Light walk (30 min)",s:"1x30min",r:"-"},{n:"Foam rolling / stretch",s:"15 min",r:"-"}]},
  { day:"Day 5", focus:"Glutes & Legs + Core", type:"training", color:"var(--orange)", ex:[
    {n:"Hip Thrust",s:"4x10-12",r:"90s"},{n:"Bulgarian Split Squat",s:"3x10 each",r:"60s"},{n:"Sumo Deadlift",s:"4x8-10",r:"90s"},{n:"Cable Kickbacks",s:"3x15 each",r:"45s"},{n:"Hanging Leg Raises",s:"3x12",r:"45s"},{n:"Russian Twists",s:"3x20",r:"30s"}]},
  { day:"Day 6", focus:"HIIT + Cardio", type:"training", color:"#EC4899", ex:[
    {n:"Kettlebell Swings",s:"4x15",r:"30s"},{n:"Box Jumps / Step-ups",s:"3x12",r:"30s"},{n:"Battle Ropes",s:"3x30s",r:"30s"},{n:"Burpees",s:"3x10",r:"30s"},{n:"Incline Walk",s:"15 min",r:"-"}]},
  { day:"Day 7", focus:"Full Rest", type:"rest", color:"var(--grey)", ex:[
    {n:"Gentle yoga / stretch",s:"20 min",r:"-"},{n:"Walk outdoors",s:"30 min",r:"-"}]},
];
const peakWorkouts = [
  { day:"Day 1", focus:"Upper (moderate)", type:"training", color:"var(--red)", ex:[
    {n:"Bench Press",s:"3x10",r:"60s"},{n:"DB Shoulder Press",s:"3x12",r:"60s"},{n:"Lat Pulldown",s:"3x12",r:"60s"},{n:"Cable Curls + Pushdowns",s:"3x12",r:"45s"}]},
  { day:"Day 2", focus:"Lower (moderate)", type:"training", color:"var(--blue)", ex:[
    {n:"Goblet Squat",s:"3x12",r:"60s"},{n:"Romanian Deadlift",s:"3x10",r:"60s"},{n:"Hip Thrust",s:"3x12",r:"60s"},{n:"Calf Raises",s:"3x15",r:"30s"}]},
  { day:"Day 3", focus:"Full Body Pump", type:"training", color:"var(--purple)", ex:[
    {n:"Circuit: light full-body",s:"3 rounds",r:"45s"},{n:"Focus on pump, not max effort",s:"—",r:"-"}]},
  { day:"Day 4", focus:"Steps + Walk only", type:"rest", color:"var(--grey)", ex:[
    {n:"Long walk",s:"45 min",r:"-"}]},
  { day:"Day 5", focus:"Light Full Body", type:"training", color:"var(--orange)", ex:[
    {n:"Bodyweight / light circuit",s:"3 rounds",r:"45s"},{n:"Ab work",s:"3x15",r:"30s"}]},
  { day:"Day 6", focus:"REST — carb up starts", type:"rest", color:"var(--green)", ex:[
    {n:"Gentle walk only",s:"20 min",r:"-"},{n:"Switch to carb-refill meals",s:"—",r:"-"}]},
  { day:"Day 7", focus:"FLY TO PHUKET ✈️", type:"rest", color:"var(--green)", ex:[
    {n:"You're peaked. Enjoy it.",s:"—",r:"-"}]},
];
const getWorkouts = (w) => isPeak(w) ? peakWorkouts : workouts;

const habitDefs = [
  {id:"protein",label:"120g protein",icon:"🍗"},
  {id:"water",label:"Water target",icon:"💧"},
  {id:"sleep",label:"7+ hrs sleep",icon:"😴"},
  {id:"steps",label:"8,000+ steps",icon:"👟"},
  {id:"nosnack",label:"No unplanned snacking",icon:"🙅"},
];

const guideSections = [
  { title:"The 120g Protein Playbook", color:"var(--red)", items:[
    "1 scoop whey = ~25g. Two shakes covers 50g easily.",
    "Palm of chicken/fish = ~30g. Two palms a day = 60g.",
    "3 eggs = ~18g. Greek yogurt tub = ~15g.",
    "Hit 120g and everything else gets easier."]},
  { title:"Malaysian Eating (in a deficit)", color:"var(--orange)", items:[
    "Chicken rice — breast, no skin, half rice",
    "Yong tau foo — soup, load tofu/egg/veg, skip fried",
    "Economy rice — steamed fish + egg + veg + small rice",
    "Nasi campur — protein-heavy, ulam, sambal sikit",
    "Avoid: teh tarik, fried sides, kuih — liquid & hidden cals"]},
  { title:"Peak Week (final 7 days)", color:"var(--green)", items:[
    "Days 1-5: lower carb, water 3L+, training light",
    "Days 6-7: carbs UP, cut added salt/soy, water normal",
    "This makes muscles full & drops water bloat",
    "Cosmetic, not fat loss — don't fear the scale",
    "You'll look tightest on departure day"]},
  { title:"If you stall", color:"var(--purple)", items:[
    "First: are you actually hitting 120g protein daily?",
    "Second: sleeping 7+ hrs? This blocks fat loss.",
    "Third: steps under 8k? Add a daily walk.",
    "Don't cut calories lower — you'll lose muscle. Fix above first.",
    "3 months stuck = worth seeing a dietitian for the real cause."]},
];
