// Version is updated automatically on each build by vite.config.ts
const APP_VERSION = 'mkn11dn6';
const CACHE_NAME = `stellar-${APP_VERSION}`;

// Core app shell assets to precache on install
// These are the minimum needed for offline functionality
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png'
];

// Install event - precache app shell
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing version: ${APP_VERSION}`);

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Add precache assets, but don't fail if some are missing
      const results = await Promise.allSettled(
        PRECACHE_ASSETS.map(url => cache.add(url).catch(err => {
          console.warn(`[SW] Failed to precache ${url}:`, err);
        }))
      );
      console.log('[SW] Precache complete');
    })
  );

  // Immediately activate this SW
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

// Helper: Check if we're online (best effort)
async function isOnline() {
  try {
    // Try a simple HEAD request to check connectivity
    const response = await fetch('/', { method: 'HEAD', cache: 'no-store' });
    return response.ok;
  } catch {
    return false;
  }
}

// Helper: Fetch with timeout for slow connections
async function fetchWithTimeout(request, timeout = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Fetch event - offline-first strategy
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip external requests (Supabase API, CDNs, etc.)
  if (url.origin !== self.location.origin) return;

  // Skip API routes if you have any
  if (url.pathname.startsWith('/api/')) return;

  // NAVIGATION REQUESTS (HTML pages)
  // For SPA: serve cached app shell, let client-side routing handle the rest
  if (event.request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(event.request));
    return;
  }

  // IMMUTABLE ASSETS (/_app/immutable/*)
  // These have hashed filenames - cache forever, never revalidate
  if (url.pathname.includes('/_app/immutable/')) {
    event.respondWith(handleImmutableAsset(event.request));
    return;
  }

  // OTHER STATIC ASSETS (JS, CSS, images, fonts, JSON)
  // Use stale-while-revalidate: serve cached immediately, update in background
  if (isStaticAsset(url.pathname)) {
    event.respondWith(handleStaticAsset(event.request));
    return;
  }

  // ALL OTHER REQUESTS
  // Network first with cache fallback
  event.respondWith(handleOtherRequest(event.request));
});

// Check if path is a static asset
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

// Handle navigation requests (HTML pages)
// Strategy: Cache-first with network update for offline support
async function handleNavigationRequest(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    // Try to fetch from network with a timeout
    // This ensures we get fresh content when online
    const networkResponse = await fetchWithTimeout(request, 3000);

    if (networkResponse.ok) {
      // Cache the fresh HTML response
      cache.put('/', networkResponse.clone());
      return networkResponse;
    }

    // Network returned an error, try cache
    throw new Error('Network response not ok');
  } catch (error) {
    // Network failed or timed out - serve from cache
    console.log('[SW] Navigation failed, serving from cache:', request.url);

    // For SPA, always serve the root page - client-side routing handles the rest
    const cachedResponse = await cache.match('/');

    if (cachedResponse) {
      return cachedResponse;
    }

    // Absolute last resort - return an offline page
    return new Response(
      `<!DOCTYPE html>
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
            transition: transform 0.2s, box-shadow 0.2s;
          }
          button:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(108, 92, 231, 0.4);
          }
          button:active { transform: translateY(0); }
        </style>
      </head>
      <body>
        <div class="icon">&#x1F30C;</div>
        <h1>You're Offline</h1>
        <p>Please check your internet connection and try again.</p>
        <button onclick="location.reload()">Try Again</button>
      </body>
      </html>`,
      {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store'
        }
      }
    );
  }
}

// Handle immutable assets (hashed filenames - safe to cache forever)
async function handleImmutableAsset(request) {
  const cache = await caches.open(CACHE_NAME);

  // Check cache first
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  // Not in cache, fetch from network
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      // Cache for future use
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('[SW] Failed to fetch immutable asset:', request.url);
    return new Response('Asset not available offline', { status: 503 });
  }
}

// Handle static assets (stale-while-revalidate)
async function handleStaticAsset(request) {
  const cache = await caches.open(CACHE_NAME);

  // Check cache first
  const cachedResponse = await cache.match(request);

  // Start background fetch to update cache
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch((error) => {
      console.log('[SW] Background fetch failed for:', request.url);
      return null;
    });

  // Return cached response immediately if available
  // Otherwise wait for network
  if (cachedResponse) {
    return cachedResponse;
  }

  // No cache - must wait for network
  const networkResponse = await fetchPromise;
  if (networkResponse) {
    return networkResponse;
  }

  // Both cache and network failed
  return new Response('Asset not available offline', {
    status: 503,
    headers: { 'Content-Type': 'text/plain' }
  });
}

// Handle other requests (network-first with cache fallback)
async function handleOtherRequest(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Handle messages from the app
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data?.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: APP_VERSION });
  }

  // Allow app to request cache of specific URLs
  if (event.data?.type === 'CACHE_URLS') {
    const urls = event.data.urls || [];
    caches.open(CACHE_NAME).then((cache) => {
      urls.forEach((url) => {
        cache.add(url).catch((err) => {
          console.warn(`[SW] Failed to cache ${url}:`, err);
        });
      });
    });
  }
});
