import { db, GoalPlannerDB } from './schema';

// Re-export the singleton instance
export { db };
export type { GoalPlannerDB };

// Helper to generate UUIDs
export function generateId(): string {
  return crypto.randomUUID();
}

// Helper to get current ISO timestamp
export function now(): string {
  return new Date().toISOString();
}

// Clear all local data (useful for logout)
export async function clearAllData(): Promise<void> {
  await db.transaction('rw', [db.goalLists, db.goals, db.dailyRoutineGoals, db.dailyGoalProgress, db.syncQueue], async () => {
    await db.goalLists.clear();
    await db.goals.clear();
    await db.dailyRoutineGoals.clear();
    await db.dailyGoalProgress.clear();
    await db.syncQueue.clear();
  });
}
