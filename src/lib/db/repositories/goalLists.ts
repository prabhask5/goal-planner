import { db, generateId, now } from '../client';
import type { GoalList, GoalListWithProgress, Goal } from '$lib/types';
import { calculateGoalProgress } from '$lib/utils/colors';
import { queueSync } from '$lib/sync/queue';

export async function getGoalLists(): Promise<GoalListWithProgress[]> {
  const lists = await db.goalLists.orderBy('created_at').reverse().toArray();

  const listsWithProgress: GoalListWithProgress[] = await Promise.all(
    lists.map(async (list) => {
      const goals = await db.goals.where('goal_list_id').equals(list.id).toArray();
      const totalGoals = goals.length;
      const completedProgress = goals.reduce((sum: number, goal: Goal) => {
        return sum + calculateGoalProgress(goal.type, goal.completed, goal.current_value, goal.target_value);
      }, 0);
      const completionPercentage = totalGoals > 0 ? completedProgress / totalGoals : 0;

      return {
        ...list,
        totalGoals,
        completedGoals: goals.filter((g: Goal) =>
          g.type === 'completion' ? g.completed : g.current_value >= (g.target_value || 0)
        ).length,
        completionPercentage: Math.round(completionPercentage)
      };
    })
  );

  return listsWithProgress;
}

export async function getGoalList(id: string): Promise<(GoalList & { goals: Goal[] }) | undefined> {
  const list = await db.goalLists.get(id);
  if (!list) return undefined;

  const goals = await db.goals
    .where('goal_list_id')
    .equals(id)
    .toArray();

  // Sort by order
  goals.sort((a, b) => a.order - b.order);

  return { ...list, goals };
}

export async function createGoalList(name: string, userId: string): Promise<GoalList> {
  const timestamp = now();
  const newList: GoalList = {
    id: generateId(),
    user_id: userId,
    name,
    created_at: timestamp,
    updated_at: timestamp
  };

  await db.goalLists.add(newList);

  // Queue for sync
  await queueSync('goal_lists', 'create', newList.id, {
    name,
    user_id: userId
  });

  return newList;
}

export async function updateGoalList(id: string, name: string): Promise<GoalList | undefined> {
  const timestamp = now();

  await db.goalLists.update(id, { name, updated_at: timestamp });

  const updated = await db.goalLists.get(id);
  if (!updated) return undefined;

  // Queue for sync
  await queueSync('goal_lists', 'update', id, { name });

  return updated;
}

export async function deleteGoalList(id: string): Promise<void> {
  await db.transaction('rw', [db.goalLists, db.goals], async () => {
    // Delete all goals in this list first
    await db.goals.where('goal_list_id').equals(id).delete();
    await db.goalLists.delete(id);
  });

  // Queue for sync
  await queueSync('goal_lists', 'delete', id, {});
}
