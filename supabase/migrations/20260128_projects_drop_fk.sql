-- Drop circular FK constraints from projects to children
-- The ownership relationship is tracked via project_id on child tables instead
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_tag_id_fkey;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_commitment_id_fkey;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_goal_list_id_fkey;
