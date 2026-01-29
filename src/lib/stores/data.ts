import { writable, type Writable } from 'svelte/store';
import type {
  GoalListWithProgress,
  Goal,
  GoalList,
  DailyRoutineGoal,
  DailyGoalProgress,
  DayProgress,
  TaskCategory,
  Commitment,
  CommitmentSection,
  DailyTask,
  LongTermTask,
  LongTermTaskWithCategory,
  Project,
  ProjectWithDetails
} from '$lib/types';
import * as repo from '$lib/db/repositories';
import * as sync from '$lib/sync/engine';
import { calculateGoalProgressCapped } from '$lib/utils/colors';
import { isRoutineActiveOnDate } from '$lib/utils/dates';
import { browser } from '$app/environment';
import { remoteChangesStore } from '$lib/stores/remoteChanges';

// ============================================================
// LOCAL-FIRST STORES
//
// All reads come from local DB via sync engine functions.
// Writes go to local DB immediately via repositories.
// Background sync updates local, stores can refresh from local.
// ============================================================

// Goal Lists Store
function createGoalListsStore() {
  const { subscribe, set, update }: Writable<GoalListWithProgress[]> = writable([]);
  const loading = writable(true);
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },
    load: async () => {
      loading.set(true);
      try {
        // Always read from local DB
        const lists = await sync.getGoalLists();
        set(lists);

        // Register for sync complete to auto-refresh
        if (browser && !unsubscribe) {
          unsubscribe = sync.onSyncComplete(async () => {
            const refreshed = await sync.getGoalLists();
            set(refreshed);
          });
        }
      } finally {
        loading.set(false);
      }
    },
    create: async (name: string, userId: string) => {
      // Write to local DB immediately
      const newList = await repo.createGoalList(name, userId);
      // Record for animation before updating store (so element mounts with animation)
      remoteChangesStore.recordLocalChange(newList.id, 'goal_lists', 'create');
      update((lists) => [
        { ...newList, totalGoals: 0, completedGoals: 0, completionPercentage: 0 },
        ...lists
      ]);
      return newList;
    },
    update: async (id: string, name: string) => {
      const updated = await repo.updateGoalList(id, name);
      if (updated) {
        update((lists) => lists.map((l) => (l.id === id ? { ...l, name } : l)));
      }
      return updated;
    },
    delete: async (id: string) => {
      await repo.deleteGoalList(id);
      update((lists) => lists.filter((l) => l.id !== id));
    },
    refresh: async () => {
      const lists = await sync.getGoalLists();
      set(lists);
    }
  };
}

export const goalListsStore = createGoalListsStore();

// Single Goal List with Goals Store
function createGoalListStore() {
  const { subscribe, set, update }: Writable<(GoalList & { goals: Goal[] }) | null> =
    writable(null);
  const loading = writable(true);
  let currentId: string | null = null;
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },
    load: async (id: string) => {
      loading.set(true);
      currentId = id;
      try {
        // Always read from local DB
        const list = await sync.getGoalList(id);
        set(list);

        // Register for sync complete to auto-refresh
        if (browser && !unsubscribe) {
          unsubscribe = sync.onSyncComplete(async () => {
            if (currentId) {
              const refreshed = await sync.getGoalList(currentId);
              set(refreshed);
            }
          });
        }
      } finally {
        loading.set(false);
      }
    },
    updateName: async (id: string, name: string) => {
      await repo.updateGoalList(id, name);
      update((list) => (list ? { ...list, name } : null));
    },
    addGoal: async (
      goalListId: string,
      name: string,
      type: 'completion' | 'incremental',
      targetValue: number | null
    ) => {
      const newGoal = await repo.createGoal(goalListId, name, type, targetValue);
      // Record for animation before updating store
      remoteChangesStore.recordLocalChange(newGoal.id, 'goals', 'create');
      // Prepend to top (new items have lower order values)
      update((list) => (list ? { ...list, goals: [newGoal, ...list.goals] } : null));
      return newGoal;
    },
    updateGoal: async (
      goalId: string,
      updates: Partial<Pick<Goal, 'name' | 'type' | 'completed' | 'current_value' | 'target_value'>>
    ) => {
      const updated = await repo.updateGoal(goalId, updates);
      if (updated) {
        update((list) =>
          list
            ? {
                ...list,
                goals: list.goals.map((g) => (g.id === goalId ? updated : g))
              }
            : null
        );
      }
      return updated;
    },
    deleteGoal: async (goalId: string) => {
      await repo.deleteGoal(goalId);
      update((list) =>
        list
          ? {
              ...list,
              goals: list.goals.filter((g) => g.id !== goalId)
            }
          : null
      );
    },
    incrementGoal: async (goalId: string, amount: number = 1) => {
      const updated = await repo.incrementGoal(goalId, amount);
      if (updated) {
        update((list) =>
          list
            ? {
                ...list,
                goals: list.goals.map((g) => (g.id === goalId ? updated : g))
              }
            : null
        );
      }
      return updated;
    },
    reorderGoal: async (goalId: string, newOrder: number) => {
      const updated = await repo.reorderGoal(goalId, newOrder);
      if (updated) {
        update((list) => {
          if (!list) return null;
          const updatedGoals = list.goals.map((g) => (g.id === goalId ? updated : g));
          // Re-sort by order
          updatedGoals.sort((a, b) => a.order - b.order);
          return { ...list, goals: updatedGoals };
        });
      }
      return updated;
    },
    clear: () => {
      currentId = null;
      set(null);
    }
  };
}

