import type { FocusPhase, FocusSession, FocusSettings } from '$lib/types';

// Calculate remaining time in milliseconds for current phase
export function calculateRemainingMs(session: FocusSession): number {
  if (session.status === 'paused') {
    return session.phase_remaining_ms;
  }

  if (session.status !== 'running') {
    return 0;
  }

  const phaseStartTime = new Date(session.phase_started_at).getTime();
  const now = Date.now();
  const elapsed = now - phaseStartTime;
  const remaining = session.phase_remaining_ms - elapsed;

  return Math.max(0, remaining);
}

// Determine next phase after current phase completes
export function getNextPhase(session: FocusSession, settings: FocusSettings): {
  phase: FocusPhase;
  cycle: number;
  durationMs: number;
} {
  if (session.phase === 'focus') {
    // Focus phase completed - go to break
    const isLongBreak = session.current_cycle >= settings.cycles_before_long_break;
    const breakDurationMs = isLongBreak
      ? settings.long_break_duration * 60 * 1000
      : session.break_duration * 60 * 1000;

    return {
      phase: 'break',
      cycle: session.current_cycle,
      durationMs: breakDurationMs
    };
  }

  // Break phase completed - go to next focus
  if (session.current_cycle >= session.total_cycles) {
    // Session complete
    return {
      phase: 'idle',
      cycle: session.current_cycle,
      durationMs: 0
    };
  }

  // Start next focus cycle
  return {
    phase: 'focus',
    cycle: session.current_cycle + 1,
    durationMs: session.focus_duration * 60 * 1000
  };
}

// Format milliseconds as MM:SS
export function formatTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Format milliseconds as human-readable duration (e.g., "2h 15m")
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

// Calculate progress percentage (0-100)
export function calculateProgress(remainingMs: number, totalMs: number): number {
  if (totalMs === 0) return 0;
  const elapsed = totalMs - remainingMs;
  return Math.min(100, Math.max(0, (elapsed / totalMs) * 100));
}

// Generate schedule for session (array of phase info)
export interface SchedulePhase {
  type: 'focus' | 'break' | 'long_break';
  cycle: number;
  durationMinutes: number;
  isComplete: boolean;
  isCurrent: boolean;
}

export function generateSchedule(
  session: FocusSession | null,
  settings: FocusSettings
): SchedulePhase[] {
  if (!session) {
    // Show default schedule based on settings
    const phases: SchedulePhase[] = [];
    const totalCycles = settings.cycles_before_long_break;

    for (let i = 1; i <= totalCycles; i++) {
      phases.push({
        type: 'focus',
        cycle: i,
        durationMinutes: settings.focus_duration,
        isComplete: false,
        isCurrent: i === 1
      });

      if (i === totalCycles) {
        phases.push({
          type: 'long_break',
          cycle: i,
          durationMinutes: settings.long_break_duration,
          isComplete: false,
          isCurrent: false
        });
      } else {
        phases.push({
          type: 'break',
          cycle: i,
          durationMinutes: settings.break_duration,
          isComplete: false,
          isCurrent: false
        });
      }
    }

    return phases;
  }

  // Generate schedule based on current session
  const phases: SchedulePhase[] = [];

  for (let i = 1; i <= session.total_cycles; i++) {
    const focusComplete = session.phase === 'break' && session.current_cycle >= i ||
                          session.phase === 'focus' && session.current_cycle > i ||
                          session.phase === 'idle';
    const focusCurrent = session.phase === 'focus' && session.current_cycle === i;

    phases.push({
      type: 'focus',
      cycle: i,
      durationMinutes: session.focus_duration,
      isComplete: focusComplete,
      isCurrent: focusCurrent
    });

    const isLastCycle = i === session.total_cycles;
    const breakType = isLastCycle ? 'long_break' : 'break';
    const breakComplete = session.current_cycle > i ||
                          (session.phase === 'idle' && session.current_cycle >= i);
    const breakCurrent = session.phase === 'break' && session.current_cycle === i;

    phases.push({
      type: breakType,
      cycle: i,
      durationMinutes: isLastCycle ? settings.long_break_duration : session.break_duration,
      isComplete: breakComplete,
      isCurrent: breakCurrent
    });
  }

  return phases;
}

// Get phase display text
export function getPhaseText(phase: FocusPhase, isLongBreak: boolean = false): string {
  switch (phase) {
    case 'focus':
      return 'Focus Time';
    case 'break':
      return isLongBreak ? 'Long Break' : 'Short Break';
    case 'idle':
      return 'Session Complete';
  }
}
