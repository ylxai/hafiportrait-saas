import { Queue } from 'bullmq';
import { redis } from './redis';

// Upload processing queue
export const uploadQueue = new Queue('upload-processing', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs
    },
    removeOnFail: {
      count: 50, // Keep last 50 failed jobs
    },
  },
});

// Thumbnail generation queue
export const thumbnailQueue = new Queue('thumbnail-generation', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      count: 200,
    },
    removeOnFail: {
      count: 100,
    },
  },
});

// Notification queue
export const notificationQueue = new Queue('notification-delivery', {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'fixed',
      delay: 5000,
    },
  },
});

// Storage deletion queue (for async photo deletion)
export const deletionQueue = new Queue('storage-deletion', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      count: 200,
    },
    removeOnFail: {
      count: 100,
    },
  },
});

// Upload session management (for resumable uploads)
export async function createUploadSession(
  uploadId: string,
  data: {
    filename: string;
    fileSize: number;
    mimeType: string;
    totalChunks: number;
    galleryId: string;
  }
): Promise<void> {
  await redis.setex(
    `upload:${uploadId}`,
    86400, // 24 hours
    JSON.stringify({
      ...data,
      completedChunks: [],
      failedChunks: [],
      createdAt: Date.now(),
    })
  );
}

export async function getUploadSession(uploadId: string): Promise<{
  filename: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
  galleryId: string;
  completedChunks: number[];
  failedChunks: number[];
  createdAt: number;
} | null> {
  const data = await redis.get(`upload:${uploadId}`);
  return data ? JSON.parse(data) : null;
}

export async function updateUploadSession(
  uploadId: string,
  chunkIndex: number,
  status: 'completed' | 'failed'
): Promise<void> {
  const session = await getUploadSession(uploadId);
  if (!session) return;

  if (status === 'completed') {
    session.completedChunks.push(chunkIndex);
  } else {
    session.failedChunks.push(chunkIndex);
  }

  await redis.setex(
    `upload:${uploadId}`,
    86400,
    JSON.stringify(session)
  );
}

export async function deleteUploadSession(uploadId: string): Promise<void> {
  await redis.del(`upload:${uploadId}`);
}

// Progress tracking
export async function setUploadProgress(
  uploadId: string,
  progress: {
    total: number;
    completed: number;
    failed: number;
  }
): Promise<void> {
  await redis.setex(
    `progress:${uploadId}`,
    86400,
    JSON.stringify(progress)
  );
}

export async function getUploadProgress(uploadId: string): Promise<{
  total: number;
  completed: number;
  failed: number;
} | null> {
  const data = await redis.get(`progress:${uploadId}`);
  return data ? JSON.parse(data) : null;
}

// Graceful shutdown
export async function closeQueues(): Promise<void> {
  await uploadQueue.close();
  await thumbnailQueue.close();
  await notificationQueue.close();
  await redis.quit();
}

// Cleanup function for completed/failed jobs (run periodically)
export async function cleanupOldJobs(): Promise<void> {
  // BullMQ automatically handles cleanup based on removeOnComplete/removeOnFail options
  console.log('Queue cleanup completed');
}
