import { db, generateId, now } from '../client';
import type { BlockList, DayOfWeek } from '$lib/types';
import { queueCreateOperation, queueDeleteOperation, queueSyncOperation } from '$lib/sync/queue';
import { scheduleSyncPush } from '$lib/sync/engine';

export async function getBlockLists(userId: string): Promise<BlockList[]> {
  const lists = await db.blockLists
    .where('user_id')
    .equals(userId)
    .toArray();

  return lists
    .filter(l => !l.deleted)
    .sort((a, b) => a.order - b.order);
}

export async function getBlockList(id: string): Promise<BlockList | null> {
  const list = await db.blockLists.get(id);
  if (!list || list.deleted) return null;
  return list;
}

export async function createBlockList(
  name: string,
  userId: string,
  activeDays: DayOfWeek[] | null = null
): Promise<BlockList> {
  const timestamp = now();

  // Get the current min order to prepend new items at the top
  const existingLists = await db.blockLists
    .where('user_id')
    .equals(userId)
    .toArray();

  const activeLists = existingLists.filter(l => !l.deleted);
  const minOrder = activeLists.length > 0
    ? Math.min(...activeLists.map(l => l.order))
    : 0;
  const nextOrder = minOrder - 1;

  const newList: BlockList = {
    id: generateId(),
    user_id: userId,
    name,
    active_days: activeDays,
    is_enabled: true,
    order: nextOrder,
    created_at: timestamp,
    updated_at: timestamp
  };

  await db.transaction('rw', [db.blockLists, db.syncQueue], async () => {
    await db.blockLists.add(newList);
    await queueCreateOperation('block_lists', newList.id, {
      user_id: userId,
      name,
      active_days: activeDays,
      is_enabled: true,
      order: nextOrder,
      created_at: timestamp,
      updated_at: timestamp
    });
  });
  scheduleSyncPush();

  return newList;
}

export async function updateBlockList(
  id: string,
  updates: Partial<Pick<BlockList, 'name' | 'active_days' | 'is_enabled'>>
): Promise<BlockList | undefined> {
  const timestamp = now();

  // Use transaction to ensure atomicity
  let updated: BlockList | undefined;
  await db.transaction('rw', [db.blockLists, db.syncQueue], async () => {
    await db.blockLists.update(id, { ...updates, updated_at: timestamp });
    updated = await db.blockLists.get(id);
    if (updated) {
      await queueSyncOperation({
        table: 'block_lists',
        entityId: id,
        operationType: 'set',
        value: { ...updates, updated_at: timestamp }
      });
    }
  });

  if (updated) {
    scheduleSyncPush();
  }

  return updated;
}

export async function toggleBlockList(id: string): Promise<BlockList | undefined> {
  const list = await db.blockLists.get(id);
  if (!list) return undefined;

  return updateBlockList(id, { is_enabled: !list.is_enabled });
}

export async function deleteBlockList(id: string): Promise<void> {
  const timestamp = now();

  // Get all blocked websites for this list to soft delete them
  const websites = await db.blockedWebsites
    .where('block_list_id')
    .equals(id)
    .toArray();

  await db.transaction('rw', [db.blockLists, db.blockedWebsites, db.syncQueue], async () => {
    // Soft delete all websites in this list
    for (const website of websites) {
      await db.blockedWebsites.update(website.id, { deleted: true, updated_at: timestamp });
      await queueDeleteOperation('blocked_websites', website.id);
    }

    // Soft delete the list
    await db.blockLists.update(id, { deleted: true, updated_at: timestamp });
    await queueDeleteOperation('block_lists', id);
  });

  scheduleSyncPush();
}

export async function reorderBlockList(id: string, newOrder: number): Promise<BlockList | undefined> {
  const timestamp = now();

  // Use transaction to ensure atomicity
  let updated: BlockList | undefined;
  await db.transaction('rw', [db.blockLists, db.syncQueue], async () => {
    await db.blockLists.update(id, { order: newOrder, updated_at: timestamp });
    updated = await db.blockLists.get(id);
    if (updated) {
      await queueSyncOperation({
        table: 'block_lists',
        entityId: id,
        operationType: 'set',
        field: 'order',
        value: newOrder
      });
    }
  });

  if (updated) {
    scheduleSyncPush();
  }

  return updated;
}
