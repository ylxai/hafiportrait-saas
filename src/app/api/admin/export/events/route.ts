import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handlePrismaError, errorResponse } from '@/lib/api/response';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { enforceRateLimit } from '@/lib/rate-limit-helper';
import { z } from 'zod';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';
import { formatZodError } from '@/lib/api/validation';
import { MAX_EXPORT_ROWS } from '@/lib/api/constants';

// Zod schema for export query parameters
const exportQuerySchema = z.object({
  status: z.enum(['pending', 'confirmed', 'completed', 'cancelled']).optional(),
});

export const GET = withRequestContext(async (request: Request) => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await enforceRateLimit({ identifier: "export:events:get", limit: RATE_LIMITS.EXPORT });
    if (rateLimit) return rateLimit;

    const { searchParams } = new URL(request.url);
    
    // Validate query parameters
    const validation = exportQuerySchema.safeParse({
      status: searchParams.get('status') ?? undefined,
    });

    if (!validation.success) {
      return errorResponse(formatZodError(validation.error), 400);
    }

    const { status } = validation.data;

    const events = await prisma.event.findMany({
      where: status ? { status } : undefined,
      include: {
        client: { select: { nama: true, email: true, phone: true } },
        package: { select: { nama: true, price: true } },
      },
      orderBy: { eventDate: 'desc' },
      take: MAX_EXPORT_ROWS,
    });

    // Convert to CSV format
    const csvData = events.map((event: typeof events[number]) => ({
      'Kode Booking': event.kodeBooking,
      'Nama Project': event.namaProject,
      'Client': event.client.nama,
      'Email': event.client.email || '',
      'Phone': event.client.phone || '',
      'Tanggal Event': new Date(event.eventDate).toLocaleDateString('id-ID'),
      'Lokasi': event.location || '',
      'Package': event.package?.nama || '',
      'Harga': event.totalPrice,
      'Dibayar': event.paidAmount,
      'Status Pembayaran': event.paymentStatus,
      'Status': event.status,
      'Dibuat': new Date(event.createdAt).toLocaleDateString('id-ID'),
    }));

    // Generate CSV
    const headers = Object.keys(csvData[0] || {});
    const csvRows = [
      headers.join(','),
      ...csvData.map((row: Record<string, unknown>) => 
        headers.map(header => {
          const value = row[header as keyof typeof row];
          const escaped = String(value).replace(/"/g, '""');
          return `"${escaped}"`;
        }).join(',')
      ),
    ];

    const csv = csvRows.join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="events-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    logger.error('admin.export.events_failed', { err: error });
    return handlePrismaError(error);
  }
});
