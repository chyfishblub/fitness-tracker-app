/* ============================================================
   app.js — the LOGIC. It reads from data.js, keeps track of what
   you've tapped (state), draws the screen (render), and listens
   for taps (events). New in the project version: Backup export/
   import so you can move your data between laptop and phone.
   ============================================================ */

// ---------- STATE (saved in this browser via localStorage) ----------
const STORAGE_KEY = "fitnessTracker_app_v1";
function loadState() {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
  return { currentWeek:0, activeTab:"dashboard", selectedDay:0, proteinHit:{},
    weeklyWeights:Array(TOTAL_WEEKS).fill(""), completedWorkouts:{}, completedMeals:{}, completedHabits:{}, notes:{} };
}
let state = loadState();
function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {} }

// ---------- WEIGHT CHART (Chart.js, loaded via CDN in index.html) ----------
let weightChartInstance = null;
if (typeof Chart !== "undefined") {
  Chart.defaults.font.family = "'Nunito', -apple-system, sans-serif";
  Chart.defaults.font.weight = 700;
}

function daysToTrip() { return Math.max(0, Math.ceil((new Date(TRIP_DATE) - new Date()) / 86400000)); }
function totalProteinDays() { return Object.values(state.proteinHit).filter(Boolean).length; }

// ---------- BACKUP: export/import (bridges the no-sync gap) ----------
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fitness-tracker-backup.json";
  a.click();
  URL.revokeObjectURL(url);
}
function importData() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        state = JSON.parse(reader.result);
        save(); render();
        alert("Backup restored! ✅");
      } catch (err) { alert("That file couldn't be read. Make sure it's a backup export."); }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ---------- SMALL RENDER HELPERS ----------
function check(on, size) {
  size = size || 24;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" style="flex-shrink:0">
    <rect x="1.5" y="1.5" width="21" height="21" rx="7" stroke="${on?'var(--green)':'#E5E5E5'}" stroke-width="2.5" fill="${on?'var(--green)':'#fff'}"/>
    ${on?'<path d="M7 12l3.2 3.2L17 8.5" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>':''}
  </svg>`;
}
function weekSelector() {
  let h='<div class="row" style="gap:8px;overflow-x:auto;padding:2px 0 8px">';
  for (let i=0;i<TOTAL_WEEKS;i++) {
    const pk=i===4, cur=state.currentWeek===i;
    const base=pk?'var(--gold)':'var(--green)', sd=pk?'var(--gold-d)':'var(--green-d)';
    h+=`<button class="pill" data-act="week" data-v="${i}" style="min-width:56px;padding:10px 6px;font-size:13px;white-space:nowrap;
      ${cur?`background:${base};color:#fff;box-shadow:0 3px 0 ${sd}`:'background:#fff;color:var(--grey);border:2px solid var(--line)'}">${pk?'🏝️':'W'+(i+1)}</button>`;
  }
  return h+'</div>';
}
function dayTabs(W) {
  let h='<div class="row" style="gap:6px;overflow-x:auto;padding-bottom:4px">';
  W.forEach((wp,i)=>{
    const cur=state.selectedDay===i;
    h+=`<button class="pill" data-act="day" data-v="${i}" style="min-width:44px;padding:9px 4px;font-size:12px;
      ${cur?`background:${wp.color};color:#fff`:'background:var(--soft);color:var(--grey);border:2px solid var(--line)'}">${wp.day.replace('Day ','D')}</button>`;
  });
  return h+'</div>';
}
function sectionTitle(t){ return `<div style="font-size:13px;font-weight:900;color:var(--ink);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">${t}</div>`; }

