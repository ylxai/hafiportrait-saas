import { prisma } from '@/lib/db';
import { successResponse, notFoundResponse } from '@/lib/api/response';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    
    const gallery = await prisma.gallery.findUnique({
      where: { clientToken: token },
      select: { id: true, viewCount: true },
    });

    if (!gallery) {
      return notFoundResponse('Gallery not found');
    }

    // Non-blocking view count increment
    prisma.gallery.update({
      where: { id: gallery.id },
      data: { viewCount: { increment: 1 } },
    }).catch((error) => {
      if (error.code === 'P2025') {
        console.error('[API] Gallery record not found for analytics update');
      } else {
        console.error(`[API] Failed to increment view count for gallery ${gallery.id}`, error);
      }
    });

    // Return immediately without waiting for increment
    return successResponse({ viewCount: gallery.viewCount + 1 });
  } catch (error) {
    console.error('[API] Error in view endpoint:', error);
    return notFoundResponse('Gallery not found');
  }
}
