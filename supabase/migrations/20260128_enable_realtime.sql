-- Enable Realtime for all tables
-- This migration ensures all tables are added to the supabase_realtime publication
-- which is required for real-time subscriptions to work

-- Add each table to the realtime publication (safe to run multiple times)
DO $$
BEGIN
  -- goal_lists
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'goal_lists'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE goal_lists;
  END IF;

  -- goals
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'goals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE goals;
  END IF;

  -- daily_routine_goals
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'daily_routine_goals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE daily_routine_goals;
  END IF;

  -- daily_goal_progress
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'daily_goal_progress'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE daily_goal_progress;
  END IF;

  -- task_categories
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'task_categories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE task_categories;
  END IF;

  -- commitments
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'commitments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE commitments;
  END IF;

  -- daily_tasks
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'daily_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE daily_tasks;
  END IF;

  -- long_term_tasks
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'long_term_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE long_term_tasks;
  END IF;

  -- focus_settings
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'focus_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE focus_settings;
  END IF;

  -- focus_sessions
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'focus_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE focus_sessions;
  END IF;

  -- block_lists
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'block_lists'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE block_lists;
  END IF;

  -- blocked_websites
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'blocked_websites'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE blocked_websites;
  END IF;

  -- projects
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'projects'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE projects;
  END IF;
END $$;

-- Also ensure replica identity is set to FULL for all tables
-- This is required for UPDATE and DELETE events to include the full row data
ALTER TABLE goal_lists REPLICA IDENTITY FULL;
ALTER TABLE goals REPLICA IDENTITY FULL;
ALTER TABLE daily_routine_goals REPLICA IDENTITY FULL;
ALTER TABLE daily_goal_progress REPLICA IDENTITY FULL;
ALTER TABLE task_categories REPLICA IDENTITY FULL;
ALTER TABLE commitments REPLICA IDENTITY FULL;
ALTER TABLE daily_tasks REPLICA IDENTITY FULL;
ALTER TABLE long_term_tasks REPLICA IDENTITY FULL;
ALTER TABLE focus_settings REPLICA IDENTITY FULL;
ALTER TABLE focus_sessions REPLICA IDENTITY FULL;
ALTER TABLE block_lists REPLICA IDENTITY FULL;
ALTER TABLE blocked_websites REPLICA IDENTITY FULL;
ALTER TABLE projects REPLICA IDENTITY FULL;
