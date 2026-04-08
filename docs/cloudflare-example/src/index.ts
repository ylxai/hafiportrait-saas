/**
 * Cloudflare Worker - API Entry Point
 * Replaces: Next.js API Routes + Express Server
 */

import { Router } from './router';
import { AuthMiddleware } from './middleware/auth';

export interface Env {
  // R2 Buckets
  PHOTO_BUCKET: R2Bucket;
  THUMBNAIL_BUCKET: R2Bucket;
  
  // Database
  DB: D1Database;
  
  // KV Storage
  SESSIONS: KVNamespace;
  UPLOAD_CACHE: KVNamespace;
  
  // Queues
  UPLOAD_QUEUE: Queue;
  THUMBNAIL_QUEUE: Queue;
  DELETION_QUEUE: Queue;
  
  // Secrets
  JWT_SECRET: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
}

const router = new Router();

// ==================== ROUTES ====================

// Health check
router.get('/api/health', async (req, env) => {
  return Response.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ==================== AUTH ====================

router.post('/api/auth/login', async (req, env) => {
  const { email, password } = await req.json();
  
  // Query D1
  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE email = ?'
  ).bind(email).first();
  
  if (!user || !await verifyPassword(password, user.password)) {
    return new Response('Invalid credentials', { status: 401 });
  }
  
  // Create session
  const sessionId = crypto.randomUUID();
  await env.SESSIONS.put(`session:${sessionId}`, JSON.stringify({
    userId: user.id,
    email: user.email,
  }), { expirationTtl: 86400 });
  
  return Response.json({
    token: sessionId,
    user: { id: user.id, email: user.email, name: user.name }
  });
});

// ==================== UPLOAD ====================

// Get presigned URL for direct upload to R2
router.post('/api/admin/upload/presigned', 
  AuthMiddleware, 
  async (req, env) => {
    const { filename, contentType, galleryId, r2AccountId } = await req.json();
    
    if (!filename || !contentType || !galleryId) {
      return new Response('Missing required fields', { status: 400 });
    }
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(contentType)) {
      return new Response('Invalid file type', { status: 400 });
    }
    
    // Generate unique key
    const timestamp = Date.now();
    const key = `uploads/${galleryId}/${timestamp}-${filename}`;
    
    // Create presigned URL (valid 15 minutes)
    const uploadId = crypto.randomUUID();
    const presignedUrl = await env.PHOTO_BUCKET.createPresignedUrl(key, {
      method: 'PUT',
      expiresIn: 900,
      httpMetadata: { contentType },
    });
    
    // Store upload session in KV
    await env.UPLOAD_CACHE.put(`upload:${uploadId}`, JSON.stringify({
      r2Key: key,
      filename,
      contentType,
      galleryId,
      storageAccountId: r2AccountId,
      status: 'pending',
      createdAt: Date.now(),
    }), { expirationTtl: 1800 });
    
    return Response.json({
      presignedUrl,
      uploadId,
      expiresIn: 900,
      publicUrl: `https://${env.PHOTO_BUCKET.bucketName}.r2.cloudflarestorage.com/${key}`,
    });
  }
);

// Complete upload - queue for thumbnail generation
router.post('/api/admin/upload/complete',
  AuthMiddleware,
  async (req, env) => {
    const { uploadId, fileSize, width, height } = await req.json();
    
    // Get upload session
    const session = await env.UPLOAD_CACHE.get(`upload:${uploadId}`);
    if (!session) {
      return new Response('Upload session not found', { status: 404 });
    }
    
    const data = JSON.parse(session);
    
    // Verify file exists in R2
    const object = await env.PHOTO_BUCKET.head(data.r2Key);
    if (!object) {
      return new Response('File not found in storage', { status: 404 });
    }
    
    // Queue for thumbnail generation
    await env.THUMBNAIL_QUEUE.send({
      uploadId,
      r2Key: data.r2Key,
      galleryId: data.galleryId,
      filename: data.filename,
      fileSize,
      width,
      height,
      storageAccountId: data.storageAccountId,
      contentType: data.contentType,
    });
    
    // Update session status
    await env.UPLOAD_CACHE.put(`upload:${uploadId}`, JSON.stringify({
      ...data,
      status: 'processing',
      fileSize,
      width,
      height,
    }), { expirationTtl: 3600 });
    
    return Response.json({
      message: 'Upload received, processing thumbnail',
      uploadId,
      status: 'processing',
    });
  }
);

// Get upload progress
router.get('/api/admin/upload/progress',
  AuthMiddleware,
  async (req, env) => {
    const url = new URL(req.url);
    const uploadId = url.searchParams.get('uploadId');
    
    if (!uploadId) {
      return new Response('Upload ID required', { status: 400 });
    }
    
    const session = await env.UPLOAD_CACHE.get(`upload:${uploadId}`);
    if (!session) {
      return new Response('Upload not found', { status: 404 });
    }
    
    const data = JSON.parse(session);
    return Response.json({
      uploadId,
      status: data.status,
      filename: data.filename,
      progress: data.progress || 0,
      thumbnailUrl: data.thumbnailUrl || null,
    });
  }
);

// ==================== GALLERIES ====================

// Get gallery dengan photos
router.get('/api/admin/galleries/:id',
  AuthMiddleware,
  async (req, env, params) => {
    const { id } = params;
    
    // Get gallery
    const gallery = await env.DB.prepare(
      `SELECT g.*, e.kodeBooking, c.nama as clientName, c.email as clientEmail
       FROM galleries g
       LEFT JOIN events e ON g.eventId = e.id
       LEFT JOIN clients c ON e.clientId = c.id
       WHERE g.id = ?`
    ).bind(id).first();
    
    if (!gallery) {
      return new Response('Gallery not found', { status: 404 });
    }
    
    // Get photos
    const { results: photos } = await env.DB.prepare(
      `SELECT id, filename, url, thumbnailUrl, width, height, 
              CAST(fileSize AS TEXT) as fileSize, createdAt
       FROM photos 
       WHERE galleryId = ? 
       ORDER BY createdAt DESC`
    ).bind(id).all();
    
    return Response.json({
      gallery: {
        ...gallery,
        photos: photos || [],
      }
    });
  }
);

// ==================== DELETE PHOTO ====================

router.delete('/api/admin/galleries/:galleryId/photos/:photoId',
  AuthMiddleware,
  async (req, env, params) => {
    const { photoId } = params;
    
    // Get photo details
    const photo = await env.DB.prepare(
      'SELECT * FROM photos WHERE id = ?'
    ).bind(photoId).first();
    
    if (!photo) {
      return new Response('Photo not found', { status: 404 });
    }
    
    // Queue deletion (async, non-blocking)
    await env.DELETION_QUEUE.send({
      photoId,
      r2Key: photo.r2Key,
      thumbnailUrl: photo.thumbnailUrl,
      storageAccountId: photo.storageAccountId,
      fileSize: photo.fileSize,
    });
    
    // Delete from database immediately
    await env.DB.prepare('DELETE FROM photos WHERE id = ?')
      .bind(photoId)
      .run();
    
    return Response.json({
      success: true,
      message: 'Photo deleted, storage cleanup queued',
    });
  }
);

// ==================== MAIN HANDLER ====================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    try {
      const response = await router.handle(request, env);
      
      // Add CORS to all responses
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      
      return response;
    } catch (error) {
      console.error('Error:', error);
      return new Response('Internal Server Error', { 
        status: 500,
        headers: corsHeaders,
      });
    }
  },
};

// Helper functions
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // Implement bcrypt atau similar
  // Simplified for example
  return false;
}
