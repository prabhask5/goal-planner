-- Goal Planner Database Schema for Supabase
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Goal Lists table
create table if not exists goal_lists (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
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
  "order" double precision default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
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
  "order" double precision default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Daily Goal Progress table
create table if not exists daily_goal_progress (
  id uuid default uuid_generate_v4() primary key,
  daily_routine_goal_id uuid references daily_routine_goals(id) on delete cascade not null,
  date date not null,
  current_value integer default 0 not null,
  completed boolean default false not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(daily_routine_goal_id, date)
);

-- Indexes for better query performance
create index if not exists idx_goal_lists_user_id on goal_lists(user_id);
create index if not exists idx_goals_goal_list_id on goals(goal_list_id);
create index if not exists idx_goals_order on goals("order");
create index if not exists idx_daily_routine_goals_user_id on daily_routine_goals(user_id);
create index if not exists idx_daily_routine_goals_order on daily_routine_goals("order");
create index if not exists idx_daily_goal_progress_date on daily_goal_progress(date);
create index if not exists idx_daily_goal_progress_goal_id on daily_goal_progress(daily_routine_goal_id);

-- Indexes on updated_at for efficient sync queries
create index if not exists idx_goal_lists_updated_at on goal_lists(updated_at);
create index if not exists idx_goals_updated_at on goals(updated_at);
create index if not exists idx_daily_routine_goals_updated_at on daily_routine_goals(updated_at);
create index if not exists idx_daily_goal_progress_updated_at on daily_goal_progress(updated_at);

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

-- Function to automatically update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- Triggers to auto-update updated_at on row changes
create trigger update_goal_lists_updated_at
  before update on goal_lists
  for each row execute function update_updated_at_column();

create trigger update_goals_updated_at
  before update on goals
  for each row execute function update_updated_at_column();

create trigger update_daily_routine_goals_updated_at
  before update on daily_routine_goals
  for each row execute function update_updated_at_column();

create trigger update_daily_goal_progress_updated_at
  before update on daily_goal_progress
  for each row execute function update_updated_at_column();

-- ============================================================
-- MIGRATION: Add order column to daily_routine_goals (for existing databases)
-- Run this if you're upgrading from a previous schema version
-- ============================================================
-- alter table daily_routine_goals add column if not exists "order" double precision default 0 not null;
-- alter table goals alter column "order" type double precision using "order"::double precision;
-- create index if not exists idx_daily_routine_goals_order on daily_routine_goals("order");
-- create index if not exists idx_goals_order on goals("order");
--
-- Assign sequential order values to existing daily_routine_goals (newest first):
-- with ordered_routines as (
--   select id, row_number() over (order by created_at desc) - 1 as new_order
--   from daily_routine_goals
-- )
-- update daily_routine_goals set "order" = ordered_routines.new_order
-- from ordered_routines where daily_routine_goals.id = ordered_routines.id;

-- ============================================================
-- TASKS FEATURE TABLES
-- ============================================================

-- Task Categories table (for long-term task categorization)
create table if not exists task_categories (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#6c5ce7',
  "order" double precision default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Commitments table (reference items for creating daily tasks)
create table if not exists commitments (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  section text not null check (section in ('career', 'social', 'personal')),
  "order" double precision default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Daily Tasks table (simple quick tasks)
create table if not exists daily_tasks (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  "order" double precision default 0 not null,
  completed boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Long-term Tasks table (tasks with due dates shown on calendar)
create table if not exists long_term_tasks (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  due_date date not null,
  category_id uuid references task_categories(id) on delete set null,
  completed boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indexes for task tables
create index if not exists idx_task_categories_user_id on task_categories(user_id);
create index if not exists idx_task_categories_order on task_categories("order");
create index if not exists idx_task_categories_updated_at on task_categories(updated_at);

create index if not exists idx_commitments_user_id on commitments(user_id);
create index if not exists idx_commitments_section on commitments(section);
create index if not exists idx_commitments_order on commitments("order");
create index if not exists idx_commitments_updated_at on commitments(updated_at);

create index if not exists idx_daily_tasks_user_id on daily_tasks(user_id);
create index if not exists idx_daily_tasks_order on daily_tasks("order");
create index if not exists idx_daily_tasks_updated_at on daily_tasks(updated_at);

create index if not exists idx_long_term_tasks_user_id on long_term_tasks(user_id);
create index if not exists idx_long_term_tasks_due_date on long_term_tasks(due_date);
create index if not exists idx_long_term_tasks_category_id on long_term_tasks(category_id);
create index if not exists idx_long_term_tasks_updated_at on long_term_tasks(updated_at);

-- Enable RLS on task tables
alter table task_categories enable row level security;
alter table commitments enable row level security;
alter table daily_tasks enable row level security;
alter table long_term_tasks enable row level security;

-- Policies for task_categories
create policy "Users can view their own task categories"
  on task_categories for select
  using (auth.uid() = user_id);

create policy "Users can create their own task categories"
  on task_categories for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own task categories"
  on task_categories for update
  using (auth.uid() = user_id);

create policy "Users can delete their own task categories"
  on task_categories for delete
  using (auth.uid() = user_id);

-- Policies for commitments
create policy "Users can view their own commitments"
  on commitments for select
  using (auth.uid() = user_id);

create policy "Users can create their own commitments"
  on commitments for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own commitments"
  on commitments for update
  using (auth.uid() = user_id);

create policy "Users can delete their own commitments"
  on commitments for delete
  using (auth.uid() = user_id);

-- Policies for daily_tasks
create policy "Users can view their own daily tasks"
  on daily_tasks for select
  using (auth.uid() = user_id);

create policy "Users can create their own daily tasks"
  on daily_tasks for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own daily tasks"
  on daily_tasks for update
  using (auth.uid() = user_id);

create policy "Users can delete their own daily tasks"
  on daily_tasks for delete
  using (auth.uid() = user_id);

-- Policies for long_term_tasks
create policy "Users can view their own long term tasks"
  on long_term_tasks for select
  using (auth.uid() = user_id);

create policy "Users can create their own long term tasks"
  on long_term_tasks for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own long term tasks"
  on long_term_tasks for update
  using (auth.uid() = user_id);

create policy "Users can delete their own long term tasks"
  on long_term_tasks for delete
  using (auth.uid() = user_id);

-- Triggers to auto-set user_id for new task tables
create trigger set_task_categories_user_id
  before insert on task_categories
  for each row execute function set_user_id();

create trigger set_commitments_user_id
  before insert on commitments
  for each row execute function set_user_id();

create trigger set_daily_tasks_user_id
  before insert on daily_tasks
  for each row execute function set_user_id();

create trigger set_long_term_tasks_user_id
  before insert on long_term_tasks
  for each row execute function set_user_id();

-- Triggers to auto-update updated_at for new task tables
create trigger update_task_categories_updated_at
  before update on task_categories
  for each row execute function update_updated_at_column();

create trigger update_commitments_updated_at
  before update on commitments
  for each row execute function update_updated_at_column();

create trigger update_daily_tasks_updated_at
  before update on daily_tasks
  for each row execute function update_updated_at_column();

create trigger update_long_term_tasks_updated_at
  before update on long_term_tasks
  for each row execute function update_updated_at_column();

-- ============================================================
-- MIGRATION: Add soft delete support for multi-device sync
-- Run this to enable proper delete propagation across devices
-- ============================================================

-- Add deleted column to all tables (soft delete / tombstone pattern)
alter table goal_lists add column if not exists deleted boolean default false not null;
alter table goals add column if not exists deleted boolean default false not null;
alter table daily_routine_goals add column if not exists deleted boolean default false not null;
alter table daily_goal_progress add column if not exists deleted boolean default false not null;
alter table task_categories add column if not exists deleted boolean default false not null;
alter table commitments add column if not exists deleted boolean default false not null;
alter table daily_tasks add column if not exists deleted boolean default false not null;
alter table long_term_tasks add column if not exists deleted boolean default false not null;

-- Add indexes for efficient filtering of non-deleted records
create index if not exists idx_goal_lists_deleted on goal_lists(deleted) where deleted = false;
create index if not exists idx_goals_deleted on goals(deleted) where deleted = false;
create index if not exists idx_daily_routine_goals_deleted on daily_routine_goals(deleted) where deleted = false;
create index if not exists idx_daily_goal_progress_deleted on daily_goal_progress(deleted) where deleted = false;
create index if not exists idx_task_categories_deleted on task_categories(deleted) where deleted = false;
create index if not exists idx_commitments_deleted on commitments(deleted) where deleted = false;
create index if not exists idx_daily_tasks_deleted on daily_tasks(deleted) where deleted = false;
create index if not exists idx_long_term_tasks_deleted on long_term_tasks(deleted) where deleted = false;

-- Note: Server-side tombstone cleanup is handled automatically by the app
-- during sync. Old tombstones (deleted=true, older than 30 days) are
-- permanently deleted from both local storage and Supabase.
