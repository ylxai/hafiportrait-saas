import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  successResponse,
  errorResponse,
  validationError,
} from "@/lib/api/response";
import { verifyMagicToken } from "@/lib/auth/magic-link";

const schema = z.object({
  token: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);

    if (!result.success) {
      return validationError(result.error);
    }

    const { token } = result.data;
    const payload = await verifyMagicToken(token);

    if (!payload) {
      return errorResponse("Link tidak valid atau sudah kadaluarsa", 401);
    }

    const client = await prisma.client.findUnique({
      where: { id: payload.clientId },
      select: { id: true, email: true, nama: true },
    });

    if (!client || client.email !== payload.email) {
      return errorResponse("Client tidak ditemukan", 404);
    }

    await prisma.client.update({
      where: { id: client.id },
      data: {
        emailVerified: true,
        verificationToken: null,
      },
    });

    return successResponse({
      clientId: client.id,
      email: client.email,
      name: client.nama,
    });
  } catch (error) {
    console.error("Verify token error:", error);
    return errorResponse("Gagal memverifikasi token", 500);
  }
}