export const goalListStore = createGoalListStore();

// Daily Routines Store
function createDailyRoutinesStore() {
  const { subscribe, set, update }: Writable<DailyRoutineGoal[]> = writable([]);
  const loading = writable(true);
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },
    load: async () => {
      loading.set(true);
      try {
        // Always read from local DB
        const routines = await sync.getDailyRoutineGoals();
        set(routines);

        // Register for sync complete to auto-refresh
        if (browser && !unsubscribe) {
          unsubscribe = sync.onSyncComplete(async () => {
            const refreshed = await sync.getDailyRoutineGoals();
            set(refreshed);
          });
        }
      } finally {
        loading.set(false);
      }
    },
    create: async (
      name: string,
      type: 'completion' | 'incremental',
      targetValue: number | null,
      startDate: string,
      endDate: string | null,
      userId: string,
      activeDays: DailyRoutineGoal['active_days'] = null
    ) => {
      const newRoutine = await repo.createDailyRoutineGoal(
        name,
        type,
        targetValue,
        startDate,
        endDate,
        userId,
        activeDays
      );
      // Record for animation before updating store
      remoteChangesStore.recordLocalChange(newRoutine.id, 'daily_routine_goals', 'create');
      update((routines) => [newRoutine, ...routines]);
      return newRoutine;
    },
    update: async (
      id: string,
      updates: Partial<
        Pick<
          DailyRoutineGoal,
          'name' | 'type' | 'target_value' | 'start_date' | 'end_date' | 'active_days'
        >
      >
    ) => {
      const updated = await repo.updateDailyRoutineGoal(id, updates);
      if (updated) {
        update((routines) => routines.map((r) => (r.id === id ? updated : r)));
      }
      return updated;
    },
    delete: async (id: string) => {
      await repo.deleteDailyRoutineGoal(id);
      update((routines) => routines.filter((r) => r.id !== id));
    },
    reorder: async (id: string, newOrder: number) => {
      const updated = await repo.reorderDailyRoutineGoal(id, newOrder);
      if (updated) {
        update((routines) => {
          const updatedRoutines = routines.map((r) => (r.id === id ? updated : r));
          // Re-sort by order
          updatedRoutines.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          return updatedRoutines;
        });
      }
      return updated;
    },
    refresh: async () => {
      const routines = await sync.getDailyRoutineGoals();
      set(routines);
    }
  };
}

export const dailyRoutinesStore = createDailyRoutinesStore();

// Single Routine Store
function createRoutineStore() {
  const { subscribe, set }: Writable<DailyRoutineGoal | null> = writable(null);
  const loading = writable(true);
  let currentId: string | null = null;
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },
    load: async (id: string) => {
      loading.set(true);
      currentId = id;
      try {
        // Always read from local DB
        const routine = await sync.getDailyRoutineGoal(id);
        set(routine);

        // Register for sync complete to auto-refresh
        if (browser && !unsubscribe) {
          unsubscribe = sync.onSyncComplete(async () => {
            if (currentId) {
              const refreshed = await sync.getDailyRoutineGoal(currentId);
              set(refreshed);
            }
          });
        }
      } finally {
        loading.set(false);
      }
    },
    update: async (
      id: string,
      updates: Partial<
        Pick<
          DailyRoutineGoal,
          'name' | 'type' | 'target_value' | 'start_date' | 'end_date' | 'active_days'
        >
      >
    ) => {
      const updated = await repo.updateDailyRoutineGoal(id, updates);
      if (updated) {
        set(updated);
      }
      return updated;
    },
    clear: () => {
      currentId = null;
      set(null);
    }
  };
}

