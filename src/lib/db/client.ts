import { db } from './schema';

// Re-export the singleton instance
export { db };

// Helper to generate UUIDs
export function generateId(): string {
  return crypto.randomUUID();
}

// Helper to get current ISO timestamp
export function now(): string {
  return new Date().toISOString();
}
