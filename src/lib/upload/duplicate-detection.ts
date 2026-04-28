// Hash-based duplicate detection using SHA-256
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
 * Uses fileHash column for accurate duplicate detection
 * @param galleryId - Gallery ID to check within
 * @param fileHash - SHA-256 hash of the file
 * @returns Object indicating if duplicate exists and the existing photo info
 */
export async function checkDuplicatePhoto(
  galleryId: string,
  fileHash: string
): Promise<{ isDuplicate: boolean; existingPhotoId?: string; existingPhoto?: { id: string; filename: string; url: string } }> {
  if (!fileHash) {
    return { isDuplicate: false };
  }

  const existingPhoto = await prisma.photo.findFirst({
    where: {
      galleryId,
      fileHash,
    },
    select: {
      id: true,
      filename: true,
      url: true,
      thumbnailUrl: true,
    },
  });

  if (existingPhoto) {
    return {
      isDuplicate: true,
      existingPhotoId: existingPhoto.id,
      existingPhoto: {
        id: existingPhoto.id,
        filename: existingPhoto.filename,
        url: existingPhoto.thumbnailUrl || existingPhoto.url,
      },
    };
  }

  return { isDuplicate: false };
}

/**
 * Check for duplicate by content hash (filename + fileSize approximation as fallback)
 * Used when fileHash is not available
 */
export async function checkDuplicateByContent(
  galleryId: string,
  filename: string,
  fileSize: bigint
): Promise<{ isDuplicate: boolean; existingPhotoId?: string }> {
  const existingPhoto = await prisma.photo.findFirst({
    where: {
      galleryId,
      filename,
      fileSize,
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
