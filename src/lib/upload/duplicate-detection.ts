// LOW PRIORITY FIX #9: Duplicate detection using file hash
// CRITICAL FIX: Use Web Crypto API instead of Node.js crypto (browser compatible)
import { prisma } from '@/lib/db';

/**
 * Calculate SHA-256 hash of a file using Web Crypto API (browser compatible)
 * @param file - File object to hash
 * @returns Hex string of the hash
 */
export async function calculateFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Check if a photo with the same hash already exists in the gallery
 * @param galleryId - Gallery ID to check within
 * @param fileHash - SHA-256 hash of the file
 * @param filename - Optional filename for additional matching
 * @param fileSize - Optional file size for additional matching
 * @returns Object indicating if duplicate exists and the existing photo ID
 */
export async function checkDuplicatePhoto(
  galleryId: string,
  fileHash: string,
  filename?: string,
  fileSize?: number
): Promise<{ isDuplicate: boolean; existingPhotoId?: string }> {
  // TODO: Add fileHash column to Photo model in schema.prisma
  // For now, check by filename + fileSize as approximation
  if (!filename || !fileSize) {
    return { isDuplicate: false };
  }

  const existingPhoto = await prisma.photo.findFirst({
    where: {
      galleryId,
      filename,
      fileSize: BigInt(fileSize),
    },
    select: {
      id: true,
    },
  });
  
  return {
    isDuplicate: !!existingPhoto,
    existingPhotoId: existingPhoto?.id,
  };
}

// TODO: Add test coverage for duplicate detection
// Note: To fully implement hash-based detection, need to:
// 1. Add fileHash column to Photo model (String @unique per gallery)
// 2. Calculate hash on client before upload using calculateFileHash()
// 3. Check for duplicates in presigned API using checkDuplicatePhoto()
// 4. Show warning to user if duplicate detected (allow override or skip)
