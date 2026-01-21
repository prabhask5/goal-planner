import { db, generateId, now } from '../client';
import type { FocusSession, FocusPhase, FocusStatus } from '$lib/types';
import { queueSync, queueSyncDirect } from '$lib/sync/queue';
import { scheduleSyncPush } from '$lib/sync/engine';

export async function getActiveSession(userId: string): Promise<FocusSession | null> {
  const sessions = await db.focusSessions
    .where('user_id')
    .equals(userId)
    .toArray();

  // Find active session (not deleted and not ended)
  const active = sessions.find(s => !s.deleted && !s.ended_at && s.status !== 'stopped');
  return active || null;
}

export async function getFocusSession(id: string): Promise<FocusSession | null> {
  const session = await db.focusSessions.get(id);
  if (!session || session.deleted) return null;
  return session;
}

export async function createFocusSession(
  userId: string,
  focusDuration: number,
  breakDuration: number,
  totalCycles: number
): Promise<FocusSession> {
  const timestamp = now();
  const focusDurationMs = focusDuration * 60 * 1000;

  const newSession: FocusSession = {
    id: generateId(),
    user_id: userId,
    started_at: timestamp,
    ended_at: null,
    phase: 'focus',
    status: 'running',
    current_cycle: 1,
    total_cycles: totalCycles,
    focus_duration: focusDuration,
    break_duration: breakDuration,
    phase_started_at: timestamp,
    phase_remaining_ms: focusDurationMs,
    elapsed_duration: 0,
    created_at: timestamp,
    updated_at: timestamp
  };

  await db.transaction('rw', [db.focusSessions, db.syncQueue], async () => {
    await db.focusSessions.add(newSession);
    await queueSyncDirect('focus_sessions', 'create', newSession.id, {
      user_id: userId,
      started_at: timestamp,
      ended_at: null,
      phase: 'focus',
      status: 'running',
      current_cycle: 1,
      total_cycles: totalCycles,
      focus_duration: focusDuration,
      break_duration: breakDuration,
      phase_started_at: timestamp,
      phase_remaining_ms: focusDurationMs,
      elapsed_duration: 0,
      created_at: timestamp,
      updated_at: timestamp
    });
  });
  scheduleSyncPush();

  return newSession;
}

export async function updateFocusSession(
  id: string,
  updates: Partial<Pick<FocusSession, 'phase' | 'status' | 'current_cycle' | 'phase_started_at' | 'phase_remaining_ms' | 'ended_at' | 'elapsed_duration'>>
): Promise<FocusSession | undefined> {
  const timestamp = now();

  await db.focusSessions.update(id, { ...updates, updated_at: timestamp });

  const updated = await db.focusSessions.get(id);
  if (!updated) return undefined;

  await queueSync('focus_sessions', 'update', id, { ...updates, updated_at: timestamp });
  scheduleSyncPush();

  return updated;
}

export async function pauseFocusSession(id: string, remainingMs: number): Promise<FocusSession | undefined> {
  return updateFocusSession(id, {
    status: 'paused',
    phase_remaining_ms: remainingMs
  });
}

export async function resumeFocusSession(id: string): Promise<FocusSession | undefined> {
  const timestamp = now();
  return updateFocusSession(id, {
    status: 'running',
    phase_started_at: timestamp
  });
}

export async function stopFocusSession(id: string, currentFocusElapsedMinutes?: number): Promise<FocusSession | undefined> {
  const timestamp = now();
  const session = await db.focusSessions.get(id);
  if (!session) return undefined;

  const updates: Partial<Pick<FocusSession, 'phase' | 'status' | 'current_cycle' | 'phase_started_at' | 'phase_remaining_ms' | 'ended_at' | 'elapsed_duration'>> = {
    status: 'stopped',
    ended_at: timestamp,
    phase: 'idle'
  };

  // If stopping during a focus phase, add the elapsed time
  if (currentFocusElapsedMinutes !== undefined) {
    updates.elapsed_duration = (session.elapsed_duration || 0) + currentFocusElapsedMinutes;
  }

  return updateFocusSession(id, updates);
}

export async function advancePhase(
  id: string,
  newPhase: FocusPhase,
  newCycle: number,
  phaseDurationMs: number,
  previousFocusElapsedMinutes?: number
): Promise<FocusSession | undefined> {
  const timestamp = now();
  const session = await db.focusSessions.get(id);
  if (!session) return undefined;

  // If we're advancing from a focus phase, add the elapsed time
  const updates: Partial<Pick<FocusSession, 'phase' | 'status' | 'current_cycle' | 'phase_started_at' | 'phase_remaining_ms' | 'ended_at' | 'elapsed_duration'>> = {
    phase: newPhase,
    current_cycle: newCycle,
    phase_started_at: timestamp,
    phase_remaining_ms: phaseDurationMs
  };

  if (previousFocusElapsedMinutes !== undefined) {
    updates.elapsed_duration = (session.elapsed_duration || 0) + previousFocusElapsedMinutes;
  }

  return updateFocusSession(id, updates);
}

export async function getTodayFocusTime(userId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();

  const sessions = await db.focusSessions
    .where('user_id')
    .equals(userId)
    .toArray();

  // Sum up focus time from sessions today using elapsed_duration
  let totalMs = 0;
  for (const session of sessions) {
    if (session.deleted) continue;
    if (session.started_at < todayStr) continue;

    // Use elapsed_duration (actual time spent in focus phases)
    totalMs += (session.elapsed_duration || 0) * 60 * 1000;

    // For currently running focus phase, add current elapsed time
    if (!session.ended_at && session.phase === 'focus' && session.status === 'running') {
      const currentElapsed = Date.now() - new Date(session.phase_started_at).getTime();
      totalMs += Math.min(currentElapsed, session.focus_duration * 60 * 1000);
    }
  }

  return totalMs;
}
