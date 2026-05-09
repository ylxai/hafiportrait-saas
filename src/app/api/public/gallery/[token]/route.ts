import {
  successResponse,
  notFoundResponse,
  serverErrorResponse,
  errorResponse,
} from '@/lib/api/response';
import { z } from 'zod';
import { parseCursorSafe } from '@/types/pagination';
import { loadPublicGallery } from '@/lib/gallery/load-public-gallery';

// Validate token format (CUID)
const tokenSchema = z.string().cuid().or(z.string().min(10).max(50));

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // Validate token format
    const tokenValidation = tokenSchema.safeParse(token);
    if (!tokenValidation.success) {
      return errorResponse('Invalid gallery token format', 400);
    }

    const { searchParams } = new URL(request.url);
    const paginationResult = parseCursorSafe(searchParams);
    if (!paginationResult.success) {
      return errorResponse(paginationResult.error.errors[0].message, 400);
    }
    const { cursor } = paginationResult.data;

    // Single shared loader keeps the REST endpoint and the Server Component
    // (`src/app/gallery/[token]/page.tsx`) byte-compatible — no risk of
    // drift when one path is updated and the other is forgotten.
    const payload = await loadPublicGallery(token, cursor ?? null);
    if (!payload) {
      return notFoundResponse('Gallery not found');
    }

    return successResponse(payload);
  } catch (error) {
    console.error('Error fetching gallery:', error);
    return serverErrorResponse('Failed to fetch gallery');
  }
}