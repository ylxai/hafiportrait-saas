import { prisma } from '@/lib/db';
import { successResponse, serverErrorResponse } from '@/lib/api/response';

export async function GET() {
  try {
    const packages = await prisma.package.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });

    return successResponse({ packages });
  } catch (error) {
    console.error('Error fetching packages:', error);
    return serverErrorResponse('Failed to fetch packages');
  }
}