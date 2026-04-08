/**
 * Contoh integrasi Cloudflare Queue ke dalam API route
 * 
 * File ini menunjukkan bagaimana mengubah upload complete route
 * untuk menggunakan Cloudflare Queue (hybrid arsitektur)
 * 
 * Copy logic ini ke: /src/app/api/admin/upload/complete/route.ts
 */

import { NextResponse } from 'next/server';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api/response';
import { verifyR2Upload, updateUploadProgress } from '@/lib/upload/presigned';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';

// Import Cloudflare Queue publisher ( dari docs/cloudflare-example/src/publisher.ts )
// Copy file publisher.ts ke /src/lib/cloudflare-queue.ts
import { queueThumbnailGeneration, queueWithFallback } from '@/lib/cloudflare-queue';

// Keep BullMQ sebagai fallback
import { uploadQueue } from '@/lib/queue';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return errorResponse('Unauthorized', 401);
    }

    const { uploadId, fileSize, width, height, useCloudflare = true } = await request.json();

    if (!uploadId) {
      return errorResponse('Upload ID required', 400);
    }

    // Verifikasi upload ke R2 berhasil
    const verification = await verifyR2Upload(uploadId, fileSize, width, height);

    if (!verification.success) {
      return errorResponse(verification.error || 'Upload verification failed', 400);
    }

    const { r2Key, publicUrl, filename, galleryId, storageAccountId } = verification;

    if (!r2Key || !publicUrl || !filename || !galleryId) {
      return errorResponse('Invalid upload verification data', 400);
    }

    // Gunakan Cloudflare Queue untuk processing
    if (useCloudflare) {
      await updateUploadProgress(uploadId, { status: 'processing', progress: 30 });
      
      // Kirim ke Cloudflare Queue dengan fallback ke BullMQ
      const result = await queueWithFallback(
        'thumbnail-generation',
        {
          uploadId,
          r2Key,
          publicUrl,
          galleryId,
          filename,
          fileSize,
          width,
          height,
          storageAccountId,
        },
        uploadQueue // Fallback BullMQ queue
      );

      if (result.success) {
        return successResponse({
          message: `Upload queued for processing (${result.method})`,
          uploadId,
          status: 'queued',
          queueProvider: result.method,
        });
      } else {
        // Jika queue gagal, fallback ke synchronous processing
        console.warn('[Upload] Queue failed, falling back to sync processing');
      }
    }

    // Synchronous processing (fallback atau jika useCloudflare = false)
    // ... (logic existing tetap sama)
    
    return successResponse({
      message: 'Upload processed synchronously',
      uploadId,
      status: 'completed',
    });

  } catch (error) {
    console.error('Error completing upload:', error);
    return serverErrorResponse('Failed to complete upload');
  }
}

/**
 * Environment variables yang perlu ditambahkan ke .env:
 * 
 * # Cloudflare Queue
 * CLOUDFLARE_ACCOUNT_ID=your-account-id
 * CLOUDFLARE_API_TOKEN=your-api-token-with-queue-permissions
 * 
 * # Webhook (untuk menerima callback dari Cloudflare Workers)
 * WEBHOOK_SECRET=your-webhook-secret-key
 */
