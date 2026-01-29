-- Projects Feature Migration
-- Adds projects table and project_id columns to related tables

-- ============================================================
-- PROJECTS TABLE
-- ============================================================

create table projects (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  is_current boolean default false not null,
  "order" double precision default 0 not null,
  tag_id uuid references task_categories(id) on delete set null,
  commitment_id uuid references commitments(id) on delete set null,
  goal_list_id uuid references goal_lists(id) on delete set null,
  deleted boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  _version integer default 1 not null,
  device_id text
);

-- ============================================================
-- ADD project_id TO RELATED TABLES
-- ============================================================

alter table task_categories add column if not exists project_id uuid references projects(id) on delete set null;
alter table commitments add column if not exists project_id uuid references projects(id) on delete set null;
alter table goal_lists add column if not exists project_id uuid references projects(id) on delete set null;

-- ============================================================
-- INDEXES: Projects
-- ============================================================

create index idx_projects_user_id on projects(user_id);
create index idx_projects_is_current on projects(is_current);
create index idx_projects_order on projects("order");
create index idx_projects_updated_at on projects(updated_at);
create index idx_projects_deleted on projects(deleted) where deleted = false;
create index idx_projects_tag_id on projects(tag_id);
create index idx_projects_commitment_id on projects(commitment_id);
create index idx_projects_goal_list_id on projects(goal_list_id);

-- Indexes for project_id on related tables
create index idx_task_categories_project_id on task_categories(project_id);
create index idx_commitments_project_id on commitments(project_id);
create index idx_goal_lists_project_id on goal_lists(project_id);

-- ============================================================
-- RLS: Projects
-- ============================================================

alter table projects enable row level security;

create policy "Users can view their own projects"
  on projects for select
  using ((select auth.uid()) = user_id);

create policy "Users can create their own projects"
  on projects for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own projects"
  on projects for update
  using ((select auth.uid()) = user_id);

create policy "Users can delete their own projects"
  on projects for delete
  using ((select auth.uid()) = user_id);

-- ============================================================
-- TRIGGERS: Projects
-- ============================================================

create trigger set_projects_user_id
  before insert on projects
  for each row execute function set_user_id();

create trigger update_projects_updated_at
  before update on projects
  for each row execute function update_updated_at_column();

-- ============================================================
-- UPDATE COMMITMENTS SECTION CONSTRAINT
-- Replace 'social' with 'projects' in section check
-- ============================================================

-- First migrate existing 'social' commitments to 'personal'
update commitments set section = 'personal' where section = 'social';

-- Drop the old constraint and add the new one
alter table commitments drop constraint if exists commitments_section_check;
alter table commitments add constraint commitments_section_check
  check (section in ('career', 'projects', 'personal'));

-- ============================================================
-- REALTIME: Enable real-time subscriptions for projects
-- ============================================================

alter publication supabase_realtime add table projects;
