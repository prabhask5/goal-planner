/**
 * IndexedDB storage for the Firefox extension
 * Stores cached credentials, sessions, and block lists for offline access
 */

const DB_NAME = 'stellar-focus-extension';
const DB_VERSION = 1;

interface OfflineCredentials {
  id: string;
  userId: string;
  email: string;
  passwordHash: string;
  salt: string;
  firstName: string;
  lastName: string;
  cachedAt: string;
}

interface OfflineSession {
  id: string;
  userId: string;
  offlineToken: string;
  createdAt: string;
  expiresAt: string;
}

type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface CachedBlockList {
  id: string;
  user_id: string;
  name: string;
  active_days: DayOfWeek[] | null;  // null = all days
  is_enabled: boolean;
  order: number;
}

interface CachedBlockedWebsite {
  id: string;
  block_list_id: string;
  domain: string;
}

interface FocusSessionCache {
  id: string;
  user_id: string;
  phase: 'focus' | 'break' | 'idle';
  status: 'running' | 'paused' | 'stopped';
  phase_started_at: string;
  focus_duration: number;
  break_duration: number;
  cached_at: string;
}

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Offline credentials store
      if (!db.objectStoreNames.contains('offlineCredentials')) {
        db.createObjectStore('offlineCredentials', { keyPath: 'id' });
      }

      // Offline session store
      if (!db.objectStoreNames.contains('offlineSession')) {
        db.createObjectStore('offlineSession', { keyPath: 'id' });
      }

      // Block lists cache
      if (!db.objectStoreNames.contains('blockLists')) {
        const store = db.createObjectStore('blockLists', { keyPath: 'id' });
        store.createIndex('user_id', 'user_id', { unique: false });
      }

      // Blocked websites cache
      if (!db.objectStoreNames.contains('blockedWebsites')) {
        const store = db.createObjectStore('blockedWebsites', { keyPath: 'id' });
        store.createIndex('block_list_id', 'block_list_id', { unique: false });
      }

      // Focus session cache
      if (!db.objectStoreNames.contains('focusSessionCache')) {
        db.createObjectStore('focusSessionCache', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
  });
}

// Generic store operations
async function put<T>(storeName: string, data: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(data);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function get<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function remove(storeName: string, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function clear(storeName: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Offline Credentials
export const offlineCredentialsStore = {
  put: (data: OfflineCredentials) => put('offlineCredentials', data),
  get: (key: string) => get<OfflineCredentials>('offlineCredentials', key),
  delete: (key: string) => remove('offlineCredentials', key),
};

// Offline Session
export const offlineSessionStore = {
  put: (data: OfflineSession) => put('offlineSession', data),
  get: (key: string) => get<OfflineSession>('offlineSession', key),
  delete: (key: string) => remove('offlineSession', key),
};

// Block Lists Cache
export const blockListsCache = {
  put: (data: CachedBlockList) => put('blockLists', data),
  get: (key: string) => get<CachedBlockList>('blockLists', key),
  getAll: () => getAll<CachedBlockList>('blockLists'),
  delete: (key: string) => remove('blockLists', key),
  clear: () => clear('blockLists'),
};

// Blocked Websites Cache
export const blockedWebsitesCache = {
  put: (data: CachedBlockedWebsite) => put('blockedWebsites', data),
  get: (key: string) => get<CachedBlockedWebsite>('blockedWebsites', key),
  getAll: () => getAll<CachedBlockedWebsite>('blockedWebsites'),
  delete: (key: string) => remove('blockedWebsites', key),
  clear: () => clear('blockedWebsites'),
};

// Focus Session Cache
export const focusSessionCacheStore = {
  put: (data: FocusSessionCache) => put('focusSessionCache', data),
  get: (key: string) => get<FocusSessionCache>('focusSessionCache', key),
  delete: (key: string) => remove('focusSessionCache', key),
  clear: () => clear('focusSessionCache'),
};

export type {
  OfflineCredentials,
  OfflineSession,
  CachedBlockList,
  CachedBlockedWebsite,
  FocusSessionCache,
};