// ---------- TAB: DASHBOARD ----------
function dashboard() {
  const start=START_WEIGHT, goal=GOAL_WEIGHT;
  const weighed=state.weeklyWeights.filter(w=>w!=="");
  const cur=weighed.length?weighed[weighed.length-1]:start;
  const lost=Math.max(0,start-parseFloat(cur)).toFixed(1);
  const days=daysToTrip();
  const pWeek=DAYS.filter((_,di)=>state.proteinHit[`${state.currentWeek}-${di}`]).length;
  const streak=totalProteinDays();
  const pk=isPeak(state.currentWeek);

  let h='<div style="display:flex;flex-direction:column;gap:16px">';

  h+=`<div style="background:var(--blue);border-radius:20px;padding:22px;text-align:center;box-shadow:0 4px 0 var(--blue-d)">
    <div style="font-size:12px;color:#fff;font-weight:800;letter-spacing:1px;opacity:0.9">✈️ PHUKET COUNTDOWN</div>
    <div style="font-size:56px;font-weight:900;color:#fff;line-height:1;margin-top:6px">${days}</div>
    <div style="font-size:14px;color:#fff;opacity:0.9;font-weight:800">days until August 6</div></div>`;

  h+=`<div style="background:#fff;border:2px solid var(--line);border-radius:20px;padding:18px">
    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:14px">
      <div><div style="font-size:12px;color:var(--orange);font-weight:900;letter-spacing:0.5px">DAILY PROTEIN STREAK</div>
      <div style="font-size:20px;font-weight:900;color:var(--ink)">Hit 120g every day 🍗</div></div>
      <div style="text-align:center;background:var(--orange);border-radius:16px;padding:8px 12px;box-shadow:0 3px 0 var(--orange-d)">
        <div style="font-size:26px;font-weight:900;color:#fff;line-height:1">🔥${streak}</div></div></div>
    <div style="font-size:12px;font-weight:800;color:var(--grey);margin-bottom:8px">Week ${pk?'PEAK':state.currentWeek+1} · ${pWeek}/7 days</div>
    <div class="row" style="gap:6px">`;
  DAYS.forEach((dn,di)=>{
    const on=state.proteinHit[`${state.currentWeek}-${di}`];
    h+=`<button class="streakNode" data-act="protein" data-d="${di}" style="flex:1;
      ${on?'background:var(--orange);color:#fff;box-shadow:0 3px 0 var(--orange-d)':'background:var(--soft);color:var(--grey);border:2px solid var(--line)'}">${on?'🔥':dn[0]}</button>`;
  });
  h+=`</div><div style="font-size:11px;color:var(--grey);margin-top:10px;font-weight:700;line-height:1.4">The one habit that decides how you look in Phuket. Keep the streak alive!</div></div>`;

  if (pk) {
    h+=`<div style="background:var(--green);border-radius:20px;padding:18px;box-shadow:0 4px 0 var(--green-d)">
      <div style="font-size:17px;font-weight:900;color:#fff">🏝️ Peak Week Protocol</div>
      <div style="font-size:12px;color:#fff;margin-top:8px;line-height:1.6;font-weight:700;opacity:0.95">
      <b>Days 1-5:</b> Lower carbs, water 3L+, training light.<br/>
      <b>Days 6-7:</b> Carbs back UP, cut salt & soy, water normal. Muscles refill, bloat drops — leanest & fullest.<br/>
      <b>This is cosmetic, not fat loss.</b> Scale may tick up on carb days — that's glycogen, exactly what you want.</div></div>`;
  }

  h+=`<div class="card">${sectionTitle("Track What You Control")}
    <div style="font-size:12px;color:var(--grey);margin-bottom:12px;font-weight:700">Scale's been stuck 3 months — so stop obsessing over it. Nail these and fat loss follows.</div>`;
  const ctrl=[["🍗","Protein 120g","Protects muscle in a deficit"],["👟","8,000+ steps","More weekly burn than any workout"],["😴","Sleep 7+ hrs","Poor sleep holds fat, loses muscle"],["🥗","~1,400-1,500 kcal","A real deficit, not a crash"],["🏋️","5 training days","Heavy upper body — your weak point"]];
  ctrl.forEach((r,i)=>{
    h+=`<div class="row" style="gap:12px;align-items:center;padding:9px 0;border-bottom:${i<4?'2px solid var(--line)':'none'}">
      <div style="font-size:22px">${r[0]}</div>
      <div><div style="font-size:14px;color:var(--ink);font-weight:800">${r[1]}</div>
      <div style="font-size:11px;color:var(--grey);font-weight:700">${r[2]}</div></div></div>`;
  });
  h+='</div>';

  h+=`<div class="card">${sectionTitle("Weight Trend")}
    <div style="position:relative;height:190px"><canvas id="weightChart"></canvas></div></div>`;

  h+=`<div class="card">${sectionTitle("Weekly Check-in")}
    <div style="font-size:12px;color:var(--grey);margin-bottom:12px;font-weight:700">Realistic landing: ~56-57 kg, but visibly leaner. Lost so far: <b style="color:var(--green)">${lost}kg</b></div>`;
  weeklyTargets.forEach((wt,i)=>{
    const filled=state.weeklyWeights[i];
    h+=`<div class="row" style="align-items:center;gap:10px;padding:8px 0;border-bottom:${i<4?'2px solid var(--line)':'none'}">
      <div style="width:48px;height:30px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;flex-shrink:0;
        ${filled?(i===4?'background:var(--gold);color:#fff':'background:var(--green);color:#fff'):'background:var(--soft);color:var(--grey);border:2px solid var(--line)'}">${i===4?'PEAK':'W'+(i+1)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;color:var(--ink);font-weight:800">${wt.focus}</div>
        <div style="font-size:10px;color:var(--grey);font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${wt.note}</div></div>
      <input type="number" step="0.1" placeholder="kg" value="${filled}" data-act="weight" data-w="${i}" style="width:56px;padding:8px;background:var(--soft);border:2px solid var(--line);border-radius:12px;color:var(--ink);font-size:13px;font-weight:900;text-align:center"/></div>`;
  });
  h+='</div>';

  h+=`<div style="background:#FFF4E5;border:2px solid var(--gold);border-radius:20px;padding:16px">
    <div style="font-size:14px;font-weight:900;color:var(--orange-d);margin-bottom:6px">💡 Real Talk</div>
    <div style="font-size:12px;color:var(--ink);line-height:1.6;font-weight:700">Your Feb 25 scan was your best-looking composition — at <b>64 kg</b>. The scale lies. Lean + strong + good posture beats a smaller number every time. Aim to look your best, not to hit ${GOAL_WEIGHT} exactly.</div></div>`;

  // Backup panel — the new bit
  h+=`<div class="card">${sectionTitle("Backup / Move Devices")}
    <div style="font-size:12px;color:var(--grey);margin-bottom:10px;font-weight:700">Your data lives in this browser only. Export a backup, then import it on your phone to carry your progress over.</div>
    <div class="row" style="gap:8px">
      <button class="btn3d" data-act="export" style="flex:1;padding:12px;font-size:13px;background:var(--green);--sd:var(--green-d)">⬇️ Export Backup</button>
      <button class="btn3d" data-act="import" style="flex:1;padding:12px;font-size:13px;background:var(--purple);--sd:var(--purple-d)">⬆️ Import Backup</button>
    </div></div>`;

  return h+'</div>';
}

