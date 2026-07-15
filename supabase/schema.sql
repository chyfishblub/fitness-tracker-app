-- ============================================================
-- Fitness Tracker — Supabase schema
-- Run this once in the SQL Editor of a fresh Supabase project.
-- Safe to re-run: everything is IF NOT EXISTS / CREATE OR REPLACE.
-- See docs/REFERENCE.md §6 for the full setup runbook.
-- ============================================================

-- ---------- profiles ----------
-- One row per user, id = auth.users.id. Created automatically on signup
-- (see handle_new_user trigger below); onboarding fills it in with an UPDATE.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  training_level text check (training_level in ('beginner', 'intermediate')),
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);
-- No insert/delete policy: rows are created only by the trigger below.

-- Auto-create a blank profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- goals ----------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  target_date date,
  start_weight numeric,
  goal_weight numeric,
  template_id text not null default 'consistency',
  duration_weeks int not null default 5,
  start_date date not null default current_date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.goals enable row level security;

create policy "goals_select_own" on public.goals
  for select using (auth.uid() = user_id);
create policy "goals_insert_own" on public.goals
  for insert with check (auth.uid() = user_id);
create policy "goals_update_own" on public.goals
  for update using (auth.uid() = user_id);
create policy "goals_delete_own" on public.goals
  for delete using (auth.uid() = user_id);

create index if not exists goals_user_active_idx
  on public.goals (user_id, is_active);

-- ---------- meal_logs ----------
create table if not exists public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  photo_path text,
  note text,
  portion text check (portion in ('light', 'normal', 'heavy')),
  feeling text,
  logged_at timestamptz not null default now()
);

alter table public.meal_logs enable row level security;

create policy "meal_logs_select_own" on public.meal_logs
  for select using (auth.uid() = user_id);
create policy "meal_logs_insert_own" on public.meal_logs
  for insert with check (auth.uid() = user_id);
create policy "meal_logs_update_own" on public.meal_logs
  for update using (auth.uid() = user_id);
create policy "meal_logs_delete_own" on public.meal_logs
  for delete using (auth.uid() = user_id);

-- One breakfast/lunch/dinner per user per day (re-logging edits it).
-- Snacks are excluded so they can be logged any number of times.
create unique index if not exists meal_logs_one_per_day
  on public.meal_logs (user_id, log_date, meal_type)
  where meal_type <> 'snack';

create index if not exists meal_logs_user_date_idx
  on public.meal_logs (user_id, log_date desc);

-- ---------- workout_overrides ----------
-- Personal swap/adjust layered on top of a generated plan at render time.
create table if not exists public.workout_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  week int not null,
  day int not null,
  slot int not null,
  exercise_id text,
  sets int,
  reps text,
  rest text,
  removed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, goal_id, week, day, slot)
);

alter table public.workout_overrides enable row level security;

create policy "workout_overrides_select_own" on public.workout_overrides
  for select using (auth.uid() = user_id);
create policy "workout_overrides_insert_own" on public.workout_overrides
  for insert with check (auth.uid() = user_id);
create policy "workout_overrides_update_own" on public.workout_overrides
  for update using (auth.uid() = user_id);
create policy "workout_overrides_delete_own" on public.workout_overrides
  for delete using (auth.uid() = user_id);

-- ---------- set_logs ----------
-- Actual weight x reps performed per set. Powers "last time" recall + strength charts.
create table if not exists public.set_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  exercise_id text not null,
  set_number int not null,
  weight_kg numeric,
  reps int,
  created_at timestamptz not null default now()
);

alter table public.set_logs enable row level security;

create policy "set_logs_select_own" on public.set_logs
  for select using (auth.uid() = user_id);
create policy "set_logs_insert_own" on public.set_logs
  for insert with check (auth.uid() = user_id);
create policy "set_logs_update_own" on public.set_logs
  for update using (auth.uid() = user_id);
create policy "set_logs_delete_own" on public.set_logs
  for delete using (auth.uid() = user_id);

create index if not exists set_logs_user_exercise_idx
  on public.set_logs (user_id, exercise_id, log_date desc);

-- ---------- weight_entries ----------
create table if not exists public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  weight_kg numeric not null,
  created_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

alter table public.weight_entries enable row level security;

create policy "weight_entries_select_own" on public.weight_entries
  for select using (auth.uid() = user_id);
create policy "weight_entries_insert_own" on public.weight_entries
  for insert with check (auth.uid() = user_id);
create policy "weight_entries_update_own" on public.weight_entries
  for update using (auth.uid() = user_id);
create policy "weight_entries_delete_own" on public.weight_entries
  for delete using (auth.uid() = user_id);

-- ---------- habit_logs ----------
create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  habit_id text not null,
  done boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, log_date, habit_id)
);

alter table public.habit_logs enable row level security;

create policy "habit_logs_select_own" on public.habit_logs
  for select using (auth.uid() = user_id);
create policy "habit_logs_insert_own" on public.habit_logs
  for insert with check (auth.uid() = user_id);
create policy "habit_logs_update_own" on public.habit_logs
  for update using (auth.uid() = user_id);
create policy "habit_logs_delete_own" on public.habit_logs
  for delete using (auth.uid() = user_id);

-- ---------- week_notes ----------
-- Free-text check-in note per (goal, week). Replaces the old localStorage-only notes.
create table if not exists public.week_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  week_index int not null,
  body text not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, goal_id, week_index)
);

alter table public.week_notes enable row level security;

create policy "week_notes_select_own" on public.week_notes
  for select using (auth.uid() = user_id);
create policy "week_notes_insert_own" on public.week_notes
  for insert with check (auth.uid() = user_id);
create policy "week_notes_update_own" on public.week_notes
  for update using (auth.uid() = user_id);
create policy "week_notes_delete_own" on public.week_notes
  for delete using (auth.uid() = user_id);

-- ---------- push_subscriptions ----------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- NOTE: push_subscriptions has no public "select all" policy, which means the
-- send-meal-reminders Edge Function must use the SERVICE ROLE key (bypasses RLS)
-- to read across all users. Never ship the service role key to the client.

-- ============================================================
-- Storage: private bucket for meal photos
-- Path convention: meal-photos/{user_id}/{log_date}/{meal_type}-{timestamp}.jpg
-- ============================================================
insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', false)
on conflict (id) do nothing;

create policy "meal_photos_select_own" on storage.objects
  for select using (
    bucket_id = 'meal-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "meal_photos_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'meal-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "meal_photos_update_own" on storage.objects
  for update using (
    bucket_id = 'meal-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "meal_photos_delete_own" on storage.objects
  for delete using (
    bucket_id = 'meal-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