export const routineStore = createRoutineStore();

// Daily Progress Store (for a specific date)
interface DailyProgressState {
  date: string;
  routines: DailyRoutineGoal[];
  progress: Map<string, DailyGoalProgress>;
}

function createDailyProgressStore() {
  const { subscribe, set, update }: Writable<DailyProgressState | null> = writable(null);
  const loading = writable(true);
  let currentDate: string | null = null;
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },
    load: async (date: string) => {
      loading.set(true);
      currentDate = date;
      try {
        // Always read from local DB
        const [routines, progressList] = await Promise.all([
          sync.getActiveRoutinesForDate(date),
          sync.getDailyProgress(date)
        ]);

        const progressMap = new Map<string, DailyGoalProgress>();
        for (const p of progressList) {
          progressMap.set(p.daily_routine_goal_id, p);
        }

        set({ date, routines, progress: progressMap });

        // Register for sync complete to auto-refresh
        if (browser && !unsubscribe) {
          unsubscribe = sync.onSyncComplete(async () => {
            if (currentDate) {
              const [r, p] = await Promise.all([
                sync.getActiveRoutinesForDate(currentDate),
                sync.getDailyProgress(currentDate)
              ]);
              const pMap = new Map<string, DailyGoalProgress>();
              for (const prog of p) {
                pMap.set(prog.daily_routine_goal_id, prog);
              }
              set({ date: currentDate, routines: r, progress: pMap });
            }
          });
        }
      } finally {
        loading.set(false);
      }
    },
    toggleComplete: async (routineId: string, date: string) => {
      let state: DailyProgressState | null = null;
      update((s) => {
        state = s;
        return s;
      });

      if (!state) return;
      const current = (state as DailyProgressState).progress.get(routineId);
      const newCompleted = !current?.completed;

      const updated = await repo.upsertDailyProgress(
        routineId,
        date,
        current?.current_value || 0,
        newCompleted
      );

      update((s) => {
        if (!s) return s;
        const newProgress = new Map(s.progress);
        newProgress.set(routineId, updated);
        return { ...s, progress: newProgress };
      });
    },
    increment: async (routineId: string, date: string, targetValue: number, amount: number = 1) => {
      let state: DailyProgressState | null = null;
      update((s) => {
        state = s;
        return s;
      });

      if (!state) return;

      const updated = await repo.incrementDailyProgress(routineId, date, targetValue, amount);

      update((s) => {
        if (!s) return s;
        const newProgress = new Map(s.progress);
        newProgress.set(routineId, updated);
        return { ...s, progress: newProgress };
      });
    },
    setValue: async (routineId: string, date: string, targetValue: number, value: number) => {
      let state: DailyProgressState | null = null;
      update((s) => {
        state = s;
        return s;
      });

      if (!state) return;

      // Only prevent negative - allow overflow above target
      const clamped = Math.max(0, value);
      const completed = clamped >= targetValue;

      const updated = await repo.upsertDailyProgress(routineId, date, clamped, completed);

      update((s) => {
        if (!s) return s;
        const newProgress = new Map(s.progress);
        newProgress.set(routineId, updated);
        return { ...s, progress: newProgress };
      });
    },
    clear: () => {
      currentDate = null;
      set(null);
    }
  };
}

export const dailyProgressStore = createDailyProgressStore();

// Month Progress Store (for calendar view)
interface MonthProgressState {
  year: number;
  month: number;
  dayProgress: Map<string, DayProgress>;
}

