/* ============================================================
   config.js — your Supabase project's public connection details.
   The anon key is meant to be public (it's exposed in every
   browser that loads this app); real security comes from the
   Row Level Security policies in supabase/schema.sql, not from
   hiding this key. See docs/REFERENCE.md §6 for setup steps.
   ============================================================ */

const SUPABASE_URL = "https://hjpbteaxuhawwhubaeli.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ZiITM0XGPzkPFjwS2U8QyQ_9E3EAW5K";

// Public VAPID key for Web Push (see docs/REFERENCE.md §5-6). Safe to expose.
const VAPID_PUBLIC_KEY = "YOUR_VAPID_PUBLIC_KEY";