function buildWeightChartData() {
  const labels = state.weeklyWeights.map((_,i) => isPeak(i) ? "Peak" : "W"+(i+1));
  const weighIns = state.weeklyWeights.map(w => w === "" ? null : parseFloat(w));
  return {
    labels,
    datasets: [
      {
        label: "Weigh-in",
        data: weighIns,
        spanGaps: false,
        borderColor: "#58CC02",
        backgroundColor: "#58CC02",
        pointBackgroundColor: "#58CC02",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8,
        borderWidth: 3,
        tension: 0.3
      },
      {
        label: `Target (~${GOAL_WEIGHT}kg)`,
        data: Array(TOTAL_WEEKS).fill(GOAL_WEIGHT),
        borderColor: "#FFC800",
        borderDash: [6,6],
        borderWidth: 2,
        pointRadius: 0,
        pointHitRadius: 0,
        fill: false,
        tension: 0
      }
    ]
  };
}
function buildWeightChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom", labels: { boxWidth:12, boxHeight:12, padding:14, color:"#4B4B4B", font:{weight:800,size:11} } },
      tooltip: {
        backgroundColor: "#4B4B4B", padding: 10, cornerRadius: 10, displayColors: false,
        titleFont: { weight: 900 }, bodyFont: { weight: 700 },
        callbacks: { label: (ctx) => ctx.parsed.y === null ? "Not weighed" : `${ctx.dataset.label}: ${ctx.parsed.y}kg` }
      }
    },
    scales: {
      x: { grid: { display:false }, ticks: { color:"#AFAFAF", font:{weight:800,size:11} } },
      y: {
        grid: { color:"#E5E5E5" },
        ticks: { color:"#AFAFAF", font:{weight:700,size:11}, callback:(v)=>v+"kg" },
        suggestedMin: GOAL_WEIGHT - 2,
        suggestedMax: START_WEIGHT + 1
      }
    }
  };
}
function renderWeightChart() {
  const canvas = document.getElementById("weightChart");
  if (!canvas || typeof Chart === "undefined") return;
  if (weightChartInstance) { weightChartInstance.destroy(); weightChartInstance = null; }
  weightChartInstance = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: buildWeightChartData(),
    options: buildWeightChartOptions()
  });
}

