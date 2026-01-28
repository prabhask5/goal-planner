// Service Worker for Stellar PWA
// Smart caching strategy: immutable assets cached forever, only changed files downloaded on deploy

// Version is updated automatically on each build by vite.config.ts
const APP_VERSION = 'mkyf7rsp';

// Single persistent cache - we don't delete old assets since immutable files have unique hashes
const CACHE_NAME = 'stellar-cache-v1';

// Core app shell to precache on install
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png'
];

// Track current version for manifest comparison
let currentManifestVersion = null;

// Install event - precache minimal shell
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing version: ${APP_VERSION}`);

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Add minimal assets - don't fail install if some fail
      await Promise.allSettled(
        PRECACHE_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn(`[SW] Failed to precache ${url}:`, err))
        )
      );
      console.log('[SW] Minimal precache complete');

      // Notify clients
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SW_INSTALLED', version: APP_VERSION });
        });
      });
    })
  );

  // Don't skipWaiting() - let UpdatePrompt control the transition
});

// Activate event - take control but DON'T delete caches
// Immutable assets have unique hashes, so old versions don't conflict
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating version: ${APP_VERSION}`);

  event.waitUntil(
    (async () => {
      // Only delete very old cache formats (migration from old naming)
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => name.startsWith('stellar-') && name !== CACHE_NAME && name !== 'stellar-cache-v1')
          .map(name => {
            console.log(`[SW] Deleting legacy cache: ${name}`);
            return caches.delete(name);
          })
      );

      // Take control of all tabs
      await self.clients.claim();
    })()
  );
});

// Fetch event handler
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip external requests
  if (url.origin !== self.location.origin) return;

  // Skip API routes
  if (url.pathname.startsWith('/api/')) return;

  // NAVIGATION REQUESTS (HTML pages)
  if (event.request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(event.request));
    return;
  }

  // IMMUTABLE ASSETS (/_app/immutable/*)
  // These have content hashes - cache forever, never revalidate
  if (url.pathname.includes('/_app/immutable/')) {
    event.respondWith(handleImmutableAsset(event.request));
    return;
  }

  // OTHER STATIC ASSETS
  // Cache-first, but update in background only if online and not recently cached
  if (isStaticAsset(url.pathname)) {
    event.respondWith(handleStaticAsset(event.request));
    return;
  }

  // OTHER REQUESTS - network first
  event.respondWith(handleOtherRequest(event.request));
});

function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/_app/') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.gif') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.woff') ||
    pathname.endsWith('.woff2') ||
    pathname.endsWith('.json') ||
    pathname.endsWith('.webp')
  );
}

// Navigation: network with cache fallback, short timeout
async function handleNavigationRequest(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      // Cache the HTML for offline use
      cache.put('/', response.clone());
      return response;
    }
    throw new Error('Network response not ok');
  } catch (error) {
    // Network failed - serve cached HTML
    console.log('[SW] Navigation offline, serving cache');
    const cached = await cache.match('/');
    if (cached) return cached;

    // Fallback offline page
    return new Response(getOfflineHTML(), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

// Immutable assets: cache-first, NEVER revalidate (they have content hashes)
async function handleImmutableAsset(request) {
  const cache = await caches.open(CACHE_NAME);

  // Check cache first
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  // Not cached - fetch and cache
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.error('[SW] Failed to fetch immutable:', request.url);
    return new Response('Asset not available offline', { status: 503 });
  }
}

// Static assets: cache-first, NO background revalidation (saves bandwidth)
async function handleStaticAsset(request) {
  const cache = await caches.open(CACHE_NAME);

  // Check cache first
  const cached = await cache.match(request);
  if (cached) {
    // Return cached immediately - no background fetch!
    return cached;
  }

  // Not cached - fetch and cache
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] Static asset fetch failed:', request.url);
    return new Response('Asset not available offline', { status: 503 });
  }
}

// Other requests: network-first
async function handleOtherRequest(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response('Offline', { status: 503 });
  }
}

