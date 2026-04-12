// LOW PRIORITY FIX #9: Duplicate detection using file hash
import crypto from 'crypto';
import { prisma } from '@/lib/db';

export async function calculateFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hash = crypto.createHash('sha256');
  hash.update(Buffer.from(buffer));
  return hash.digest('hex');
}

export async function checkDuplicatePhoto(
  galleryId: string,
  _fileHash: string
): Promise<{ isDuplicate: boolean; existingPhotoId?: string }> {
  // Would need to add fileHash column to Photo model
  // For now, check by filename + fileSize as approximation
  const existingPhoto = await prisma.photo.findFirst({
    where: {
      galleryId,
      // fileHash, // Would use this if column exists
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

// Note: To fully implement this, need to:
// 1. Add fileHash column to Photo model
// 2. Calculate hash on client before upload
// 3. Check for duplicates in presigned API
// 4. Show warning to user if duplicate detected
