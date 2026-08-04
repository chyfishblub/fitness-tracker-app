/* ============================================================
   auth.js — the front door. Boots the app, gates everything on
   a Supabase session, and runs the one-time onboarding flow.
   Once a signed-in + onboarded user is confirmed, hands off to
   initApp(user, profile) in app.js.
   ============================================================ */

const APP_ROOT = document.getElementById("app");

async function boot() {
  if (!APP_ROOT.innerHTML.trim() && typeof appLoadingState === "function") APP_ROOT.innerHTML = appLoadingState();
  const session = await getSession();
  if (!session) return renderLoginScreen();

  let profile;
  try {
    profile = await getProfile(session.user.id);
  } catch (e) {
    return renderLoginScreen("Something went wrong loading your account. Please try signing in again.");
  }

  if (!profile.onboarded_at) return renderOnboarding(session.user, profile);
  initApp(session.user, profile);
}

onAuthChange((session) => {
  // Re-check on sign-in/out so a magic-link tab picks up the new session automatically.
  if (!session) { APP_ROOT.innerHTML = ""; boot(); }
});

// ---------- screen: login ----------
function renderLoginScreen(errorMsg) {
  APP_ROOT.innerHTML = `
    <div class="auth-shell">
      <section class="auth-hero">
        <div class="auth-brand"><span>FT</span> FITNESS TRACKER</div>
        <div class="auth-orbit"><i>🍳</i><b>3/3</b><i>🏋️</i></div>
        <h1>Know what to do <em>today.</em></h1>
        <p>Log meals in seconds, follow the next workout, and watch consistency turn into progress.</p>
        <div class="auth-benefits"><span>✓ Photo-first meal journal</span><span>✓ Weight × reps workout logging</span><span>✓ Goal-based daily plan</span></div>
      </section>
      <section class="auth-card">
        <span class="auth-kicker">START NOW</span><h2>Jump straight into your plan</h2>
        <button id="guestSubmit" class="btn3d primary-button guest-button" style="--sd:var(--green-d)">Continue as guest <span aria-hidden="true">→</span></button>
        <p class="guest-note">No email needed. Guest progress is tied to this browser.</p>
        <div class="auth-divider"><span>or save across devices</span></div>
        <label for="loginEmail">Email address</label>
        <input id="loginEmail" type="email" placeholder="you@example.com" autocomplete="email"/>
        <button id="loginSubmit" class="secondary-button email-signin-button">Email me a sign-in link</button>
        <div id="loginMsg" class="form-message">
          ${errorMsg ? `<span style="color:var(--red)">${errorMsg}</span>` : "No password needed — we'll email you a sign-in link."}
        </div>
      </section>
    </div>`;

  document.getElementById("guestSubmit").addEventListener("click", async () => {
    const button = document.getElementById("guestSubmit");
    const msg = document.getElementById("loginMsg");
    button.disabled = true;
    button.textContent = "Starting your plan…";
    msg.style.color = "var(--grey)";
    msg.textContent = "Creating your private guest space…";
    const { error } = await signInAsGuest();
    if (error) {
      button.disabled = false;
      button.innerHTML = 'Continue as guest <span aria-hidden="true">→</span>';
      msg.style.color = "var(--red)";
      msg.textContent = /anonymous sign-ins are disabled/i.test(error.message)
        ? "Guest access isn't enabled yet. Please try email sign-in."
        : error.message;
      return;
    }
    await boot();
  });

  document.getElementById("loginSubmit").addEventListener("click", async () => {
    const email = document.getElementById("loginEmail").value.trim();
    const msg = document.getElementById("loginMsg");
    if (!email || !email.includes("@")) { msg.style.color = "var(--red)"; msg.textContent = "Enter a valid email."; return; }
    msg.style.color = "var(--grey)"; msg.textContent = "Sending...";
    const { error } = await sendMagicLink(email);
    if (error) { msg.style.color = "var(--red)"; msg.textContent = error.message; return; }
    msg.style.color = "var(--green-d)";
    msg.textContent = `Check ${email} for your sign-in link.`;
  });
}