// Background precache - only downloads NEW assets
async function backgroundPrecache() {
  try {
    const cache = await caches.open(CACHE_NAME);

    // Fetch manifest with cache bust
    const manifestResponse = await fetch('/asset-manifest.json?_=' + Date.now(), {
      cache: 'no-store'
    });

    if (!manifestResponse.ok) {
      console.warn('[SW] Asset manifest not found');
      return;
    }

    const manifest = await manifestResponse.json();
    const assets = manifest.assets || [];

    if (assets.length === 0) {
      console.warn('[SW] Asset manifest empty');
      return;
    }

    // Check which assets are NOT already cached
    const uncached = [];
    for (const url of assets) {
      const cached = await cache.match(url);
      if (!cached) {
        uncached.push(url);
      }
    }

    if (uncached.length === 0) {
      console.log('[SW] All assets already cached - full offline ready');
      notifyClients({ type: 'PRECACHE_COMPLETE', cached: assets.length, total: assets.length });
      return;
    }

    console.log(`[SW] Caching ${uncached.length} new assets (${assets.length - uncached.length} already cached)`);

    // Cache in batches
    let successCount = 0;
    const batchSize = 5;

    for (let i = 0; i < uncached.length; i += batchSize) {
      const batch = uncached.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(url => cache.add(url))
      );

      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') successCount++;
        else console.warn(`[SW] Failed to cache: ${batch[idx]}`);
      });

      // Small delay between batches
      if (i + batchSize < uncached.length) {
        await new Promise(r => setTimeout(r, 50));
      }
    }

    const totalCached = assets.length - uncached.length + successCount;
    console.log(`[SW] Precache complete: ${totalCached}/${assets.length}`);
    notifyClients({ type: 'PRECACHE_COMPLETE', cached: totalCached, total: assets.length });

  } catch (e) {
    console.warn('[SW] Precache error:', e);
  }
}

// Cleanup old assets not in current manifest (run periodically)
async function cleanupOldAssets() {
  try {
    const cache = await caches.open(CACHE_NAME);

    // Get current manifest
    const manifestResponse = await fetch('/asset-manifest.json', { cache: 'no-store' });
    if (!manifestResponse.ok) return;

    const manifest = await manifestResponse.json();
    const currentAssets = new Set(manifest.assets || []);

    // Add core assets that should always be kept
    PRECACHE_ASSETS.forEach(url => currentAssets.add(url));
    currentAssets.add('/');

    // Get all cached requests
    const cachedRequests = await cache.keys();
    let deletedCount = 0;

    for (const request of cachedRequests) {
      const url = new URL(request.url);
      const pathname = url.pathname;

      // Only clean up immutable assets that are no longer in manifest
      // Keep non-immutable assets as they might still be valid
      if (pathname.includes('/_app/immutable/') && !currentAssets.has(pathname)) {
        await cache.delete(request);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`[SW] Cleaned up ${deletedCount} old assets`);
    }
  } catch (e) {
    console.warn('[SW] Cleanup error:', e);
  }
}

function notifyClients(message) {
  self.clients.matchAll({ type: 'window' }).then(clients => {
    clients.forEach(client => client.postMessage(message));
  });
}

function getOfflineHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offline - Stellar</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%);
      color: #e4e4e7;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 2rem;
      text-align: center;
    }
    .icon { font-size: 4rem; margin-bottom: 1.5rem; }
    h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.75rem; }
    p { color: #a1a1aa; max-width: 300px; line-height: 1.6; margin-bottom: 2rem; }
    button {
      padding: 0.875rem 2rem;
      background: linear-gradient(135deg, #6c5ce7 0%, #a855f7 100%);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="icon">🌌</div>
  <h1>You're Offline</h1>
  <p>Please check your internet connection and try again.</p>
  <button onclick="location.reload()">Try Again</button>
</body>
</html>`;
}

// Message handler
self.addEventListener('message', (event) => {
  const { type } = event.data || {};

  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: APP_VERSION });
  }

  if (type === 'PRECACHE_ALL') {
    backgroundPrecache();
  }

  if (type === 'CLEANUP_OLD') {
    cleanupOldAssets();
  }

  if (type === 'CACHE_URLS') {
    const urls = event.data.urls || [];
    caches.open(CACHE_NAME).then(cache => {
      urls.forEach(url => cache.add(url).catch(() => {}));
    });
  }

  if (type === 'GET_CACHE_STATUS') {
    getCacheStatus().then(status => {
      event.ports[0]?.postMessage(status);
    });
  }
});

async function getCacheStatus() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const manifestResponse = await cache.match('/asset-manifest.json') ||
                             await fetch('/asset-manifest.json').catch(() => null);

    if (!manifestResponse) {
      return { cached: 0, total: 0, ready: false };
    }

    const manifest = await manifestResponse.clone().json();
    const assets = manifest.assets || [];

    let cachedCount = 0;
    for (const url of assets) {
      if (await cache.match(url)) cachedCount++;
    }

    return {
      cached: cachedCount,
      total: assets.length,
      ready: cachedCount === assets.length,
      version: manifest.version
    };
  } catch (e) {
    return { cached: 0, total: 0, ready: false, error: e.message };
  }
}