// ---------- TAB: WORKOUT ----------
function workoutTab() {
  const W=getWorkouts(state.currentWeek);
  const day=W[state.selectedDay], w=state.currentWeek, d=state.selectedDay;
  const done=day.ex.filter((_,i)=>state.completedWorkouts[`${w}-${d}-${i}`]).length;
  const pctW=(done/day.ex.length)*100;
  let h='<div style="display:flex;flex-direction:column;gap:12px">'+weekSelector()+dayTabs(W);
  h+=`<div style="background:${day.color};border-radius:20px;padding:16px;box-shadow:0 4px 0 rgba(0,0,0,0.12)">
    <div style="font-size:11px;color:#fff;font-weight:800;letter-spacing:1px;opacity:0.9">${isPeak(w)?'PEAK WEEK':'WEEK '+(w+1)} · ${day.day}</div>
    <div style="font-size:20px;font-weight:900;color:#fff;margin-top:2px">${day.focus}</div>
    <div style="font-size:12px;color:#fff;opacity:0.9;font-weight:800;margin-top:4px">${done}/${day.ex.length} done</div>
    <div style="height:10px;background:rgba(255,255,255,0.3);border-radius:6px;margin-top:8px;overflow:hidden"><div style="height:100%;width:${pctW}%;background:#fff;border-radius:6px;transition:width .3s"></div></div></div>`;
  day.ex.forEach((ex,i)=>{
    const on=state.completedWorkouts[`${w}-${d}-${i}`];
    h+=`<div class="tap" data-act="ex" data-i="${i}" style="display:flex;align-items:center;gap:12px;background:${on?'#F0FBE6':'#fff'};border:2px solid ${on?'var(--green)':'var(--line)'};border-radius:16px;padding:14px">
      ${check(on)}<div style="flex:1"><div style="font-size:14px;font-weight:800;color:${on?'var(--green-d)':'var(--ink)'};text-decoration:${on?'line-through':'none'}">${ex.n}</div>
      <div style="font-size:11px;color:var(--grey);font-weight:700">${ex.s}${ex.r!=='-'?' · '+ex.r:''}</div></div></div>`;
  });
  return h+'</div>';
}

// ---------- TAB: MEALS ----------
function mealsTab() {
  const w=state.currentWeek, d=state.selectedDay;
  const W=getWorkouts(w), type=W[d]?W[d].type:'training';
  const plan=getMeals(w,d,type);
  const consumed=plan.meals.reduce((s,m,i)=>state.completedMeals[`${w}-${d}-${i}`]?s+m.cals:s,0);
  const total=plan.meals.reduce((s,m)=>s+m.cals,0);
  const pk=isPeak(w);
  const barColor=pk?'var(--green)':'var(--blue)';
  let h='<div style="display:flex;flex-direction:column;gap:12px">'+weekSelector()+dayTabs(W);
  h+=`<div style="background:${barColor};border-radius:20px;padding:16px;text-align:center;box-shadow:0 4px 0 ${pk?'var(--green-d)':'var(--blue-d)'}">
    <div style="font-size:11px;color:#fff;font-weight:800;opacity:0.9;letter-spacing:0.5px">${plan.label}</div>
    <div style="font-size:34px;font-weight:900;color:#fff;margin-top:4px">${consumed}<span style="font-size:15px;opacity:0.8"> / ${total} kcal</span></div>
    <div class="row" style="justify-content:center;gap:14px;margin-top:6px">
      <span style="font-size:12px;color:#fff;font-weight:800">P ${plan.protein}</span>
      <span style="font-size:12px;color:#fff;font-weight:800">C ${plan.carbs}</span>
      <span style="font-size:12px;color:#fff;font-weight:800">F ${plan.fat}</span></div></div>`;
  plan.meals.forEach((meal,i)=>{
    const on=state.completedMeals[`${w}-${d}-${i}`];
    h+=`<div class="tap" data-act="meal" data-i="${i}" style="background:${on?'#F0FBE6':'#fff'};border:2px solid ${on?'var(--green)':'var(--line)'};border-radius:16px;padding:14px">
      <div class="row" style="align-items:flex-start;gap:11px">${check(on)}
      <div style="flex:1"><div class="row" style="justify-content:space-between;align-items:center">
        <span style="font-size:14px;font-weight:900;color:${on?'var(--green-d)':'var(--ink)'};text-decoration:${on?'line-through':'none'}">${meal.name}</span>
        <span style="font-size:11px;color:#fff;background:var(--gold);padding:2px 8px;border-radius:10px;font-weight:800">${meal.cals}</span></div>
      <div style="font-size:11px;color:var(--grey);font-weight:800">${meal.time}</div>
      <div style="font-size:12px;color:var(--ink);margin-top:5px;line-height:1.5;font-weight:600">${meal.desc}</div>
      <div class="row" style="gap:10px;margin-top:5px">
        <span style="font-size:10px;color:var(--red);font-weight:800">P:${meal.p}g</span>
        <span style="font-size:10px;color:var(--blue);font-weight:800">C:${meal.c}g</span>
        <span style="font-size:10px;color:var(--orange);font-weight:800">F:${meal.f}g</span></div></div></div></div>`;
  });
  const hydro=pk?(d>=5?"💧 Water back to normal — flush the excess":"💧 Water UP to 3L+ this phase"):"💧 Hydration goal: 2.5L daily";
  h+=`<div style="background:#E8F7FF;border:2px solid var(--blue);border-radius:16px;padding:12px 14px;font-size:13px;font-weight:800;color:var(--blue-d)">${hydro}</div>`;
  return h+'</div>';
}

