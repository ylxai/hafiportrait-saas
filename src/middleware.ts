import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  MAX_REQUEST_ID_LENGTH,
  REQUEST_ID_HEADER,
} from "@/lib/request-id-constants";

/**
 * Request correlation ID wiring (Sprint 3 / Task 3.1).
 *
 * Middleware generates an `x-request-id` UUID at the very top of every
 * request (or echoes the inbound one), then stamps it onto both the
 * request that flows down to the route handler AND the response that
 * goes back to the client. The Node-runtime side
 * (`src/lib/with-request-context.ts`) reads the header and opens an
 * AsyncLocalStorage scope so the structured logger can auto-tag every
 * log line.
 *
 * The header name and length cap live in
 * `src/lib/request-id-constants.ts` so the Edge bundle here and the
 * Node-runtime wrapper share a single source of truth.
 *
 * Note: this file runs in the Edge runtime, which does NOT expose
 * `node:async_hooks`. Keep the ALS wiring out of this file — the
 * header alone is enough to bridge Edge → Node.
 */

function resolveRequestId(request: NextRequest): string {
  const inbound = request.headers.get(REQUEST_ID_HEADER);
  if (inbound && inbound.length > 0 && inbound.length <= MAX_REQUEST_ID_LENGTH) {
    return inbound;
  }
  // `globalThis.crypto.randomUUID()` is available in the Edge runtime.
  return globalThis.crypto.randomUUID();
}

/**
 * Build a `NextResponse.next()` that forwards a mutated set of request
 * headers to the downstream route handler AND echoes the request ID
 * back on the response. Centralised so every early-return in the
 * middleware tags its response identically.
 */
function nextWithRequestId(request: NextRequest, requestId: string) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = resolveRequestId(request);

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
    return nextWithRequestId(request, requestId);
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        {
          status: 401,
          headers: { [REQUEST_ID_HEADER]: requestId },
        },
      );
    }

    const loginUrl = new URL(
      pathname.startsWith("/admin") || pathname.startsWith("/api/admin")
        ? "/login"
        : "/portal/login",
      request.url,
    );
    loginUrl.searchParams.set("callbackUrl", pathname);
    const redirect = NextResponse.redirect(loginUrl);
    redirect.headers.set(REQUEST_ID_HEADER, requestId);
    return redirect;
  }

  if (!token.email) {
    console.error("[Middleware] Token exists but missing email", { requestId });

    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Invalid user data" },
        {
          status: 401,
          headers: { [REQUEST_ID_HEADER]: requestId },
        },
      );
    }

    const loginUrl = new URL(
      pathname.startsWith("/admin") || pathname.startsWith("/api/admin")
        ? "/login"
        : "/portal/login",
      request.url,
    );
    const redirect = NextResponse.redirect(loginUrl);
    redirect.headers.set(REQUEST_ID_HEADER, requestId);
    return redirect;
  }

  const isAdminRoute =
    pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
  const isPortalRoute =
    pathname.startsWith("/portal") ||
    // NOTE: /gallery deliberately omitted — see publicRoutes above. The
    // public gallery is gated by the clientToken in the URL, not by an
    // authenticated session, and must never trigger a portal redirect.
    pathname.startsWith("/api/portal/gallery");

  if (isAdminRoute && token.role !== "admin") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        {
          status: 403,
          headers: { [REQUEST_ID_HEADER]: requestId },
        },
      );
    }
    const target =
      token.role === "CLIENT" ? "/portal/dashboard" : "/login";
    const redirect = NextResponse.redirect(new URL(target, request.url));
    redirect.headers.set(REQUEST_ID_HEADER, requestId);
    return redirect;
  }

  if (isPortalRoute && token.role !== "CLIENT") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        {
          status: 403,
          headers: { [REQUEST_ID_HEADER]: requestId },
        },
      );
    }
    const target = token.role === "admin" ? "/admin" : "/portal/login";
    const redirect = NextResponse.redirect(new URL(target, request.url));
    redirect.headers.set(REQUEST_ID_HEADER, requestId);
    return redirect;
  }

  // Authenticated request: forward the request ID downstream AND keep
  // the existing user-context headers we already exposed to the route
  // handler.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set(REQUEST_ID_HEADER, requestId);
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
