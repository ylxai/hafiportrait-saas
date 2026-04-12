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

/**
 * Calculate hash for multiple files
 * @param files - Array of files to hash
 * @returns Array of hash strings in same order
 */
export async function calculateFileHashes(files: File[]): Promise<string[]> {
  const hashes = await Promise.all(
    files.map(file => calculateFileHash(file))
  );
  return hashes;
}

/**
 * Check if two files are identical by comparing their hashes
 * @param file1 - First file
 * @param file2 - Second file
 * @returns True if files are identical
 */
export async function areFilesIdentical(file1: File, file2: File): Promise<boolean> {
  const [hash1, hash2] = await Promise.all([
    calculateFileHash(file1),
    calculateFileHash(file2),
  ]);
  return hash1 === hash2;
}

/**
 * Quick hash check - only hashes first N bytes for performance
 * Use for initial duplicate detection, then verify with full hash
 * @param file - The file to hash
 * @param bytes - Number of bytes to hash (default: 1024 * 1024 = 1MB)
 * @returns Hex string of the partial SHA-256 hash
 */
export async function calculatePartialHash(file: File, bytes: number = 1024 * 1024): Promise<string> {
  const slice = file.slice(0, Math.min(bytes, file.size));
  const buffer = await slice.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}