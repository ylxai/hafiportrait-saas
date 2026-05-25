import { errorResponse } from '@/lib/api/response';
import { NextResponse } from 'next/server';

export async function parseJsonBody<T = unknown>(
  request: Request
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  try {
    const data = await request.json() as T;
    return { data, error: null };
  } catch {
    return { data: null, error: errorResponse('Invalid JSON body', 400) };
  }
}
