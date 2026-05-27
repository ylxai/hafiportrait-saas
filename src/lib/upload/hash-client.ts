'use client';

/**
 * Client-side file hash calculation using Web Crypto API
 * This module is safe to use in browser environments
 */

/**
 * Calculate SHA-256 hash of a file
 * Uses Web Crypto API (available in all modern browsers)
 * @param file - The file to hash
 * @returns Hex string of the SHA-256 hash
 */
export async function calculateFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
