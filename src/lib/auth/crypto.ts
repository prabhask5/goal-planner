/**
 * Crypto utilities for offline authentication
 * Uses Web Crypto API with PBKDF2-SHA256 for secure password hashing
 */

const ITERATIONS = 100000;
const KEY_LENGTH = 256;
const SALT_LENGTH = 16;

/**
 * Generate a cryptographically secure random salt
 */
export function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  return bufferToBase64(salt);
}

/**
 * Hash a password using PBKDF2-SHA256
 * @param password - The password to hash
 * @param saltBase64 - Base64 encoded salt
 * @returns Base64 encoded hash
 */
export async function hashPassword(password: string, saltBase64: string): Promise<string> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const salt = base64ToBuffer(saltBase64);

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  // Derive bits using PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    KEY_LENGTH
  );

  return bufferToBase64(new Uint8Array(derivedBits));
}

/**
 * Verify a password against a stored hash
 * @param password - The password to verify
 * @param saltBase64 - Base64 encoded salt
 * @param storedHashBase64 - Base64 encoded stored hash
 * @returns true if password matches
 */
export async function verifyPassword(
  password: string,
  saltBase64: string,
  storedHashBase64: string
): Promise<boolean> {
  const computedHash = await hashPassword(password, saltBase64);
  return timingSafeEqual(computedHash, storedHashBase64);
}

/**
 * Generate a random UUID for offline session tokens
 */
export function generateToken(): string {
  return crypto.randomUUID();
}

// Helper: Convert Uint8Array to base64 string
function bufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

// Helper: Convert base64 string to Uint8Array
function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer;
}

// Helper: Timing-safe string comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
