import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Check for session token
  const sessionToken = request.cookies.get('next-auth.session-token')?.value 
    || request.cookies.get('__Secure-next-auth.session-token')?.value;

  // Public routes - allow without auth
  const publicRoutes = [
    '/login',
    '/api/auth',
    '/api/public',
    '/api/webhook',
    '/api/admin/upload/cleanup', // Allow cleanup endpoint (uses Bearer auth)
  ];

  const isPublicRoute = publicRoutes.some(route => 
    pathname === route || pathname.startsWith(`${route}/`)
  );

  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Protected routes - require auth
  const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
  
  if (isAdminRoute && !sessionToken) {
    // API routes return 401, pages redirect to login
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
    '/login',
  ],
};
