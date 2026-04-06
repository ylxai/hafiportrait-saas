import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { errorResponse } from '@/lib/api/response';

export async function verifyAuth() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return null;
  }
  
  return session;
}

export async function requireAuth() {
  const session = await verifyAuth();
  
  if (!session) {
    return errorResponse('Unauthorized', 401);
  }
  
  return session;
}