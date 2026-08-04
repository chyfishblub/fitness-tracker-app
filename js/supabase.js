/* ============================================================
   supabase.js — the ONLY file that talks to Supabase directly.
   Client init + a flat set of async data-access functions used
   by auth.js and app.js. Keeping all queries in one place makes
   the RLS-backed schema (supabase/schema.sql) the single source
   of truth for what's allowed.
   ============================================================ */

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- session ----------
async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}
function onAuthChange(cb) {
  sb.auth.onAuthStateChange((_event, session) => cb(session));
}
async function sendMagicLink(email) {
  // Always return to the clean page URL that initiated sign-in. Avoid carrying
  // stale auth fragments/query strings into a newly generated magic link.
  // This URL must also be present in Supabase Auth's Redirect URLs allowlist.
  const emailRedirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo },
  });
  return { error };
}
async function signInAsGuest() {
  const { data, error } = await sb.auth.signInAnonymously();
  return { session: data?.session || null, error };
}
async function signOut() {
  await sb.auth.signOut();
}

// ---------- profile ----------
async function getProfile(userId) {
  const { data, error } = await sb.from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}
async function completeOnboarding(userId, { displayName, trainingLevel }) {
  const { error } = await sb.from("profiles").update({
    display_name: displayName,
    training_level: trainingLevel,
    onboarded_at: new Date().toISOString(),
  }).eq("id", userId);
  if (error) throw error;
}

