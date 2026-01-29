import { db, generateId, now } from '../client';
import type { Project, TaskCategory, Commitment, GoalList } from '$lib/types';
import { queueCreateOperation, queueDeleteOperation, queueSyncOperation } from '$lib/sync/queue';
import { scheduleSyncPush, markEntityModified } from '$lib/sync/engine';

// Color palette for random tag colors
const TAG_COLORS = [
  '#6c5ce7', // Purple (primary)
  '#a29bfe', // Light purple
  '#00d4ff', // Cyan
  '#26de81', // Green
  '#ffd93d', // Yellow
  '#ff6b6b', // Red
  '#fd79a8', // Pink
  '#fdcb6e', // Orange
  '#74b9ff', // Blue
  '#55efc4' // Teal
];

function getRandomColor(): string {
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
}

async function getNextProjectOrder(userId: string): Promise<number> {
  const existing = await db.projects.where('user_id').equals(userId).toArray();
  const active = existing.filter((p) => !p.deleted);
  if (active.length === 0) return 0;
  return Math.min(...active.map((p) => p.order)) - 1;
}

/**
 * Creates a new project with its associated tag, commitment, and goal list atomically.
 * All child entities are marked with project_id to indicate project ownership.
 *
 * Order of operations for sync:
 * 1. Create project first (so project_id FK on children is satisfied)
 * 2. Create tag, commitment, goal list (with project_id)
 */
export async function createProject(name: string, userId: string): Promise<Project> {
  const timestamp = now();
  const projectId = generateId();
  const tagId = generateId();
  const commitmentId = generateId();
  const goalListId = generateId();
  const tagColor = getRandomColor();

  const order = await getNextProjectOrder(userId);

  // Create the project itself
  const newProject: Project = {
    id: projectId,
    user_id: userId,
    name,
    is_current: false,
    order,
    tag_id: tagId,
    commitment_id: commitmentId,
    goal_list_id: goalListId,
    created_at: timestamp,
    updated_at: timestamp
  };

  // Create the tag (TaskCategory) for this project
  const newTag: TaskCategory = {
    id: tagId,
    user_id: userId,
    name,
    color: tagColor,
    order: 0,
    project_id: projectId,
    created_at: timestamp,
    updated_at: timestamp
  };

  // Create the commitment for this project
  const newCommitment: Commitment = {
    id: commitmentId,
    user_id: userId,
    name,
    section: 'projects',
    order: 0,
    project_id: projectId,
    created_at: timestamp,
    updated_at: timestamp
  };

  // Create the goal list for this project
  const newGoalList: GoalList = {
    id: goalListId,
    user_id: userId,
    name,
    project_id: projectId,
    created_at: timestamp,
    updated_at: timestamp
  };

  // Use transaction to ensure atomicity of all creates + queue operations
  await db.transaction(
    'rw',
    [db.projects, db.taskCategories, db.commitments, db.goalLists, db.syncQueue],
    async () => {
      // Add all entities to local DB
      await db.projects.add(newProject);
      await db.taskCategories.add(newTag);
      await db.commitments.add(newCommitment);
      await db.goalLists.add(newGoalList);

      // Queue sync operations - project first so project_id FK is satisfied
      await queueCreateOperation('projects', projectId, {
        name,
        is_current: false,
        order,
        tag_id: tagId,
        commitment_id: commitmentId,
        goal_list_id: goalListId,
        user_id: userId,
        created_at: timestamp,
        updated_at: timestamp
      });

      await queueCreateOperation('task_categories', tagId, {
        name,
        color: tagColor,
        order: 0,
        project_id: projectId,
        user_id: userId,
        created_at: timestamp,
        updated_at: timestamp
      });

      await queueCreateOperation('commitments', commitmentId, {
        name,
        section: 'projects',
        order: 0,
        project_id: projectId,
        user_id: userId,
        created_at: timestamp,
        updated_at: timestamp
      });

      await queueCreateOperation('goal_lists', goalListId, {
        name,
        project_id: projectId,
        user_id: userId,
        created_at: timestamp,
        updated_at: timestamp
      });
    }
  );

  // Mark all entities as modified
  markEntityModified(projectId);
  markEntityModified(tagId);
  markEntityModified(commitmentId);
  markEntityModified(goalListId);
  scheduleSyncPush();

  return newProject;
}

