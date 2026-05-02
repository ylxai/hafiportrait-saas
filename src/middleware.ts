import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

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
    pathname.startsWith("/gallery") ||
    pathname.startsWith("/api/portal/gallery");

  if (isAdminRoute && token.role !== "admin") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }
    if (token.role === "CLIENT") {
      return NextResponse.redirect(new URL("/portal/dashboard", request.url));
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isPortalRoute && token.role !== "CLIENT") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }
    if (token.role === "admin") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.redirect(new URL("/portal/login", request.url));
  }

  const response = NextResponse.next();
  response.headers.set("x-user-email", token.email as string);
  response.headers.set("x-user-id", token.sub as string);
  response.headers.set("x-user-role", token.role as string);

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