function createMonthProgressStore() {
  const { subscribe, set }: Writable<MonthProgressState | null> = writable(null);
  const loading = writable(true);
  let currentYear: number | null = null;
  let currentMonth: number | null = null;
  let unsubscribe: (() => void) | null = null;

  async function loadMonthData(year: number, month: number): Promise<MonthProgressState> {
    // Always read from local DB
    const [routines, progressList] = await Promise.all([
      sync.getDailyRoutineGoals(),
      sync.getMonthProgress(year, month)
    ]);

    // Group progress by date
    const progressByDate = new Map<string, DailyGoalProgress[]>();
    for (const p of progressList) {
      const list = progressByDate.get(p.date) || [];
      list.push(p);
      progressByDate.set(p.date, list);
    }

    // Calculate day progress
    const dayProgress = new Map<string, DayProgress>();
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      // Get active routines for this date (checks both date range AND active days)
      const activeRoutines = routines.filter((r) => isRoutineActiveOnDate(r, dateStr));

      if (activeRoutines.length === 0) continue;

      const dayProgressList = progressByDate.get(dateStr) || [];
      const progressMap = new Map<string, DailyGoalProgress>();
      for (const p of dayProgressList) {
        progressMap.set(p.daily_routine_goal_id, p);
      }

      let completedProgress = 0;
      let completedGoals = 0;

      for (const routine of activeRoutines) {
        const progress = progressMap.get(routine.id);
        const currentValue = progress?.current_value || 0;
        const isCompleted = progress?.completed || false;

        const progressPercent = calculateGoalProgressCapped(
          routine.type,
          isCompleted,
          currentValue,
          routine.target_value
        );
        completedProgress += progressPercent;

        if (
          routine.type === 'completion' ? isCompleted : currentValue >= (routine.target_value || 0)
        ) {
          completedGoals++;
        }
      }

      dayProgress.set(dateStr, {
        date: dateStr,
        totalGoals: activeRoutines.length,
        completedGoals,
        completionPercentage: Math.round(completedProgress / activeRoutines.length)
      });
    }

    return { year, month, dayProgress };
  }

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },
    load: async (year: number, month: number) => {
      loading.set(true);
      currentYear = year;
      currentMonth = month;
      try {
        const state = await loadMonthData(year, month);
        set(state);

        // Register for sync complete to auto-refresh
        if (browser && !unsubscribe) {
          unsubscribe = sync.onSyncComplete(async () => {
            if (currentYear !== null && currentMonth !== null) {
              const refreshed = await loadMonthData(currentYear, currentMonth);
              set(refreshed);
            }
          });
        }
      } finally {
        loading.set(false);
      }
    },
    clear: () => {
      currentYear = null;
      currentMonth = null;
      set(null);
    }
  };
}

export const monthProgressStore = createMonthProgressStore();

// ============================================================
// TASKS FEATURE STORES
// ============================================================

// Task Categories Store
function createTaskCategoriesStore() {
  const { subscribe, set, update }: Writable<TaskCategory[]> = writable([]);
  const loading = writable(true);
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },
    load: async () => {
      loading.set(true);
      try {
        const categories = await sync.getTaskCategories();
        set(categories);

        if (browser && !unsubscribe) {
          unsubscribe = sync.onSyncComplete(async () => {
            const refreshed = await sync.getTaskCategories();
            set(refreshed);
          });
        }
      } finally {
        loading.set(false);
      }
    },
    create: async (name: string, color: string, userId: string) => {
      const newCategory = await repo.createTaskCategory(name, color, userId);
      // Record for animation before updating store
      remoteChangesStore.recordLocalChange(newCategory.id, 'task_categories', 'create');
      update((categories) => [newCategory, ...categories]);
      return newCategory;
    },
    update: async (id: string, updates: Partial<Pick<TaskCategory, 'name' | 'color'>>) => {
      const updated = await repo.updateTaskCategory(id, updates);
      if (updated) {
        update((categories) => categories.map((c) => (c.id === id ? updated : c)));
      }
      return updated;
    },
    delete: async (id: string) => {
      await repo.deleteTaskCategory(id);
      update((categories) => categories.filter((c) => c.id !== id));
    },
    reorder: async (id: string, newOrder: number) => {
      const updated = await repo.reorderTaskCategory(id, newOrder);
      if (updated) {
        update((categories) => {
          const updatedCategories = categories.map((c) => (c.id === id ? updated : c));
          updatedCategories.sort((a, b) => a.order - b.order);
          return updatedCategories;
        });
      }
      return updated;
    },
    refresh: async () => {
      const categories = await sync.getTaskCategories();
      set(categories);
    }
  };
}

export const taskCategoriesStore = createTaskCategoriesStore();

