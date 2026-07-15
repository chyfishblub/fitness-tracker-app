// ============================================================
// send-meal-reminders — Edge Function, invoked 3x/day by Supabase
// Cron (see docs/REFERENCE.md §6). Sends a Web Push nudge to any
// subscribed user who hasn't logged that meal yet today.
//
// Cron calls this with a JSON body like { "mealType": "breakfast" }
// so each of the three schedules (08:00 / 12:30 / 19:00) targets
// the right meal without needing per-user timezone logic in V1.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:you@example.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const MEAL_COPY: Record<string, { title: string; body: string }> = {
  breakfast: { title: "Fitness Tracker", body: "Log your breakfast 📸" },
  lunch: { title: "Fitness Tracker", body: "Log your lunch 📸" },
  dinner: { title: "Fitness Tracker", body: "Log your dinner 📸" },
};

// Fixed single timezone for V1 — see docs/PRD.md §7 for the per-user-timezone V2 item.
function todayInTZ(tz = "Asia/Kuala_Lumpur") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

Deno.serve(async (req) => {
  let mealType = "breakfast";
  try {
    const body = await req.json();
    if (body.mealType) mealType = body.mealType;
  } catch (_e) { /* no body — fall back to default */ }

  if (!MEAL_COPY[mealType]) {
    return new Response(JSON.stringify({ error: "mealType must be breakfast, lunch, or dinner" }), { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const today = todayInTZ();

  const { data: subs, error: subsErr } = await supabase.from("push_subscriptions").select("*");
  if (subsErr) return new Response(JSON.stringify({ error: subsErr.message }), { status: 500 });
  if (!subs || !subs.length) return new Response(JSON.stringify({ sent: 0, skipped: 0 }), { status: 200 });

  const userIds = [...new Set(subs.map((s) => s.user_id))];
  const { data: alreadyLogged } = await supabase
    .from("meal_logs")
    .select("user_id")
    .eq("log_date", today)
    .eq("meal_type", mealType)
    .in("user_id", userIds);
  const loggedSet = new Set((alreadyLogged || []).map((r) => r.user_id));

  let sent = 0, skipped = 0, removed = 0;
  const copy = MEAL_COPY[mealType];

  await Promise.all(subs.map(async (sub) => {
    if (loggedSet.has(sub.user_id)) { skipped++; return; }
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: copy.title, body: copy.body, url: "./" })
      );
      sent++;
    } catch (err: any) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        removed++;
      }
    }
  }));

  return new Response(JSON.stringify({ mealType, sent, skipped, removedExpired: removed }), {
    headers: { "Content-Type": "application/json" },
  });
});
