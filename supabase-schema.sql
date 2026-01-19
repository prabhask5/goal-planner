-- Goal Planner Database Schema for Supabase
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Goal Lists table
create table if not exists goal_lists (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Goals table (for goal lists)
create table if not exists goals (
  id uuid default uuid_generate_v4() primary key,
  goal_list_id uuid references goal_lists(id) on delete cascade not null,
  name text not null,
  type text not null check (type in ('completion', 'incremental')),
  target_value integer,
  current_value integer default 0 not null,
  completed boolean default false not null,
  "order" integer default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Daily Routine Goals table
create table if not exists daily_routine_goals (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('completion', 'incremental')),
  target_value integer,
  start_date date not null,
  end_date date,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Daily Goal Progress table
create table if not exists daily_goal_progress (
  id uuid default uuid_generate_v4() primary key,
  daily_routine_goal_id uuid references daily_routine_goals(id) on delete cascade not null,
  date date not null,
  current_value integer default 0 not null,
  completed boolean default false not null,
  unique(daily_routine_goal_id, date)
);

-- Indexes for better query performance
create index if not exists idx_goal_lists_user_id on goal_lists(user_id);
create index if not exists idx_goals_goal_list_id on goals(goal_list_id);
create index if not exists idx_daily_routine_goals_user_id on daily_routine_goals(user_id);
create index if not exists idx_daily_goal_progress_date on daily_goal_progress(date);
create index if not exists idx_daily_goal_progress_goal_id on daily_goal_progress(daily_routine_goal_id);

-- Row Level Security (RLS) Policies
alter table goal_lists enable row level security;
alter table goals enable row level security;
alter table daily_routine_goals enable row level security;
alter table daily_goal_progress enable row level security;

-- Policies for goal_lists
create policy "Users can view their own goal lists"
  on goal_lists for select
  using (auth.uid() = user_id);

create policy "Users can create their own goal lists"
  on goal_lists for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own goal lists"
  on goal_lists for update
  using (auth.uid() = user_id);

create policy "Users can delete their own goal lists"
  on goal_lists for delete
  using (auth.uid() = user_id);

-- Policies for goals (via goal_list ownership)
create policy "Users can view goals in their lists"
  on goals for select
  using (
    exists (
      select 1 from goal_lists
      where goal_lists.id = goals.goal_list_id
      and goal_lists.user_id = auth.uid()
    )
  );

create policy "Users can create goals in their lists"
  on goals for insert
  with check (
    exists (
      select 1 from goal_lists
      where goal_lists.id = goals.goal_list_id
      and goal_lists.user_id = auth.uid()
    )
  );

create policy "Users can update goals in their lists"
  on goals for update
  using (
    exists (
      select 1 from goal_lists
      where goal_lists.id = goals.goal_list_id
      and goal_lists.user_id = auth.uid()
    )
  );

create policy "Users can delete goals in their lists"
  on goals for delete
  using (
    exists (
      select 1 from goal_lists
      where goal_lists.id = goals.goal_list_id
      and goal_lists.user_id = auth.uid()
    )
  );

-- Policies for daily_routine_goals
create policy "Users can view their own daily routine goals"
  on daily_routine_goals for select
  using (auth.uid() = user_id);

create policy "Users can create their own daily routine goals"
  on daily_routine_goals for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own daily routine goals"
  on daily_routine_goals for update
  using (auth.uid() = user_id);

create policy "Users can delete their own daily routine goals"
  on daily_routine_goals for delete
  using (auth.uid() = user_id);

-- Policies for daily_goal_progress (via daily_routine_goal ownership)
create policy "Users can view their daily progress"
  on daily_goal_progress for select
  using (
    exists (
      select 1 from daily_routine_goals
      where daily_routine_goals.id = daily_goal_progress.daily_routine_goal_id
      and daily_routine_goals.user_id = auth.uid()
    )
  );

create policy "Users can create their daily progress"
  on daily_goal_progress for insert
  with check (
    exists (
      select 1 from daily_routine_goals
      where daily_routine_goals.id = daily_goal_progress.daily_routine_goal_id
      and daily_routine_goals.user_id = auth.uid()
    )
  );

create policy "Users can update their daily progress"
  on daily_goal_progress for update
  using (
    exists (
      select 1 from daily_routine_goals
      where daily_routine_goals.id = daily_goal_progress.daily_routine_goal_id
      and daily_routine_goals.user_id = auth.uid()
    )
  );

create policy "Users can delete their daily progress"
  on daily_goal_progress for delete
  using (
    exists (
      select 1 from daily_routine_goals
      where daily_routine_goals.id = daily_goal_progress.daily_routine_goal_id
      and daily_routine_goals.user_id = auth.uid()
    )
  );

-- Function to automatically set user_id on insert
create or replace function set_user_id()
returns trigger as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$ language plpgsql security definer;

-- Triggers to auto-set user_id
create trigger set_goal_lists_user_id
  before insert on goal_lists
  for each row execute function set_user_id();

create trigger set_daily_routine_goals_user_id
  before insert on daily_routine_goals
  for each row execute function set_user_id();