// Commitments Store
function createCommitmentsStore() {
  const { subscribe, set, update }: Writable<Commitment[]> = writable([]);
  const loading = writable(true);
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },
    load: async () => {
      loading.set(true);
      try {
        const commitments = await sync.getCommitments();
        set(commitments);

        if (browser && !unsubscribe) {
          unsubscribe = sync.onSyncComplete(async () => {
            const refreshed = await sync.getCommitments();
            set(refreshed);
          });
        }
      } finally {
        loading.set(false);
      }
    },
    create: async (name: string, section: CommitmentSection, userId: string) => {
      const newCommitment = await repo.createCommitment(name, section, userId);
      // Record for animation before updating store
      remoteChangesStore.recordLocalChange(newCommitment.id, 'commitments', 'create');
      update((commitments) => [newCommitment, ...commitments]);
      return newCommitment;
    },
    update: async (id: string, updates: Partial<Pick<Commitment, 'name' | 'section'>>) => {
      const updated = await repo.updateCommitment(id, updates);
      if (updated) {
        update((commitments) => commitments.map((c) => (c.id === id ? updated : c)));
      }
      return updated;
    },
    delete: async (id: string) => {
      await repo.deleteCommitment(id);
      update((commitments) => commitments.filter((c) => c.id !== id));
    },
    reorder: async (id: string, newOrder: number) => {
      const updated = await repo.reorderCommitment(id, newOrder);
      if (updated) {
        update((commitments) => {
          const updatedCommitments = commitments.map((c) => (c.id === id ? updated : c));
          updatedCommitments.sort((a, b) => a.order - b.order);
          return updatedCommitments;
        });
      }
      return updated;
    },
    refresh: async () => {
      const commitments = await sync.getCommitments();
      set(commitments);
    }
  };
}

export const commitmentsStore = createCommitmentsStore();

// Daily Tasks Store
function createDailyTasksStore() {
  const { subscribe, set, update }: Writable<DailyTask[]> = writable([]);
  const loading = writable(true);
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },
    load: async () => {
      loading.set(true);
      try {
        const tasks = await sync.getDailyTasks();
        set(tasks);

        if (browser && !unsubscribe) {
          unsubscribe = sync.onSyncComplete(async () => {
            const refreshed = await sync.getDailyTasks();
            set(refreshed);
          });
        }
      } finally {
        loading.set(false);
      }
    },
    create: async (name: string, userId: string) => {
      const newTask = await repo.createDailyTask(name, userId);
      // Record for animation before updating store
      remoteChangesStore.recordLocalChange(newTask.id, 'daily_tasks', 'create');
      // Prepend to top (new items have lower order values)
      update((tasks) => [newTask, ...tasks]);
      return newTask;
    },
    update: async (id: string, updates: Partial<Pick<DailyTask, 'name' | 'completed'>>) => {
      const updated = await repo.updateDailyTask(id, updates);
      if (updated) {
        update((tasks) => tasks.map((t) => (t.id === id ? updated : t)));
      }
      return updated;
    },
    toggle: async (id: string) => {
      const updated = await repo.toggleDailyTaskComplete(id);
      if (updated) {
        update((tasks) => tasks.map((t) => (t.id === id ? updated : t)));
      }
      return updated;
    },
    delete: async (id: string) => {
      await repo.deleteDailyTask(id);
      update((tasks) => tasks.filter((t) => t.id !== id));
    },
    reorder: async (id: string, newOrder: number) => {
      const updated = await repo.reorderDailyTask(id, newOrder);
      if (updated) {
        update((tasks) => {
          const updatedTasks = tasks.map((t) => (t.id === id ? updated : t));
          updatedTasks.sort((a, b) => a.order - b.order);
          return updatedTasks;
        });
      }
      return updated;
    },
    clearCompleted: async (userId: string) => {
      await repo.clearCompletedDailyTasks(userId);
      update((tasks) => tasks.filter((t) => !t.completed));
    },
    refresh: async () => {
      const tasks = await sync.getDailyTasks();
      set(tasks);
    }
  };
}

export const dailyTasksStore = createDailyTasksStore();

