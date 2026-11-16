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
    return renderLoginScreen("We couldn't load your account. Please sign in again.");
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
        <div class="auth-brand"><span>J</span> JUNO</div>
        <div class="auth-orbit"><i>🍳</i><b>3/3</b><i>🏋️</i></div>
        <h1>Your fitness buddy, <em>in your pocket.</em></h1>
        <p>Daily quests for your meals, workouts and rest. Every small win earns XP, and a missed day never costs you anything.</p>
        <div class="auth-benefits"><span>✓ Snap-a-photo meal log</span><span>✓ Workouts that track every rep</span><span>✓ Daily quests built on your goal</span></div>
      </section>
      <section class="auth-card">
        <span class="auth-kicker">PLAYER 1, READY?</span><h2>Start your first quest</h2>
        <button id="guestSubmit" class="btn3d primary-button guest-button" style="--sd:var(--green-d)">Play as guest <span aria-hidden="true">→</span></button>
        <p class="guest-note">No email needed. Your progress stays in this browser.</p>
        <div class="auth-divider"><span>or save your progress on every device</span></div>
        <label for="loginEmail">Email address</label>
        <input id="loginEmail" type="email" placeholder="you@example.com" autocomplete="email"/>
        <button id="loginSubmit" class="secondary-button email-signin-button">Email me a magic link</button>
        <div id="loginMsg" class="form-message">
          ${errorMsg ? `<span style="color:var(--red)">${errorMsg}</span>` : "No password to remember. Tap the link in your inbox and you're in."}
        </div>
      </section>
    </div>`;

  document.getElementById("guestSubmit").addEventListener("click", async () => {
    const button = document.getElementById("guestSubmit");
    const msg = document.getElementById("loginMsg");
    button.disabled = true;
    button.textContent = "Loading your game…";
    msg.style.color = "var(--grey)";
    msg.textContent = "Setting up your private space…";
    const { error } = await signInAsGuest();
    if (error) {
      button.disabled = false;
      button.innerHTML = 'Play as guest <span aria-hidden="true">→</span>';
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
    msg.style.color = "var(--grey)"; msg.textContent = "Sending your link…";
    const { error } = await sendMagicLink(email);
    if (error) { msg.style.color = "var(--red)"; msg.textContent = error.message; return; }
    msg.style.color = "var(--green-d)";
    msg.textContent = `Link sent to ${email}. Open it on this device to jump in.`;
  });
}

// ---------- screen: onboarding ----------
function renderOnboarding(user, profile) {
  const state = { step: 0, name: profile.display_name || "", spotter: (user.user_metadata && user.user_metadata.spotter_name) || "", currentWeight: "", goalWeight: "", goalTitle: "", goalDate: "", level: "beginner", saving: false, error: "" };
  const steps = ["Level 1 · Your player", "Level 2 · Your quest", "Level 3 · Your pace"];

  function draw() {
    let content = "";
    if (state.step === 0) content = `<div class="onboarding-fields">
      <label for="obName">Your name</label><input id="obName" type="text" autocomplete="given-name" placeholder="Your first name" value="${escapeAuth(state.name)}"/>
      <label for="obSpotter">Name your Spotter</label><input id="obSpotter" type="text" maxlength="20" autocomplete="off" placeholder="Pick a name" value="${escapeAuth(state.spotter)}"/>
      <div class="name-chips" role="group" aria-label="Starter names">${SPOTTER_NAMES.map((n) => `<button type="button" class="name-chip" data-spotter="${n}">${n}</button>`).join("")}</div>
      <p class="field-help">Your Spotter is the buddy who cheers you on and keeps you company. You can rename them any time on Me.</p></div>`;
    else if (state.step === 1) content = `<div class="onboarding-fields">
      <label for="obGoalTitle">What are you training for?</label><input id="obGoalTitle" type="text" placeholder="e.g. Stronger by June, Bali trip" value="${escapeAuth(state.goalTitle)}"/>
      <label for="obGoalDate">Finish date <span>optional</span></label><input id="obGoalDate" type="date" value="${state.goalDate}"/>
      <div class="onboarding-tip">🎯 Add a date and Juno builds a countdown plan with a final peak week. Skip it for an open-ended quest.</div></div>`;
    else content = `<div class="onboarding-fields"><label>How much lifting have you done?</label><div class="choice-grid">
      <button class="choice-card ${state.level === "beginner" ? "is-selected" : ""}" data-level="beginner"><span>🌱</span><strong>Just starting</strong><small>Learn the moves and build the habit</small></button>
      <button class="choice-card ${state.level === "intermediate" ? "is-selected" : ""}" data-level="intermediate"><span>⚡</span><strong>Already lifting</strong><small>More sets, faster progress</small></button></div>
      <details class="optional-fields" ${state.currentWeight || state.goalWeight ? "open" : ""}><summary>Add a weight goal <span>optional</span></summary>
        <div class="two-column-fields"><div><label for="obCurrentWeight">Weight now (kg)</label><input id="obCurrentWeight" type="number" inputmode="decimal" step="0.1" placeholder="60" value="${state.currentWeight}"/></div><div><label for="obGoalWeight">Goal weight (kg)</label><input id="obGoalWeight" type="number" inputmode="decimal" step="0.1" placeholder="56.5" value="${state.goalWeight}"/></div></div>
        <p class="field-help">Only you see these. Skip them for a strength or habit quest. You can add a weigh-in any time on Progress.</p></details>
      <div class="plan-preview"><span>QUEST UNLOCKED</span><h3>${escapeAuth(state.goalTitle || "Feel-good quest")}</h3><p>${state.level === "beginner" ? "A beginner-friendly week" : "A step-up week with more sets"} · meal ideas · daily quests</p></div></div>`;

    APP_ROOT.innerHTML = `<div class="onboarding-shell"><header class="onboarding-header"><div class="auth-brand"><span>J</span> JUNO</div><div class="step-count">${state.step + 1} of 3</div></header>
      <div class="step-progress">${steps.map((_, i) => `<i class="${i <= state.step ? "is-active" : ""}"></i>`).join("")}</div>
      <main class="onboarding-card"><span class="auth-kicker">${steps[state.step].toUpperCase()}</span><h1>${state.step === 0 ? "Create your player" : state.step === 1 ? "Pick your main quest" : "Choose your difficulty"}</h1><p>${state.step === 0 ? "Two quick names and you're in." : state.step === 1 ? "Your quest shapes your workouts." : "You can swap or adjust any move later."}</p>${content}
      <div id="obMsg" class="form-message error">${state.error}</div><div class="onboarding-actions">${state.step ? '<button id="obBack" class="secondary-button">Back</button>' : ""}<button id="obNext" class="btn3d primary-button" style="--sd:var(--green-d)">${state.saving ? "Building your quest…" : state.step === 2 ? "Start my quest" : "Next level"}</button></div></main></div>`;

    document.querySelectorAll("[data-spotter]").forEach((btn) => btn.addEventListener("click", () => { document.getElementById("obSpotter").value = btn.dataset.spotter; }));
    document.querySelectorAll("[data-level]").forEach((btn) => btn.addEventListener("click", () => { readWeights(); state.level = btn.dataset.level; draw(); }));
    document.getElementById("obBack")?.addEventListener("click", () => { state.error = ""; state.step--; draw(); });
    document.getElementById("obNext").addEventListener("click", advance);
  }

  function readWeights() {
    const now = document.getElementById("obCurrentWeight"), goal = document.getElementById("obGoalWeight");
    if (now) state.currentWeight = now.value;
    if (goal) state.goalWeight = goal.value;
  }

  async function advance() {
    state.error = "";
    if (state.step === 0) {
      state.name = document.getElementById("obName").value.trim();
      state.spotter = document.getElementById("obSpotter").value.trim();
      if (!state.name) { state.error = "Add your name to start."; draw(); return; }
    } else if (state.step === 1) {
      state.goalTitle = document.getElementById("obGoalTitle").value.trim(); state.goalDate = document.getElementById("obGoalDate").value;
      if (!state.goalTitle) { state.error = "Give your quest a short name, like \"Bali trip\"."; draw(); return; }
    }
    if (state.step < 2) { state.step++; draw(); return; }
    if (state.saving) return;
    readWeights();
    state.saving = true; draw();
    try {
      await completeOnboarding(user.id, { displayName: state.name, trainingLevel: state.level });
      // A missing Spotter name never blocks starting; it can be set on Me.
      if (state.spotter) { try { await saveSpotterName(state.spotter); } catch (e) { console.error("Spotter name didn't save", e); } }
      // Local date, not UTC: in Malaysia (UTC+8) toISOString() is still yesterday before 8am.
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const goalDate = state.goalDate || null;
      const startWeight = parseFloat(state.currentWeight) || null, goalWeight = parseFloat(state.goalWeight) || null;
      await createGoal(user.id, { title: state.goalTitle, target_date: goalDate, start_weight: startWeight, goal_weight: goalWeight, template_id: goalDate ? "lean-peak" : "consistency", duration_weeks: goalDate ? Math.max(1, Math.ceil((new Date(goalDate) - new Date(today)) / (7 * 86400000))) : 5, start_date: today, is_active: true });
      if (startWeight) await upsertWeightEntry(user.id, today, startWeight);
      boot();
    } catch (e) { state.saving = false; state.error = "That didn't save. Tap Start my quest to try again."; draw(); }
  }
  draw();
}

// Starter names for the Spotter. The field starts blank (docs/redesign/02-brand.md).
const SPOTTER_NAMES = ["Mo", "Bean", "Captain", "Pip", "Sunny"];

function escapeAuth(value) { return String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

boot();
