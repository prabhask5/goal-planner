// Version is updated automatically on each build by vite.config.ts
const APP_VERSION = 'mkm5fp9f';
const CACHE_NAME = `stellar-${APP_VERSION}`;

// Assets to cache on install (app shell)
const PRECACHE_ASSETS = [
  '/',
  '/lists',
  '/calendar',
  '/routines',
  '/manifest.json'
];

// Install event - cache app shell
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing version: ${APP_VERSION}`);

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );

  // Immediately activate this SW (don't wait for old one to be released)
  self.skipWaiting();
});

// Activate event - clean old caches and take control
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating version: ${APP_VERSION}`);

  event.waitUntil(
    (async () => {
      // Delete all caches that aren't the current version
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => (name.startsWith('stellar-') || name.startsWith('goal-planner-')) && name !== CACHE_NAME)
          .map((name) => {
            console.log(`[SW] Deleting old cache: ${name}`);
            return caches.delete(name);
          })
      );

      // Take control of all open tabs immediately
      await self.clients.claim();

      // Notify all clients that a new version is active
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => {
        client.postMessage({
          type: 'SW_UPDATED',
          version: APP_VERSION
        });
      });
    })()
  );
});

// Fetch event - network-first for HTML, cache-first for assets
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip external requests (Supabase, etc.)
  if (url.origin !== self.location.origin) return;

  // For navigation requests (HTML pages) - network first, cache fallback
  // This ensures users always get the latest HTML on deployment
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Try network first
          const networkResponse = await fetch(event.request);

          // Cache the fresh response
          if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(event.request, networkResponse.clone());
          }

          return networkResponse;
        } catch (error) {
          // Network failed, try cache
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) {
            return cachedResponse;
          }

          // Fallback to cached home page for offline navigation
          const fallback = await caches.match('/');
          if (fallback) {
            return fallback;
          }

          // Last resort
          return new Response('Offline - Please check your connection', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
          });
        }
      })()
    );
    return;
  }

  // For versioned assets (/_app/immutable/*) - cache first, they're immutable
  if (url.pathname.includes('/_app/immutable/')) {
    event.respondWith(
      (async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // Not in cache, fetch and cache
        const networkResponse = await fetch(event.request);
        if (networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      })()
    );
    return;
  }

  // For other static assets - stale while revalidate
  if (
    url.pathname.startsWith('/_app/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.json')
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await caches.match(event.request);

        // Fetch fresh version in background
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.ok) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => null);

        // Return cached immediately if available, otherwise wait for network
        return cachedResponse || fetchPromise || new Response('Offline', { status: 503 });
      })()
    );
    return;
  }

  // For all other requests - network first with cache fallback
  event.respondWith(
    (async () => {
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        const cachedResponse = await caches.match(event.request);
        return cachedResponse || new Response('Offline', { status: 503 });
      }
    })()
  );
});

// Handle messages from the app
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data?.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: APP_VERSION });
  }
});