/**
 * Updates a project's name. Also updates the associated tag and commitment names.
 */
export async function updateProject(id: string, name: string): Promise<Project | undefined> {
  const timestamp = now();

  let updated: Project | undefined;
  await db.transaction(
    'rw',
    [db.projects, db.taskCategories, db.commitments, db.goalLists, db.syncQueue],
    async () => {
      const project = await db.projects.get(id);
      if (!project) return;

      // Update the project
      await db.projects.update(id, { name, updated_at: timestamp });
      updated = await db.projects.get(id);

      await queueSyncOperation({
        table: 'projects',
        entityId: id,
        operationType: 'set',
        value: { name, updated_at: timestamp }
      });

      // Update the associated tag name
      if (project.tag_id) {
        await db.taskCategories.update(project.tag_id, { name, updated_at: timestamp });
        await queueSyncOperation({
          table: 'task_categories',
          entityId: project.tag_id,
          operationType: 'set',
          value: { name, updated_at: timestamp }
        });
        markEntityModified(project.tag_id);
      }

      // Update the associated commitment name
      if (project.commitment_id) {
        await db.commitments.update(project.commitment_id, { name, updated_at: timestamp });
        await queueSyncOperation({
          table: 'commitments',
          entityId: project.commitment_id,
          operationType: 'set',
          value: { name, updated_at: timestamp }
        });
        markEntityModified(project.commitment_id);
      }

      // Update the associated goal list name
      if (project.goal_list_id) {
        await db.goalLists.update(project.goal_list_id, { name, updated_at: timestamp });
        await queueSyncOperation({
          table: 'goal_lists',
          entityId: project.goal_list_id,
          operationType: 'set',
          value: { name, updated_at: timestamp }
        });
        markEntityModified(project.goal_list_id);
      }
    }
  );

  if (updated) {
    markEntityModified(id);
    scheduleSyncPush();
  }

  return updated;
}

/**
 * Deletes a project and all its associated entities (cascade delete).
 * - Deletes the project's goal list and all its goals
 * - Deletes the project's tag (tasks using this tag become untagged)
 * - Deletes the project's commitment
 */
export async function deleteProject(id: string): Promise<void> {
  const timestamp = now();

  const project = await db.projects.get(id);
  if (!project) return;

  // Get goals in the goal list (outside transaction for read)
  const goals = project.goal_list_id
    ? await db.goals.where('goal_list_id').equals(project.goal_list_id).toArray()
    : [];

  // Get tasks that reference the project's tag (to unlink them)
  const tasksWithTag = project.tag_id
    ? await db.longTermTasks.where('category_id').equals(project.tag_id).toArray()
    : [];

  await db.transaction(
    'rw',
    [db.projects, db.taskCategories, db.commitments, db.goalLists, db.goals, db.longTermTasks, db.syncQueue],
    async () => {
      // Delete goals in the goal list
      for (const goal of goals) {
        await db.goals.update(goal.id, { deleted: true, updated_at: timestamp });
        await queueDeleteOperation('goals', goal.id);
      }

      // Delete the goal list
      if (project.goal_list_id) {
        await db.goalLists.update(project.goal_list_id, { deleted: true, updated_at: timestamp });
        await queueDeleteOperation('goal_lists', project.goal_list_id);
      }

      // Unlink tasks from the tag before deleting it
      for (const task of tasksWithTag) {
        await db.longTermTasks.update(task.id, { category_id: null, updated_at: timestamp });
        await queueSyncOperation({
          table: 'long_term_tasks',
          entityId: task.id,
          operationType: 'set',
          field: 'category_id',
          value: null
        });
      }

      // Delete the tag
      if (project.tag_id) {
        await db.taskCategories.update(project.tag_id, { deleted: true, updated_at: timestamp });
        await queueDeleteOperation('task_categories', project.tag_id);
      }

      // Delete the commitment
      if (project.commitment_id) {
        await db.commitments.update(project.commitment_id, { deleted: true, updated_at: timestamp });
        await queueDeleteOperation('commitments', project.commitment_id);
      }

      // Delete the project itself
      await db.projects.update(id, { deleted: true, updated_at: timestamp });
      await queueDeleteOperation('projects', id);
    }
  );

  // Mark all modified entities
  for (const goal of goals) {
    markEntityModified(goal.id);
  }
  for (const task of tasksWithTag) {
    markEntityModified(task.id);
  }
  if (project.goal_list_id) markEntityModified(project.goal_list_id);
  if (project.tag_id) markEntityModified(project.tag_id);
  if (project.commitment_id) markEntityModified(project.commitment_id);
  markEntityModified(id);
  scheduleSyncPush();
}

