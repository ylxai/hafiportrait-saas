import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Check for session token
  const sessionToken = request.cookies.get('next-auth.session-token')?.value 
    || request.cookies.get('__Secure-next-auth.session-token')?.value;

  // Allow access to login page and public routes
  if (
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/api/auth') ||
    request.nextUrl.pathname.startsWith('/booking') ||
    request.nextUrl.pathname.startsWith('/gallery/') ||
    request.nextUrl.pathname === '/'
  ) {
    return NextResponse.next();
  }

  // For /admin routes, redirect to login if no session
  if (request.nextUrl.pathname.startsWith('/admin') && !sessionToken) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/login'],
};