// ---------- TAB: HABITS ----------
function habitsTab() {
  const w=state.currentWeek;
  let h='<div style="display:flex;flex-direction:column;gap:12px">'+weekSelector();
  h+=`<div style="font-size:16px;font-weight:900;color:var(--ink)">Daily Habits — ${isPeak(w)?'Peak Week':'Week '+(w+1)}</div>`;
  DAYS.forEach((dn,di)=>{
    const cnt=habitDefs.filter(hb=>state.completedHabits[`${w}-${di}-${hb.id}`]).length;
    const all=cnt===habitDefs.length;
    h+=`<div style="background:${all?'#F0FBE6':'#fff'};border:2px solid ${all?'var(--green)':'var(--line)'};border-radius:18px;padding:14px">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:15px;font-weight:900;color:${all?'var(--green-d)':'var(--ink)'}">${dn} ${all?'🎉':''}</span>
        <span style="font-size:12px;color:#fff;background:${all?'var(--green)':'var(--grey)'};padding:2px 10px;border-radius:10px;font-weight:800">${cnt}/${habitDefs.length}</span></div>`;
    habitDefs.forEach(hb=>{
      const on=state.completedHabits[`${w}-${di}-${hb.id}`];
      h+=`<div class="tap" data-act="habit" data-d="${di}" data-h="${hb.id}" style="display:flex;align-items:center;gap:9px;padding:6px 0">
        ${check(on,20)}<span style="font-size:13px;font-weight:800;color:${on?'var(--green-d)':'var(--ink)'};text-decoration:${on?'line-through':'none'}">${hb.icon} ${hb.label}</span></div>`;
    });
    h+='</div>';
  });
  h+=`<div class="card">${sectionTitle("Weekly Note")}
    <textarea data-act="note" data-k="ref-${w}" placeholder="Energy? Cravings? How's the body feeling?" style="width:100%;min-height:56px;background:var(--soft);border:2px solid var(--line);border-radius:14px;color:var(--ink);padding:10px;font-size:13px;resize:vertical;box-sizing:border-box">${state.notes['ref-'+w]||''}</textarea></div>`;
  return h+'</div>';
}