/**
 * Sets a project as the current project (unsets any other current project).
 */
export async function setCurrentProject(id: string): Promise<void> {
  const timestamp = now();

  const project = await db.projects.get(id);
  if (!project) return;

  // Get all projects for this user
  const allProjects = await db.projects.where('user_id').equals(project.user_id).toArray();
  const currentProjects = allProjects.filter((p) => p.is_current && !p.deleted && p.id !== id);

  await db.transaction('rw', [db.projects, db.syncQueue], async () => {
    // Unset any other current projects
    for (const current of currentProjects) {
      await db.projects.update(current.id, { is_current: false, updated_at: timestamp });
      await queueSyncOperation({
        table: 'projects',
        entityId: current.id,
        operationType: 'set',
        field: 'is_current',
        value: false
      });
    }

    // Set this project as current
    await db.projects.update(id, { is_current: true, updated_at: timestamp });
    await queueSyncOperation({
      table: 'projects',
      entityId: id,
      operationType: 'set',
      field: 'is_current',
      value: true
    });
  });

  // Mark all modified projects
  for (const current of currentProjects) {
    markEntityModified(current.id);
  }
  markEntityModified(id);
  scheduleSyncPush();
}

/**
 * Clears the current project status from all projects.
 */
export async function clearCurrentProject(userId: string): Promise<void> {
  const timestamp = now();

  const allProjects = await db.projects.where('user_id').equals(userId).toArray();
  const currentProjects = allProjects.filter((p) => p.is_current && !p.deleted);

  if (currentProjects.length === 0) return;

  await db.transaction('rw', [db.projects, db.syncQueue], async () => {
    for (const current of currentProjects) {
      await db.projects.update(current.id, { is_current: false, updated_at: timestamp });
      await queueSyncOperation({
        table: 'projects',
        entityId: current.id,
        operationType: 'set',
        field: 'is_current',
        value: false
      });
    }
  });

  for (const current of currentProjects) {
    markEntityModified(current.id);
  }
  scheduleSyncPush();
}

/**
 * Reorders a project to a new position.
 */
export async function reorderProject(id: string, newOrder: number): Promise<Project | undefined> {
  const timestamp = now();

  let updated: Project | undefined;
  await db.transaction('rw', [db.projects, db.syncQueue], async () => {
    await db.projects.update(id, { order: newOrder, updated_at: timestamp });
    updated = await db.projects.get(id);
    if (updated) {
      await queueSyncOperation({
        table: 'projects',
        entityId: id,
        operationType: 'set',
        field: 'order',
        value: newOrder
      });
    }
  });

  if (updated) {
    markEntityModified(id);
    scheduleSyncPush();
  }

  return updated;
}
