import { db, generateId, now } from '../client';
import type { BlockedWebsite } from '$lib/types';
import { queueCreateOperation, queueDeleteOperation, queueSyncOperation } from '$lib/sync/queue';
import { scheduleSyncPush, markEntityModified } from '$lib/sync/engine';

export async function getBlockedWebsites(blockListId: string): Promise<BlockedWebsite[]> {
  const websites = await db.blockedWebsites.where('block_list_id').equals(blockListId).toArray();

  return websites.filter((w) => !w.deleted);
}

export async function createBlockedWebsite(
  blockListId: string,
  domain: string
): Promise<BlockedWebsite> {
  const timestamp = now();

  // Normalize domain (remove protocol, www, trailing slash)
  const normalizedDomain = normalizeDomain(domain);

  const newWebsite: BlockedWebsite = {
    id: generateId(),
    block_list_id: blockListId,
    domain: normalizedDomain,
    created_at: timestamp,
    updated_at: timestamp
  };

  await db.transaction('rw', [db.blockedWebsites, db.syncQueue], async () => {
    await db.blockedWebsites.add(newWebsite);
    await queueCreateOperation('blocked_websites', newWebsite.id, {
      block_list_id: blockListId,
      domain: normalizedDomain,
      created_at: timestamp,
      updated_at: timestamp
    });
  });
  markEntityModified(newWebsite.id);
  scheduleSyncPush();

  return newWebsite;
}

export async function updateBlockedWebsite(
  id: string,
  domain: string
): Promise<BlockedWebsite | undefined> {
  const timestamp = now();
  const normalizedDomain = normalizeDomain(domain);

  // Use transaction to ensure atomicity
  let updated: BlockedWebsite | undefined;
  await db.transaction('rw', [db.blockedWebsites, db.syncQueue], async () => {
    await db.blockedWebsites.update(id, { domain: normalizedDomain, updated_at: timestamp });
    updated = await db.blockedWebsites.get(id);
    if (updated) {
      await queueSyncOperation({
        table: 'blocked_websites',
        entityId: id,
        operationType: 'set',
        field: 'domain',
        value: normalizedDomain
      });
    }
  });

  if (updated) {
    markEntityModified(id);
    scheduleSyncPush();
  }

  return updated;
}

export async function deleteBlockedWebsite(id: string): Promise<void> {
  const timestamp = now();

  await db.transaction('rw', [db.blockedWebsites, db.syncQueue], async () => {
    await db.blockedWebsites.update(id, { deleted: true, updated_at: timestamp });
    await queueDeleteOperation('blocked_websites', id);
  });

  markEntityModified(id);
  scheduleSyncPush();
}

// Helper function to normalize domains
function normalizeDomain(input: string): string {
  let domain = input.trim().toLowerCase();

  // Remove protocol
  domain = domain.replace(/^https?:\/\//, '');

  // Remove www.
  domain = domain.replace(/^www\./, '');

  // Remove trailing slash and path
  domain = domain.split('/')[0];

  // Remove port
  domain = domain.split(':')[0];

  return domain;
}
