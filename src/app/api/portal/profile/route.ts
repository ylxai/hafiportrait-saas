import { NextResponse } from "next/server";
import { requireClientAuth } from "@/lib/auth/require-client-auth";
import { prisma } from "@/lib/db";
import {
  successResponse,
  serverErrorResponse,
  validationError,
} from "@/lib/api/response";
import { z } from "zod";
import { withRequestContext } from '@/lib/with-request-context';

const schema = z.object({
  nama: z.string().min(1).max(255).optional(),
  phone: z.string().max(20).optional().nullable(),
  instagram: z.string().max(100).optional().nullable(),
});

export const GET = withRequestContext(async () => {
  try {
    const auth = await requireClientAuth();
    if (auth instanceof NextResponse) return auth;

    const client = await prisma.client.findUnique({
      where: { id: auth.user.id },
      select: {
        id: true,
        nama: true,
        email: true,
        phone: true,
        instagram: true,
      },
    });

    return successResponse({ client });
  } catch (error) {
    console.error("Profile GET error:", error);
    return serverErrorResponse("Failed to fetch profile");
  }
});

export const PATCH = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireClientAuth();
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const result = schema.safeParse(body);

    if (!result.success) {
      return validationError(result.error);
    }

    const client = await prisma.client.update({
      where: { id: auth.user.id },
      data: result.data,
      select: {
        id: true,
        nama: true,
        email: true,
        phone: true,
        instagram: true,
      },
    });

    return successResponse({ client });
  } catch (error) {
    console.error("Profile PATCH error:", error);
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return serverErrorResponse("Profile not found");
    }
    return serverErrorResponse("Failed to update profile");
  }
});
