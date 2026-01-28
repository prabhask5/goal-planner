import { db, generateId, now } from '../client';
import type { Commitment, CommitmentSection } from '$lib/types';
import { queueCreateOperation, queueDeleteOperation, queueSyncOperation } from '$lib/sync/queue';
import { scheduleSyncPush, markEntityModified } from '$lib/sync/engine';

export async function createCommitment(
  name: string,
  section: CommitmentSection,
  userId: string
): Promise<Commitment> {
  const timestamp = now();

  // Get the lowest order within the section to insert at the top (outside transaction for read)
  const existing = await db.commitments.where('user_id').equals(userId).toArray();
  const sectionItems = existing.filter((c) => c.section === section && !c.deleted);
  const minOrder = sectionItems.length > 0 ? Math.min(...sectionItems.map((c) => c.order)) - 1 : 0;

  const newCommitment: Commitment = {
    id: generateId(),
    user_id: userId,
    name,
    section,
    order: minOrder,
    created_at: timestamp,
    updated_at: timestamp
  };

  // Use transaction to ensure atomicity of local write + queue operation
  await db.transaction('rw', [db.commitments, db.syncQueue], async () => {
    await db.commitments.add(newCommitment);
    await queueCreateOperation('commitments', newCommitment.id, {
      name,
      section,
      order: minOrder,
      user_id: userId,
      created_at: timestamp,
      updated_at: timestamp
    });
  });
  markEntityModified(newCommitment.id);
  scheduleSyncPush();

  return newCommitment;
}

export async function updateCommitment(
  id: string,
  updates: Partial<Pick<Commitment, 'name' | 'section'>>
): Promise<Commitment | undefined> {
  const timestamp = now();

  // Use transaction to ensure atomicity
  let updated: Commitment | undefined;
  await db.transaction('rw', [db.commitments, db.syncQueue], async () => {
    await db.commitments.update(id, { ...updates, updated_at: timestamp });
    updated = await db.commitments.get(id);
    if (updated) {
      await queueSyncOperation({
        table: 'commitments',
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

export async function deleteCommitment(id: string): Promise<void> {
  const timestamp = now();

  // Use transaction to ensure atomicity of delete + queue operation
  await db.transaction('rw', [db.commitments, db.syncQueue], async () => {
    // Tombstone delete
    await db.commitments.update(id, { deleted: true, updated_at: timestamp });
    await queueDeleteOperation('commitments', id);
  });
  markEntityModified(id);
  scheduleSyncPush();
}

export async function reorderCommitment(
  id: string,
  newOrder: number
): Promise<Commitment | undefined> {
  const timestamp = now();

  // Use transaction to ensure atomicity
  let updated: Commitment | undefined;
  await db.transaction('rw', [db.commitments, db.syncQueue], async () => {
    await db.commitments.update(id, { order: newOrder, updated_at: timestamp });
    updated = await db.commitments.get(id);
    if (updated) {
      await queueSyncOperation({
        table: 'commitments',
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
