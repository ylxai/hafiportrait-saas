import { prisma } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return errorResponse('Unauthorized', 401);
    }

    const settings = await prisma.setting.findMany();
    const settingsObj: Record<string, string> = {};
    settings.forEach((s) => {
      settingsObj[s.key] = s.value;
    });

    return successResponse({ settings: settingsObj });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return errorResponse('Failed to fetch settings', 500);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const { key, value } = body;

    if (!key) {
      return errorResponse('Key is required', 400);
    }

    const setting = await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });

    return successResponse({ setting });
  } catch (error) {
    console.error('Error saving setting:', error);
    return errorResponse('Failed to save setting', 500);
  }
}