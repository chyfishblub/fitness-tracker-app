/* ============================================================
   auth.js — the front door. Boots the app, gates everything on
   a Supabase session, and runs the one-time onboarding flow.
   Once a signed-in + onboarded user is confirmed, hands off to
   initApp(user, profile) in app.js.
   ============================================================ */

const APP_ROOT = document.getElementById("app");

async function boot() {
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
    <div style="min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:28px;box-sizing:border-box">
      <div style="text-align:center;margin-bottom:28px">
        <div style="font-size:40px">🏋️</div>
        <div style="font-size:24px;font-weight:900;color:var(--ink);margin-top:6px">Fitness Tracker</div>
        <div style="font-size:13px;color:var(--grey);font-weight:700;margin-top:4px">Your daily food journal + strength log</div>
      </div>
      <div class="card">
        <div style="font-size:14px;font-weight:800;color:var(--ink);margin-bottom:10px">Sign in with email</div>
        <input id="loginEmail" type="email" placeholder="you@example.com" autocomplete="email"
          style="width:100%;padding:12px;background:var(--soft);border:2px solid var(--line);border-radius:12px;font-size:14px;font-weight:700;box-sizing:border-box;margin-bottom:10px"/>
        <button id="loginSubmit" class="btn3d" style="width:100%;padding:12px;font-size:14px;background:var(--green);--sd:var(--green-d)">Send magic link ✨</button>
        <div id="loginMsg" style="font-size:12px;font-weight:700;margin-top:10px;text-align:center;color:var(--grey)">
          ${errorMsg ? `<span style="color:var(--red)">${errorMsg}</span>` : "No password needed — we'll email you a sign-in link."}
        </div>
      </div>
    </div>`;

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
  APP_ROOT.innerHTML = `
    <div style="padding:24px 20px;box-sizing:border-box;max-width:480px;margin:0 auto">
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:22px;font-weight:900;color:var(--ink)">Let's set you up 👋</div>
        <div style="font-size:13px;color:var(--grey);font-weight:700;margin-top:4px">About 60 seconds. Everything here is editable later in Profile.</div>
      </div>
      <div class="card" style="display:flex;flex-direction:column;gap:14px">
        ${obField("obName", "Your name", "text", "Fish")}
        ${obField("obCurrentWeight", "Current weight (kg)", "number", "60")}
        ${obField("obGoalWeight", "Goal weight (kg)", "number", "56.5")}
        ${obField("obGoalTitle", "What are you working toward?", "text", "e.g. Phuket trip, or just getting stronger")}
        ${obField("obGoalDate", "Target date (optional)", "date", "")}
        <div>
          <div style="font-size:12px;font-weight:800;color:var(--grey);margin-bottom:6px">Training level</div>
          <div class="row" style="gap:8px">
            <button data-level="beginner" class="pill obLevel" style="flex:1;padding:12px;font-size:13px;background:var(--green);color:#fff;box-shadow:0 3px 0 var(--green-d)">Beginner</button>
            <button data-level="intermediate" class="pill obLevel" style="flex:1;padding:12px;font-size:13px;background:#fff;color:var(--grey);border:2px solid var(--line)">Intermediate</button>
          </div>
        </div>
        <button id="obSubmit" class="btn3d" style="width:100%;padding:14px;font-size:15px;background:var(--green);--sd:var(--green-d);margin-top:6px">Start tracking →</button>
        <div id="obMsg" style="font-size:12px;font-weight:700;text-align:center;color:var(--red)"></div>
      </div>
    </div>`;

  let selectedLevel = "beginner";
  document.querySelectorAll(".obLevel").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedLevel = btn.dataset.level;
      document.querySelectorAll(".obLevel").forEach((b) => {
        const on = b.dataset.level === selectedLevel;
        b.style.background = on ? "var(--green)" : "#fff";
        b.style.color = on ? "#fff" : "var(--grey)";
        b.style.boxShadow = on ? "0 3px 0 var(--green-d)" : "none";
        b.style.border = on ? "none" : "2px solid var(--line)";
      });
    });
  });

  document.getElementById("obSubmit").addEventListener("click", async () => {
    const name = document.getElementById("obName").value.trim();
    const currentWeight = parseFloat(document.getElementById("obCurrentWeight").value);
    const goalWeight = parseFloat(document.getElementById("obGoalWeight").value);
    const goalTitle = document.getElementById("obGoalTitle").value.trim();
    const goalDate = document.getElementById("obGoalDate").value || null;
    const msg = document.getElementById("obMsg");

    if (!name || !currentWeight || !goalWeight || !goalTitle) {
      msg.textContent = "Please fill in every field above (target date is optional).";
      return;
    }
    msg.style.color = "var(--grey)"; msg.textContent = "Setting things up...";

    try {
      await completeOnboarding(user.id, { displayName: name, trainingLevel: selectedLevel });
      const today = new Date().toISOString().slice(0, 10);
      const templateId = goalDate ? "lean-peak" : "consistency";
      const durationWeeks = goalDate
        ? Math.max(1, Math.ceil((new Date(goalDate) - new Date(today)) / (7 * 86400000)))
        : 5;
      await createGoal(user.id, {
        title: goalTitle, target_date: goalDate, start_weight: currentWeight,
        goal_weight: goalWeight, template_id: templateId,
        duration_weeks: durationWeeks, start_date: today, is_active: true,
      });
      await upsertWeightEntry(user.id, today, currentWeight);
      boot();
    } catch (e) {
      msg.style.color = "var(--red)";
      msg.textContent = "Something went wrong — please try again.";
    }
  });
}

function obField(id, label, type, placeholder) {
  return `<div>
    <div style="font-size:12px;font-weight:800;color:var(--grey);margin-bottom:6px">${label}</div>
    <input id="${id}" type="${type}" placeholder="${placeholder}"
      style="width:100%;padding:12px;background:var(--soft);border:2px solid var(--line);border-radius:12px;font-size:14px;font-weight:700;box-sizing:border-box"/>
  </div>`;
}

boot();
