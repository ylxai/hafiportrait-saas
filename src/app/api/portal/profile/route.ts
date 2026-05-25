import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { isClientSession } from "@/lib/auth/role-helpers";
import { prisma } from "@/lib/db";
import {
  successResponse,
  unauthorizedResponse,
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
    const session = await getServerSession(authOptions);
    if (!isClientSession(session)) {
      return unauthorizedResponse();
    }

    const client = await prisma.client.findUnique({
      where: { id: session.user.id },
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
    const session = await getServerSession(authOptions);
    if (!isClientSession(session)) {
      return unauthorizedResponse();
    }

    const body = await request.json();
    const result = schema.safeParse(body);

    if (!result.success) {
      return validationError(result.error);
    }

    const client = await prisma.client.update({
      where: { id: session.user.id },
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
      return unauthorizedResponse();
    }
    return serverErrorResponse("Failed to update profile");
  }
});
