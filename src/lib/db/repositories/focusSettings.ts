import { db, generateId, now } from '../client';
import type { FocusSettings } from '$lib/types';
import { queueCreateOperation, queueSyncOperation } from '$lib/sync/queue';
import { scheduleSyncPush, markEntityModified } from '$lib/sync/engine';

// Default focus settings
const DEFAULT_FOCUS_SETTINGS = {
  focus_duration: 25,
  break_duration: 5,
  long_break_duration: 15,
  cycles_before_long_break: 4,
  auto_start_breaks: false,
  auto_start_focus: false
};

export async function getFocusSettings(userId: string): Promise<FocusSettings | null> {
  const settings = await db.focusSettings.where('user_id').equals(userId).first();

  if (!settings || settings.deleted) return null;
  return settings;
}

export async function getOrCreateFocusSettings(userId: string): Promise<FocusSettings> {
  const existing = await getFocusSettings(userId);
  if (existing) return existing;

  return createFocusSettings(userId);
}

async function createFocusSettings(userId: string): Promise<FocusSettings> {
  const timestamp = now();

  const newSettings: FocusSettings = {
    id: generateId(),
    user_id: userId,
    ...DEFAULT_FOCUS_SETTINGS,
    created_at: timestamp,
    updated_at: timestamp
  };

  await db.transaction('rw', [db.focusSettings, db.syncQueue], async () => {
    await db.focusSettings.add(newSettings);
    await queueCreateOperation('focus_settings', newSettings.id, {
      user_id: userId,
      ...DEFAULT_FOCUS_SETTINGS,
      created_at: timestamp,
      updated_at: timestamp
    });
  });
  markEntityModified(newSettings.id);
  scheduleSyncPush();

  return newSettings;
}

export async function updateFocusSettings(
  id: string,
  updates: Partial<
    Pick<
      FocusSettings,
      | 'focus_duration'
      | 'break_duration'
      | 'long_break_duration'
      | 'cycles_before_long_break'
      | 'auto_start_breaks'
      | 'auto_start_focus'
    >
  >
): Promise<FocusSettings | undefined> {
  const timestamp = now();

  // Use transaction to ensure atomicity
  let updated: FocusSettings | undefined;
  await db.transaction('rw', [db.focusSettings, db.syncQueue], async () => {
    await db.focusSettings.update(id, { ...updates, updated_at: timestamp });
    updated = await db.focusSettings.get(id);
    if (updated) {
      await queueSyncOperation({
        table: 'focus_settings',
        entityId: id,
        operationType: 'set',
        value: { ...updates, updated_at: timestamp }
      });
    }
  });

  if (updated) {
    markEntityModified(id);
    scheduleSyncPush();
  }

  return updated;
}
