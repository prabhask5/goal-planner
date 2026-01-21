import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// Plugin to inject build version into service worker
function serviceWorkerVersion() {
  return {
    name: 'service-worker-version',
    buildStart() {
      // Generate version based on timestamp
      const version = Date.now().toString(36);
      const swPath = resolve('static/sw.js');

      try {
        let swContent = readFileSync(swPath, 'utf-8');
        // Replace the version placeholder
        swContent = swContent.replace(
          /const APP_VERSION = ['"][^'"]*['"]/,
          `const APP_VERSION = '${version}'`
        );
        writeFileSync(swPath, swContent);
        console.log(`[SW] Updated service worker version to: ${version}`);
      } catch (e) {
        console.warn('[SW] Could not update service worker version:', e);
      }
    }
  };
}

export default defineConfig({
  plugins: [sveltekit(), serviceWorkerVersion()],
  build: {
    // Optimize chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Separate vendor chunks for better caching
          if (id.includes('node_modules')) {
            if (id.includes('@supabase')) {
              return 'vendor-supabase';
            }
            if (id.includes('date-fns')) {
              return 'vendor-date-fns';
            }
            if (id.includes('dexie')) {
              return 'vendor-dexie';
            }
          }
        }
      }
    },
    // Reduce chunk size warnings threshold
    chunkSizeWarningLimit: 500,
    // Enable minification
    minify: 'esbuild',
    // Target modern browsers for smaller bundles
    target: 'es2020'
  }
});
