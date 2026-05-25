import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { ROLE_ADMIN, ROLE_CLIENT } from "@/lib/auth/role-constants";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const publicRoutes = [
    "/",
    "/login",
    "/portal/login",
    "/portal/verify",
    "/api/auth",
    "/api/portal/auth",
    "/api/public",
    "/api/webhook",
    "/booking",
    // Public gallery is token-based: anyone holding the clientToken in the
    // URL must be able to view the gallery WITHOUT logging in. Excluding it
    // from publicRoutes (and listing it under isPortalRoute) previously
    // forced unauthenticated visitors to /portal/login and signed-in admins
    // to /admin, which broke the entire public-share flow plus all
    // server-rendered SEO/OG metadata for shared links.
    "/gallery",
    // Ably token endpoint is intentionally public so anonymous public-gallery
    // viewers can subscribe to realtime updates. The endpoint itself reads
    // the (optional) session and scopes the issued capability accordingly,
    // so anonymous callers cannot escalate beyond gallery-level subscribe.
    "/api/ably/token",
  ];

  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (isPublicRoute) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const loginUrl = new URL(
      pathname.startsWith("/admin") || pathname.startsWith("/api/admin")
        ? "/login"
        : "/portal/login",
      request.url,
    );
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!token.email) {
    console.error("[Middleware] Token exists but missing email");

    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Invalid user data" },
        { status: 401 },
      );
    }

    const loginUrl = new URL(
      pathname.startsWith("/admin") || pathname.startsWith("/api/admin")
        ? "/login"
        : "/portal/login",
      request.url,
    );
    return NextResponse.redirect(loginUrl);
  }

  const isAdminRoute =
    pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
  const isPortalRoute =
    pathname.startsWith("/portal") ||
    // NOTE: /gallery deliberately omitted — see publicRoutes above. The
    // public gallery is gated by the clientToken in the URL, not by an
    // authenticated session, and must never trigger a portal redirect.
    pathname.startsWith("/api/portal/gallery");

  // Normalize role for case-insensitive comparison. Tokens issued by our
  // providers are already lowercased, but legacy sessions or DB rows can
  // surface mixed-case values (e.g. "Admin", "ADMIN"). Comparing in lower
  // case here keeps middleware aligned with route-level guards such as
  // require-admin-auth.ts which already normalize the role.
  const role = (token.role ?? "").toString().toLowerCase();
  const isAdmin = role === ROLE_ADMIN;
  const isClient = role === ROLE_CLIENT;

  if (isAdminRoute && !isAdmin) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }
    if (isClient) {
      return NextResponse.redirect(new URL("/portal/dashboard", request.url));
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isPortalRoute && !isClient) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }
    if (isAdmin) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.redirect(new URL("/portal/login", request.url));
  }

  const response = NextResponse.next();
  response.headers.set("x-user-email", token.email as string);
  response.headers.set("x-user-id", token.sub as string);
  // Only set the role header when we actually have a non-empty role.
  // Setting `x-user-role: ""` would surface a misleading blank header to
  // downstream handlers that test for header presence rather than value
  // equality, and would also waste a few bytes per response.
  if (role) {
    response.headers.set("x-user-role", role);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