// Long Term Tasks Store
function createLongTermTasksStore() {
  const { subscribe, set, update }: Writable<LongTermTaskWithCategory[]> = writable([]);
  const loading = writable(true);
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },
    load: async () => {
      loading.set(true);
      try {
        const tasks = await sync.getLongTermTasks();
        set(tasks);

        if (browser && !unsubscribe) {
          unsubscribe = sync.onSyncComplete(async () => {
            const refreshed = await sync.getLongTermTasks();
            set(refreshed);
          });
        }
      } finally {
        loading.set(false);
      }
    },
    create: async (name: string, dueDate: string, categoryId: string | null, userId: string) => {
      const newTask = await repo.createLongTermTask(name, dueDate, categoryId, userId);
      // Record for animation before updating store
      remoteChangesStore.recordLocalChange(newTask.id, 'long_term_tasks', 'create');
      // Fetch the task with category for the store
      const taskWithCategory = await sync.getLongTermTask(newTask.id);
      if (taskWithCategory) {
        update((tasks) => [...tasks, taskWithCategory]);
      }
      return newTask;
    },
    update: async (
      id: string,
      updates: Partial<Pick<LongTermTask, 'name' | 'due_date' | 'category_id' | 'completed'>>
    ) => {
      const updated = await repo.updateLongTermTask(id, updates);
      if (updated) {
        // Fetch the updated task with category
        const taskWithCategory = await sync.getLongTermTask(updated.id);
        if (taskWithCategory) {
          update((tasks) => tasks.map((t) => (t.id === id ? taskWithCategory : t)));
        }
      }
      return updated;
    },
    toggle: async (id: string) => {
      const updated = await repo.toggleLongTermTaskComplete(id);
      if (updated) {
        const taskWithCategory = await sync.getLongTermTask(updated.id);
        if (taskWithCategory) {
          update((tasks) => tasks.map((t) => (t.id === id ? taskWithCategory : t)));
        }
      }
      return updated;
    },
    delete: async (id: string) => {
      await repo.deleteLongTermTask(id);
      update((tasks) => tasks.filter((t) => t.id !== id));
    },
    refresh: async () => {
      const tasks = await sync.getLongTermTasks();
      set(tasks);
    }
  };
}

export const longTermTasksStore = createLongTermTasksStore();

// ============================================================
// PROJECTS FEATURE STORE
// ============================================================

// Projects Store - returns projects with their related goal list progress and tag
function createProjectsStore() {
  const { subscribe, set, update }: Writable<ProjectWithDetails[]> = writable([]);
  const loading = writable(true);
  let unsubscribe: (() => void) | null = null;

  async function loadProjectsWithDetails(): Promise<ProjectWithDetails[]> {
    const projects = await sync.getProjects();
    const goalLists = await sync.getGoalLists();
    const categories = await sync.getTaskCategories();

    // Join projects with their goal lists and tags
    return projects.map((project) => {
      const goalList = project.goal_list_id
        ? goalLists.find((gl) => gl.id === project.goal_list_id) || null
        : null;
      const tag = project.tag_id
        ? categories.find((c) => c.id === project.tag_id) || null
        : null;

      return {
        ...project,
        goalList,
        tag
      };
    });
  }

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },
    load: async () => {
      loading.set(true);
      try {
        const projectsWithDetails = await loadProjectsWithDetails();
        set(projectsWithDetails);

        if (browser && !unsubscribe) {
          unsubscribe = sync.onSyncComplete(async () => {
            const refreshed = await loadProjectsWithDetails();
            set(refreshed);
          });
        }
      } finally {
        loading.set(false);
      }
    },
    create: async (name: string, userId: string) => {
      const newProject = await repo.createProject(name, userId);
      // Record for animation before updating store
      remoteChangesStore.recordLocalChange(newProject.id, 'projects', 'create');
      // Refresh to get full details
      const projectsWithDetails = await loadProjectsWithDetails();
      set(projectsWithDetails);
      return newProject;
    },
    update: async (id: string, name: string) => {
      const updated = await repo.updateProject(id, name);
      if (updated) {
        // Refresh to get updated related entities
        const projectsWithDetails = await loadProjectsWithDetails();
        set(projectsWithDetails);
      }
      return updated;
    },
    delete: async (id: string) => {
      await repo.deleteProject(id);
      update((projects) => projects.filter((p) => p.id !== id));
    },
    setCurrent: async (id: string) => {
      await repo.setCurrentProject(id);
      // Refresh to reflect is_current changes
      const projectsWithDetails = await loadProjectsWithDetails();
      set(projectsWithDetails);
    },
    clearCurrent: async (userId: string) => {
      await repo.clearCurrentProject(userId);
      // Refresh to reflect is_current changes
      const projectsWithDetails = await loadProjectsWithDetails();
      set(projectsWithDetails);
    },
    refresh: async () => {
      const projectsWithDetails = await loadProjectsWithDetails();
      set(projectsWithDetails);
    }
  };
}

export const projectsStore = createProjectsStore();
