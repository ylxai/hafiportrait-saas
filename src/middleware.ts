import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * Enhanced Middleware with Session Validation
 * 
 * Features:
 * - Validates session token with NextAuth JWT
 * - Checks user authentication status
 * - Handles public routes (login, API auth, public gallery, webhooks)
 * - Protects admin routes with proper authentication
 * - Returns appropriate responses for API vs page routes
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Public routes - allow without auth
  const publicRoutes = [
    '/login',
    '/api/auth',
    '/api/public',
    '/api/webhook',
    '/gallery', // Public gallery routes
    '/booking', // Public booking page
  ];

  const isPublicRoute = publicRoutes.some(route => 
    pathname === route || pathname.startsWith(`${route}/`)
  );

  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Protected routes - require auth
  const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
  
  if (isAdminRoute) {
    try {
      // Validate session token with NextAuth
      const token = await getToken({ 
        req: request,
        secret: process.env.NEXTAUTH_SECRET,
      });

      if (!token) {
        // No valid session token
        if (pathname.startsWith('/api/')) {
          return NextResponse.json(
            { success: false, error: 'Unauthorized - Invalid or expired session' },
            { status: 401 }
          );
        }
        
        // Redirect to login with return URL
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(loginUrl);
      }

      // Token is valid - check if user exists
      if (!token.email) {
        console.error('[Middleware] Token exists but missing email');
        
        if (pathname.startsWith('/api/')) {
          return NextResponse.json(
            { success: false, error: 'Unauthorized - Invalid user data' },
            { status: 401 }
          );
        }
        
        return NextResponse.redirect(new URL('/login', request.url));
      }

      // Optional: Add role-based access control
      // Uncomment when roles are implemented in the database
      /*
      const userRole = token.role as string | undefined;
      
      // Example: Restrict certain admin routes to specific roles
      if (pathname.startsWith('/admin/settings') && userRole !== 'ADMIN') {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json(
            { success: false, error: 'Forbidden - Insufficient permissions' },
            { status: 403 }
          );
        }
        
        return NextResponse.redirect(new URL('/admin', request.url));
      }
      */

      // Add user info to request headers for downstream use
      const response = NextResponse.next();
      response.headers.set('x-user-email', token.email);
      if (token.sub) {
        response.headers.set('x-user-id', token.sub);
      }
      
      return response;
    } catch (error) {
      console.error('[Middleware] Error validating token:', error);
      
      // On error, deny access
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { success: false, error: 'Authentication error' },
          { status: 500 }
        );
      }
      
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};