// ---------- TAB: GUIDE ----------
function guideTab() {
  let h='<div style="display:flex;flex-direction:column;gap:14px">';
  h+=`<div style="background:var(--purple);border-radius:20px;padding:18px;box-shadow:0 4px 0 var(--purple-d)">
    <div style="font-size:18px;font-weight:900;color:#fff">📖 Your 5-Week Playbook</div>
    <div style="font-size:12px;color:#fff;opacity:0.95;margin-top:4px;line-height:1.5;font-weight:700">Muscle-sparing, not extreme. The goal is looking lean & strong for Phuket — not a crash diet that eats your muscle.</div></div>`;
  guideSections.forEach(s=>{
    h+=`<div class="card" style="border-color:${s.color}"><div style="font-size:15px;font-weight:900;color:${s.color};margin-bottom:8px">${s.title}</div>`;
    s.items.forEach((it,j)=>{
      h+=`<div style="font-size:12px;color:var(--ink);padding:6px 0;line-height:1.5;font-weight:700;border-bottom:${j<s.items.length-1?'2px solid var(--line)':'none'}">${it}</div>`;
    });
    h+='</div>';
  });
  return h+'</div>';
}

// ---------- MAIN RENDER ----------
function render() {
  const tabs=[["dashboard","Home","🏠"],["workout","Train","🏋️"],["meals","Eat","🍽️"],["habits","Habits","✅"],["guide","Guide","📖"]];
  let nav='<div class="row" style="gap:4px;padding:6px 10px 8px;overflow-x:auto;position:sticky;top:0;background:#fff;z-index:10;border-bottom:2px solid var(--line)">';
  tabs.forEach(t=>{
    const a=state.activeTab===t[0];
    nav+=`<button class="pill" data-act="tab" data-v="${t[0]}" style="padding:9px 12px;font-size:12px;white-space:nowrap;
      ${a?'background:var(--green);color:#fff;box-shadow:0 3px 0 var(--green-d)':'background:transparent;color:var(--grey)'}">${t[2]} ${t[1]}</button>`;
  });
  nav+='</div>';

  let body='';
  if (state.activeTab==='dashboard') body=dashboard();
  else if (state.activeTab==='workout') body=workoutTab();
  else if (state.activeTab==='meals') body=mealsTab();
  else if (state.activeTab==='habits') body=habitsTab();
  else if (state.activeTab==='guide') body=guideTab();

  document.getElementById('app').innerHTML=`
    <div style="padding:18px 16px 12px;background:#fff">
      <div style="font-size:11px;color:var(--green);font-weight:900;letter-spacing:2px">5-WEEK PEAK PLAN</div>
      <div style="font-size:24px;font-weight:900;color:var(--ink);margin-top:2px">Fitness Tracker 🏋️</div>
      <div style="font-size:12px;color:var(--grey);margin-top:1px;font-weight:700">Lean & strong by Aug 6 · muscle-sparing, not extreme</div>
    </div>
    ${nav}
    <div style="padding:14px 14px 48px">${body}</div>`;

  if (state.activeTab==='dashboard') renderWeightChart();
  else if (weightChartInstance) { weightChartInstance.destroy(); weightChartInstance=null; }
}

// ---------- EVENTS ----------
document.addEventListener('click',(e)=>{
  const btn=e.target.closest('[data-act]'); if(!btn) return;
  const act=btn.dataset.act, w=state.currentWeek, d=state.selectedDay;
  if(act==='tab') state.activeTab=btn.dataset.v;
  else if(act==='week'){ state.currentWeek=parseInt(btn.dataset.v); state.selectedDay=0; }
  else if(act==='day') state.selectedDay=parseInt(btn.dataset.v);
  else if(act==='protein'){ const k=`${w}-${btn.dataset.d}`; state.proteinHit[k]=!state.proteinHit[k]; }
  else if(act==='ex'){ const k=`${w}-${d}-${btn.dataset.i}`; state.completedWorkouts[k]=!state.completedWorkouts[k]; }
  else if(act==='meal'){ const k=`${w}-${d}-${btn.dataset.i}`; state.completedMeals[k]=!state.completedMeals[k]; }
  else if(act==='habit'){ const k=`${w}-${btn.dataset.d}-${btn.dataset.h}`; state.completedHabits[k]=!state.completedHabits[k]; }
  else if(act==='export'){ exportData(); return; }
  else if(act==='import'){ importData(); return; }
  else return;
  save(); render();
});
document.addEventListener('input',(e)=>{
  const el=e.target.closest('[data-act]'); if(!el) return;
  if(el.dataset.act==='weight'){ state.weeklyWeights[parseInt(el.dataset.w)]=el.value; save(); }
  else if(el.dataset.act==='note'){ state.notes[el.dataset.k]=el.value; save(); }
});

render();