// ---------- screen: onboarding ----------
function renderOnboarding(user, profile) {
  const state = { step: 0, name: profile.display_name || "", currentWeight: "", goalWeight: "", goalTitle: "", goalDate: "", level: "beginner", saving: false, error: "" };
  const steps = ["Your baseline", "Your target", "Your plan"];

  function draw() {
    let content = "";
    if (state.step === 0) content = `<div class="onboarding-fields">
      <label for="obName">What should we call you?</label><input id="obName" type="text" placeholder="Your name" value="${escapeAuth(state.name)}"/>
      <div class="two-column-fields"><div><label for="obCurrentWeight">Current kg</label><input id="obCurrentWeight" type="number" inputmode="decimal" step="0.1" placeholder="60" value="${state.currentWeight}"/></div><div><label for="obGoalWeight">Goal kg</label><input id="obGoalWeight" type="number" inputmode="decimal" step="0.1" placeholder="56.5" value="${state.goalWeight}"/></div></div>
      <p class="field-help">Used to personalize progress—not to judge a single day.</p></div>`;
    else if (state.step === 1) content = `<div class="onboarding-fields">
      <label for="obGoalTitle">What are you working toward?</label><input id="obGoalTitle" type="text" placeholder="e.g. Get stronger, Phuket trip" value="${escapeAuth(state.goalTitle)}"/>
      <label for="obGoalDate">Target date <span>optional</span></label><input id="obGoalDate" type="date" value="${state.goalDate}"/>
      <div class="onboarding-tip">🎯 A deadline creates a focused plan. Skip it for an ongoing consistency plan.</div></div>`;
    else content = `<div class="onboarding-fields"><label>Training experience</label><div class="choice-grid">
      <button class="choice-card ${state.level === "beginner" ? "is-selected" : ""}" data-level="beginner"><span>🌱</span><strong>Beginner</strong><small>Build form and consistency</small></button>
      <button class="choice-card ${state.level === "intermediate" ? "is-selected" : ""}" data-level="intermediate"><span>⚡</span><strong>Intermediate</strong><small>Progress with more volume</small></button></div>
      <div class="plan-preview"><span>YOUR PLAN IS READY</span><h3>${escapeAuth(state.goalTitle || "Consistency plan")}</h3><p>${state.level === "beginner" ? "A structured, approachable week" : "A progressive higher-volume week"} · meal guidance · daily goals</p></div></div>`;

    APP_ROOT.innerHTML = `<div class="onboarding-shell"><header class="onboarding-header"><div class="auth-brand"><span>FT</span> FITNESS TRACKER</div><div class="step-count">${state.step + 1} of 3</div></header>
      <div class="step-progress">${steps.map((_, i) => `<i class="${i <= state.step ? "is-active" : ""}"></i>`).join("")}</div>
      <main class="onboarding-card"><span class="auth-kicker">${steps[state.step].toUpperCase()}</span><h1>${state.step === 0 ? "Start with where you are" : state.step === 1 ? "Give the work a direction" : "Choose your starting pace"}</h1><p>${state.step === 0 ? "These numbers can change later." : state.step === 1 ? "Your goal shapes the workout plan." : "You can swap and adjust exercises anytime."}</p>${content}
      <div id="obMsg" class="form-message error">${state.error}</div><div class="onboarding-actions">${state.step ? '<button id="obBack" class="secondary-button">Back</button>' : ""}<button id="obNext" class="btn3d primary-button" style="--sd:var(--green-d)">${state.saving ? "Building your plan…" : state.step === 2 ? "Start my plan" : "Continue"}</button></div></main></div>`;

    document.querySelectorAll("[data-level]").forEach((btn) => btn.addEventListener("click", () => { state.level = btn.dataset.level; draw(); }));
    document.getElementById("obBack")?.addEventListener("click", () => { state.error = ""; state.step--; draw(); });
    document.getElementById("obNext").addEventListener("click", advance);
  }

  async function advance() {
    state.error = "";
    if (state.step === 0) {
      state.name = document.getElementById("obName").value.trim();
      state.currentWeight = document.getElementById("obCurrentWeight").value;
      state.goalWeight = document.getElementById("obGoalWeight").value;
      if (!state.name || !parseFloat(state.currentWeight) || !parseFloat(state.goalWeight)) { state.error = "Add your name, current weight, and goal weight."; draw(); return; }
    } else if (state.step === 1) {
      state.goalTitle = document.getElementById("obGoalTitle").value.trim(); state.goalDate = document.getElementById("obGoalDate").value;
      if (!state.goalTitle) { state.error = "Give your goal a short, motivating name."; draw(); return; }
    }
    if (state.step < 2) { state.step++; draw(); return; }
    if (state.saving) return;
    state.saving = true; draw();
    try {
      await completeOnboarding(user.id, { displayName: state.name, trainingLevel: state.level });
      const today = new Date().toISOString().slice(0, 10);
      const goalDate = state.goalDate || null;
      await createGoal(user.id, { title: state.goalTitle, target_date: goalDate, start_weight: parseFloat(state.currentWeight), goal_weight: parseFloat(state.goalWeight), template_id: goalDate ? "lean-peak" : "consistency", duration_weeks: goalDate ? Math.max(1, Math.ceil((new Date(goalDate) - new Date(today)) / (7 * 86400000))) : 5, start_date: today, is_active: true });
      await upsertWeightEntry(user.id, today, parseFloat(state.currentWeight));
      boot();
    } catch (e) { state.saving = false; state.error = "Something went wrong — please try again."; draw(); }
  }
  draw();
}

function escapeAuth(value) { return String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

boot();
