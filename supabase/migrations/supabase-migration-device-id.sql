-- ============================================================
-- MIGRATION: Add device_id column for deterministic conflict resolution
--
-- This enables deterministic tiebreaking when two changes have
-- exactly the same timestamp. Lower device_id wins (arbitrary but consistent).
-- ============================================================

-- Add device_id column to all entity tables
ALTER TABLE goal_lists ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE daily_routine_goals ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE daily_goal_progress ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE task_categories ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE commitments ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE long_term_tasks ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE focus_settings ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE focus_sessions ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE block_lists ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE blocked_websites ADD COLUMN IF NOT EXISTS device_id text;

-- Add indexes for efficient querying (optional, but useful for debugging)
CREATE INDEX IF NOT EXISTS idx_goal_lists_device_id ON goal_lists(device_id);
CREATE INDEX IF NOT EXISTS idx_goals_device_id ON goals(device_id);
CREATE INDEX IF NOT EXISTS idx_daily_routine_goals_device_id ON daily_routine_goals(device_id);
CREATE INDEX IF NOT EXISTS idx_daily_goal_progress_device_id ON daily_goal_progress(device_id);
CREATE INDEX IF NOT EXISTS idx_task_categories_device_id ON task_categories(device_id);
CREATE INDEX IF NOT EXISTS idx_commitments_device_id ON commitments(device_id);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_device_id ON daily_tasks(device_id);
CREATE INDEX IF NOT EXISTS idx_long_term_tasks_device_id ON long_term_tasks(device_id);
CREATE INDEX IF NOT EXISTS idx_focus_settings_device_id ON focus_settings(device_id);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_device_id ON focus_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_block_lists_device_id ON block_lists(device_id);
CREATE INDEX IF NOT EXISTS idx_blocked_websites_device_id ON blocked_websites(device_id);
