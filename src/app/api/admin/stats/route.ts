import { prisma } from "@/lib/db";
import {
  successResponse,
  serverErrorResponse,
} from "@/lib/api/response";
import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth/require-admin-auth";
import { RATE_LIMITS } from '@/lib/rate-limit';
import { enforceRateLimit } from '@/lib/rate-limit-helper';
import { getCachedData } from "@/lib/cache";

/**
 * GET /api/admin/stats
 *
 * Returns dashboard statistics with caching (5 minutes TTL).
 * No input validation needed - read-only endpoint with no parameters.
 */
export async function GET(_request: Request) {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await enforceRateLimit({
      identifier: `stats:get:${auth.user.email}`,
      limit: RATE_LIMITS.STATS
    });
    if (rateLimit) return rateLimit;

    // Cache dashboard stats for 5 minutes
    const stats = await getCachedData(
      `stats:dashboard`,
      async () => {
        const [
          totalEvents,
          totalClients,
          totalGalleries,
          totalPhotos,
          recentEvents,
          recentGalleries,
        ] = await Promise.all([
          prisma.event.count(),
          prisma.client.count(),
          prisma.gallery.count(),
          prisma.photo.count(),
          prisma.event.findMany({
            orderBy: { createdAt: "desc" },
            take: 5,
            // Only the client name is rendered in the dashboard's "Recent
            // events" widget, so narrow the select instead of pulling the
            // entire row (which would include `Client.password`, the
            // bcrypt hash). Same minimum-exposure rule as `safeClientSelect`.
            include: { client: { select: { nama: true } } },
          }),
          prisma.gallery.findMany({
            orderBy: { createdAt: "desc" },
            take: 5,
            include: {
              event: { select: { client: { select: { nama: true } } } },
              _count: { select: { photos: true } },
            },
          }),
        ]);

        const revenueResult = await prisma.event.aggregate({
          _sum: { totalPrice: true },
          where: { paymentStatus: "paid" },
        });

        return {
          totalEvents,
          totalClients,
          totalGalleries,
          totalPhotos,
          totalRevenue: revenueResult._sum.totalPrice?.toString() ?? "0",
          recentEvents: recentEvents.map(
            (e: (typeof recentEvents)[number]) => ({
              id: e.id,
              namaProject: e.namaProject,
              kodeBooking: e.kodeBooking,
              eventDate: e.eventDate,
              status: e.status,
              client: e.client.nama,
            }),
          ),
          recentGalleries: recentGalleries.map(
            (g: (typeof recentGalleries)[number]) => ({
              id: g.id,
              namaProject: g.namaProject,
              status: g.status,
              photoCount: g._count.photos,
              client: g.event.client?.nama || "Unknown",
            }),
          ),
        };
      },
      300, // 5 minutes TTL
    );

    return successResponse({ stats });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return serverErrorResponse("Failed to fetch stats");
  }
}
