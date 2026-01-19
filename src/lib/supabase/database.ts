import { supabase } from './client';
import type {
  Goal,
  GoalList,
  DailyRoutineGoal,
  DailyGoalProgress,
  GoalListWithProgress
} from '$lib/types';
import { calculateGoalProgress } from '$lib/utils/colors';

// ============ Goal Lists ============

export async function getGoalLists(): Promise<GoalListWithProgress[]> {
  const { data: lists, error } = await supabase
    .from('goal_lists')
    .select('*, goals(*)')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (lists || []).map((list) => {
    const goals = list.goals || [];
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
  });
}

export async function getGoalList(id: string): Promise<GoalList & { goals: Goal[] }> {
  const { data, error } = await supabase
    .from('goal_lists')
    .select('*, goals(*)')
    .eq('id', id)
    .single();

  if (error) throw error;

  // Sort goals by order
  if (data.goals) {
    data.goals.sort((a: Goal, b: Goal) => a.order - b.order);
  }

  return data;
}

export async function createGoalList(name: string): Promise<GoalList> {
  const { data, error } = await supabase
    .from('goal_lists')
    .insert({ name })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateGoalList(id: string, name: string): Promise<GoalList> {
  const { data, error } = await supabase
    .from('goal_lists')
    .update({ name })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteGoalList(id: string): Promise<void> {
  const { error } = await supabase.from('goal_lists').delete().eq('id', id);
  if (error) throw error;
}

// ============ Goals (in lists) ============

export async function createGoal(
  goalListId: string,
  name: string,
  type: 'completion' | 'incremental',
  targetValue: number | null
): Promise<Goal> {
  // Get the current max order
  const { data: existingGoals } = await supabase
    .from('goals')
    .select('order')
    .eq('goal_list_id', goalListId)
    .order('order', { ascending: false })
    .limit(1);

  const nextOrder = existingGoals && existingGoals.length > 0 ? existingGoals[0].order + 1 : 0;

  const { data, error } = await supabase
    .from('goals')
    .insert({
      goal_list_id: goalListId,
      name,
      type,
      target_value: type === 'incremental' ? targetValue : null,
      current_value: 0,
      completed: false,
      order: nextOrder
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateGoal(
  id: string,
  updates: Partial<Pick<Goal, 'name' | 'completed' | 'current_value' | 'target_value'>>
): Promise<Goal> {
  const { data, error } = await supabase
    .from('goals')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteGoal(id: string): Promise<void> {
  const { error } = await supabase.from('goals').delete().eq('id', id);
  if (error) throw error;
}

export async function incrementGoal(id: string, amount: number = 1): Promise<Goal> {
  const { data: goal, error: fetchError } = await supabase
    .from('goals')
    .select('current_value, target_value')
    .eq('id', id)
    .single();

  if (fetchError) throw fetchError;

  const newValue = Math.min(goal.current_value + amount, goal.target_value || Infinity);
  const completed = goal.target_value ? newValue >= goal.target_value : false;

  const { data, error } = await supabase
    .from('goals')
    .update({ current_value: newValue, completed })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============ Daily Routine Goals ============

export async function getDailyRoutineGoals(): Promise<DailyRoutineGoal[]> {
  const { data, error } = await supabase
    .from('daily_routine_goals')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getDailyRoutineGoal(id: string): Promise<DailyRoutineGoal> {
  const { data, error } = await supabase
    .from('daily_routine_goals')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function createDailyRoutineGoal(
  name: string,
  type: 'completion' | 'incremental',
  targetValue: number | null,
  startDate: string,
  endDate: string | null
): Promise<DailyRoutineGoal> {
  const { data, error } = await supabase
    .from('daily_routine_goals')
    .insert({
      name,
      type,
      target_value: type === 'incremental' ? targetValue : null,
      start_date: startDate,
      end_date: endDate
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateDailyRoutineGoal(
  id: string,
  updates: Partial<Pick<DailyRoutineGoal, 'name' | 'type' | 'target_value' | 'start_date' | 'end_date'>>
): Promise<DailyRoutineGoal> {
  const { data, error } = await supabase
    .from('daily_routine_goals')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteDailyRoutineGoal(id: string): Promise<void> {
  const { error } = await supabase.from('daily_routine_goals').delete().eq('id', id);
  if (error) throw error;
}

// ============ Daily Goal Progress ============

export async function getDailyProgress(date: string): Promise<DailyGoalProgress[]> {
  const { data, error } = await supabase
    .from('daily_goal_progress')
    .select('*')
    .eq('date', date);

  if (error) throw error;
  return data || [];
}

export async function getMonthProgress(year: number, month: number): Promise<DailyGoalProgress[]> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

  const { data, error } = await supabase
    .from('daily_goal_progress')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate);

  if (error) throw error;
  return data || [];
}

export async function upsertDailyProgress(
  dailyRoutineGoalId: string,
  date: string,
  currentValue: number,
  completed: boolean
): Promise<DailyGoalProgress> {
  // Check if progress exists
  const { data: existing } = await supabase
    .from('daily_goal_progress')
    .select('id')
    .eq('daily_routine_goal_id', dailyRoutineGoalId)
    .eq('date', date)
    .single();

  if (existing) {
    const { data, error } = await supabase
      .from('daily_goal_progress')
      .update({ current_value: currentValue, completed })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase
      .from('daily_goal_progress')
      .insert({
        daily_routine_goal_id: dailyRoutineGoalId,
        date,
        current_value: currentValue,
        completed
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

export async function incrementDailyProgress(
  dailyRoutineGoalId: string,
  date: string,
  targetValue: number,
  amount: number = 1
): Promise<DailyGoalProgress> {
  // Get current progress
  const { data: existing } = await supabase
    .from('daily_goal_progress')
    .select('*')
    .eq('daily_routine_goal_id', dailyRoutineGoalId)
    .eq('date', date)
    .single();

  const currentValue = existing ? existing.current_value : 0;
  const newValue = Math.min(currentValue + amount, targetValue);
  const completed = newValue >= targetValue;

  return upsertDailyProgress(dailyRoutineGoalId, date, newValue, completed);
}
