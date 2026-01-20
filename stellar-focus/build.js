/**
 * Stellar Focus Extension - Build Script
 * Uses esbuild to bundle TypeScript and copy static assets
 */

import { build } from 'esbuild';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Directories
const srcDir = join(__dirname, 'src');
const distDir = join(__dirname, 'dist');

// Ensure dist directories exist
const dirs = [
  distDir,
  join(distDir, 'popup'),
  join(distDir, 'pages'),
  join(distDir, 'background'),
];

for (const dir of dirs) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// Common esbuild options
const commonOptions = {
  bundle: true,
  format: 'esm',
  target: 'firefox109',
  sourcemap: true,
  minify: false, // Keep readable for debugging
};

// Build popup script
console.log('Building popup.js...');
await build({
  ...commonOptions,
  entryPoints: [join(srcDir, 'popup/popup.ts')],
  outfile: join(distDir, 'popup/popup.js'),
});

// Build service worker
console.log('Building service-worker.js...');
await build({
  ...commonOptions,
  entryPoints: [join(srcDir, 'background/service-worker.ts')],
  outfile: join(distDir, 'background/service-worker.js'),
});

// Build blocked page script
console.log('Building blocked.js...');
await build({
  ...commonOptions,
  entryPoints: [join(srcDir, 'pages/blocked.ts')],
  outfile: join(distDir, 'pages/blocked.js'),
});

// Files to copy (source -> dest relative to src/dist)
const filesToCopy = [
  // Popup
  ['popup/popup.html', 'popup/popup.html'],
  ['popup/popup.css', 'popup/popup.css'],

  // Blocked page
  ['pages/blocked.html', 'pages/blocked.html'],
  ['pages/blocked.css', 'pages/blocked.css'],
];

// Copy static files
console.log('\nCopying static files...');
for (const [src, dest] of filesToCopy) {
  const srcPath = join(srcDir, src);
  const destPath = join(distDir, dest);

  if (existsSync(srcPath)) {
    copyFileSync(srcPath, destPath);
    console.log(`  Copied: ${src}`);
  } else {
    console.warn(`  Warning: Source file not found: ${src}`);
  }
}

console.log('\nBuild complete!');
