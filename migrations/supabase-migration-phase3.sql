-- ============================================================
-- PHASE 3 MIGRATION: Versioning and Sync Infrastructure
--
-- Run this script on an existing Stellar database to add:
-- 1. Version columns to all entity tables (for optimistic concurrency)
-- 2. sync_operations table (for operation logging)
-- 3. tombstones table (for resurrection prevention)
--
-- This migration is idempotent - safe to run multiple times.
-- ============================================================

-- ============================================================
-- STEP 1: Add _version column to all entity tables
-- ============================================================

-- Goal lists
alter table goal_lists add column if not exists _version integer default 1 not null;

-- Goals
alter table goals add column if not exists _version integer default 1 not null;

-- Daily routine goals
alter table daily_routine_goals add column if not exists _version integer default 1 not null;

-- Daily goal progress
alter table daily_goal_progress add column if not exists _version integer default 1 not null;

-- Task categories
alter table task_categories add column if not exists _version integer default 1 not null;

-- Commitments
alter table commitments add column if not exists _version integer default 1 not null;

-- Daily tasks
alter table daily_tasks add column if not exists _version integer default 1 not null;

-- Long-term tasks
alter table long_term_tasks add column if not exists _version integer default 1 not null;

-- Focus settings
alter table focus_settings add column if not exists _version integer default 1 not null;

-- Focus sessions
alter table focus_sessions add column if not exists _version integer default 1 not null;

-- Block lists
alter table block_lists add column if not exists _version integer default 1 not null;

-- Blocked websites
alter table blocked_websites add column if not exists _version integer default 1 not null;

-- ============================================================
-- STEP 2: Create sync_operations table
-- ============================================================

create table if not exists sync_operations (
  id uuid default uuid_generate_v4() primary key,
  entity_type text not null,                       -- 'goals', 'daily_tasks', etc.
  entity_id uuid not null,                         -- UUID of the affected entity
  operation_type text not null check (operation_type in ('increment', 'set', 'create', 'delete')),
  field text,                                       -- Field being modified (null for create/delete)
  value jsonb,                                      -- Delta (increment), new value (set), or full payload (create)
  base_version integer,                             -- Version this operation was based on
  device_id text not null,                          -- Device that created this operation
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indexes for efficient querying
create index if not exists idx_sync_operations_user_id on sync_operations(user_id);
create index if not exists idx_sync_operations_entity on sync_operations(entity_type, entity_id);
create index if not exists idx_sync_operations_created_at on sync_operations(created_at);

-- RLS for sync_operations
alter table sync_operations enable row level security;

-- Drop existing policies if they exist (for idempotency)
drop policy if exists "Users can view their own sync operations" on sync_operations;
drop policy if exists "Users can create their own sync operations" on sync_operations;
drop policy if exists "Users can delete their own sync operations" on sync_operations;

create policy "Users can view their own sync operations"
  on sync_operations for select
  using ((select auth.uid()) = user_id);

create policy "Users can create their own sync operations"
  on sync_operations for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own sync operations"
  on sync_operations for delete
  using ((select auth.uid()) = user_id);

-- ============================================================
-- STEP 3: Create tombstones table
-- ============================================================

create table if not exists tombstones (
  id uuid default uuid_generate_v4() primary key,
  entity_id uuid not null,                         -- UUID of the deleted entity
  entity_type text not null,                       -- 'goals', 'daily_tasks', etc.
  deleted_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_by text not null,                        -- Device ID that deleted the entity
  version integer,                                  -- Version at time of deletion
  last_known_state jsonb,                           -- Snapshot for potential restore
  user_id uuid references auth.users(id) on delete cascade not null,
  unique(entity_id, entity_type)                   -- One tombstone per entity
);

-- Indexes for efficient querying
create index if not exists idx_tombstones_user_id on tombstones(user_id);
create index if not exists idx_tombstones_entity on tombstones(entity_type, entity_id);
create index if not exists idx_tombstones_deleted_at on tombstones(deleted_at);

-- RLS for tombstones
alter table tombstones enable row level security;

-- Drop existing policies if they exist (for idempotency)
drop policy if exists "Users can view their own tombstones" on tombstones;
drop policy if exists "Users can create their own tombstones" on tombstones;
drop policy if exists "Users can delete their own tombstones" on tombstones;

create policy "Users can view their own tombstones"
  on tombstones for select
  using ((select auth.uid()) = user_id);

create policy "Users can create their own tombstones"
  on tombstones for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own tombstones"
  on tombstones for delete
  using ((select auth.uid()) = user_id);

-- ============================================================
-- STEP 4: Create triggers for auto-setting user_id
-- ============================================================

-- Drop existing triggers if they exist (for idempotency)
drop trigger if exists set_sync_operations_user_id on sync_operations;
drop trigger if exists set_tombstones_user_id on tombstones;

-- Create triggers (assumes set_user_id function already exists from main schema)
create trigger set_sync_operations_user_id
  before insert on sync_operations
  for each row execute function set_user_id();

create trigger set_tombstones_user_id
  before insert on tombstones
  for each row execute function set_user_id();

-- ============================================================
-- STEP 5: Add realtime subscriptions for new tables
-- ============================================================

alter publication supabase_realtime add table sync_operations;
alter publication supabase_realtime add table tombstones;

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
--
-- Verify the migration by running:
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'goals' AND column_name = '_version';
--   SELECT * FROM pg_tables WHERE tablename IN ('sync_operations', 'tombstones');
--
-- ============================================================
