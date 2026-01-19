import { browser } from '$app/environment';

export const ssr = true;
export const prerender = false;

// Register service worker
if (browser) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  }
}