// ---------- goals ----------
async function getActiveGoal(userId) {
  const { data, error } = await sb.from("goals")
    .select("*").eq("user_id", userId).eq("is_active", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}
async function getAllGoals(userId) {
  const { data, error } = await sb.from("goals")
    .select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
async function createGoal(userId, goal) {
  // Only one active goal at a time (see PRD §9) — deactivate any current one first.
  await sb.from("goals").update({ is_active: false }).eq("user_id", userId).eq("is_active", true);
  const { data, error } = await sb.from("goals").insert({ user_id: userId, ...goal }).select().single();
  if (error) throw error;
  return data;
}
async function updateGoal(goalId, patch) {
  const { error } = await sb.from("goals").update(patch).eq("id", goalId);
  if (error) throw error;
}

// ---------- meal logs ----------
async function getMealLogsForDate(userId, logDate) {
  const { data, error } = await sb.from("meal_logs")
    .select("*").eq("user_id", userId).eq("log_date", logDate)
    .order("logged_at", { ascending: true });
  if (error) throw error;
  return data;
}
async function getMealLogsForRange(userId, startDate, endDate) {
  const { data, error } = await sb.from("meal_logs")
    .select("*").eq("user_id", userId)
    .gte("log_date", startDate).lte("log_date", endDate)
    .order("log_date", { ascending: false }).order("logged_at", { ascending: true });
  if (error) throw error;
  return data;
}
async function upsertMealLog(userId, { logId, logDate, mealType, photoPath, note, portion, feeling }) {
  const payload = {
    user_id: userId, log_date: logDate, meal_type: mealType,
    photo_path: photoPath, note, portion, feeling, logged_at: new Date().toISOString(),
  };
  // Named meals are protected by a partial unique index. PostgREST cannot target
  // that index with onConflict, so existing rows must be updated by id instead.
  if (logId) {
    const { error } = await sb.from("meal_logs").update(payload).eq("id", logId).eq("user_id", userId);
    if (error) throw error;
    return;
  }

  const { error } = await sb.from("meal_logs").insert(payload);
  if (!error) return;

  // A stale client can miss a row created in another tab/session. Recover from
  // the unique violation by locating and updating that named meal explicitly.
  if (error.code === "23505" && mealType !== "snack") {
    const { data: existing, error: lookupError } = await sb.from("meal_logs")
      .select("id").eq("user_id", userId).eq("log_date", logDate).eq("meal_type", mealType).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) {
      const { error: updateError } = await sb.from("meal_logs").update(payload)
        .eq("id", existing.id).eq("user_id", userId);
      if (updateError) throw updateError;
      return;
    }
  }
  throw error;
}
async function deleteMealLog(logId) {
  const { error } = await sb.from("meal_logs").delete().eq("id", logId);
  if (error) throw error;
}
async function uploadMealPhoto(userId, logDate, mealType, blob) {
  const path = `${userId}/${logDate}/${mealType}-${Date.now()}.jpg`;
  const { error } = await sb.storage.from("meal-photos").upload(path, blob, {
    contentType: "image/jpeg", upsert: true,
  });
  if (error) throw error;
  return path;
}
async function getMealPhotoUrl(path) {
  if (!path) return null;
  const { data, error } = await sb.storage.from("meal-photos").createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}

// ---------- workout overrides ----------
async function getOverrides(userId, goalId) {
  const { data, error } = await sb.from("workout_overrides")
    .select("*").eq("user_id", userId).eq("goal_id", goalId);
  if (error) throw error;
  return data;
}
async function upsertOverride(userId, goalId, { week, day, slot, exerciseId, sets, reps, rest, removed }) {
  const { error } = await sb.from("workout_overrides").upsert({
    user_id: userId, goal_id: goalId, week, day, slot,
    exercise_id: exerciseId ?? null, sets: sets ?? null, reps: reps ?? null,
    rest: rest ?? null, removed: !!removed,
  }, { onConflict: "user_id,goal_id,week,day,slot" });
  if (error) throw error;
}

// ---------- set logs ----------
async function getSetLogsForDate(userId, logDate) {
  const { data, error } = await sb.from("set_logs")
    .select("*").eq("user_id", userId).eq("log_date", logDate)
    .order("set_number", { ascending: true });
  if (error) throw error;
  return data;
}
async function getLastSetLogs(userId, exerciseId, beforeDate) {
  const { data, error } = await sb.from("set_logs")
    .select("*").eq("user_id", userId).eq("exercise_id", exerciseId).lt("log_date", beforeDate)
    .order("log_date", { ascending: false }).limit(10);
  if (error) throw error;
  if (!data.length) return [];
  const mostRecentDate = data[0].log_date;
  return data.filter((r) => r.log_date === mostRecentDate).sort((a, b) => a.set_number - b.set_number);
}
async function logSet(userId, { logDate, exerciseId, setNumber, weightKg, reps }) {
  const { error } = await sb.from("set_logs").insert({
    user_id: userId, log_date: logDate, exercise_id: exerciseId,
    set_number: setNumber, weight_kg: weightKg, reps,
  });
  if (error) throw error;
}
async function getSetHistory(userId, exerciseId) {
  const { data, error } = await sb.from("set_logs")
    .select("*").eq("user_id", userId).eq("exercise_id", exerciseId)
    .order("log_date", { ascending: true });
  if (error) throw error;
  return data;
}

// ---------- weight entries ----------
async function getWeightEntries(userId) {
  const { data, error } = await sb.from("weight_entries")
    .select("*").eq("user_id", userId).order("entry_date", { ascending: true });
  if (error) throw error;
  return data;
}
async function upsertWeightEntry(userId, entryDate, weightKg) {
  const { error } = await sb.from("weight_entries").upsert({
    user_id: userId, entry_date: entryDate, weight_kg: weightKg,
  }, { onConflict: "user_id,entry_date" });
  if (error) throw error;
}

// ---------- habit logs ----------
async function getHabitLogsForRange(userId, startDate, endDate) {
  const { data, error } = await sb.from("habit_logs")
    .select("*").eq("user_id", userId).gte("log_date", startDate).lte("log_date", endDate);
  if (error) throw error;
  return data;
}
async function toggleHabitLog(userId, logDate, habitId, done) {
  const { error } = await sb.from("habit_logs").upsert({
    user_id: userId, log_date: logDate, habit_id: habitId, done,
  }, { onConflict: "user_id,log_date,habit_id" });
  if (error) throw error;
}

// ---------- week notes ----------
async function getWeekNotes(userId, goalId) {
  const { data, error } = await sb.from("week_notes").select("*").eq("user_id", userId).eq("goal_id", goalId);
  if (error) throw error;
  const byWeek = {};
  data.forEach((n) => { byWeek[n.week_index] = n.body; });
  return byWeek;
}
async function upsertWeekNote(userId, goalId, weekIndex, body) {
  const { error } = await sb.from("week_notes").upsert({
    user_id: userId, goal_id: goalId, week_index: weekIndex, body, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,goal_id,week_index" });
  if (error) throw error;
}

// ---------- push subscriptions ----------
async function savePushSubscription(userId, sub) {
  const json = sub.toJSON();
  const { error } = await sb.from("push_subscriptions").upsert({
    user_id: userId, endpoint: json.endpoint,
    p256dh: json.keys.p256dh, auth: json.keys.auth,
  }, { onConflict: "endpoint" });
  if (error) throw error;
}
async function removePushSubscription(endpoint) {
  const { error } = await sb.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw error;
}
