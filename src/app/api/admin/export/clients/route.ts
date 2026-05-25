import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handlePrismaError } from '@/lib/api/response';
import { requireAdminAuth } from '@/lib/auth/require-admin-auth';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { enforceRateLimit } from '@/lib/rate-limit-helper';
import { withRequestContext } from '@/lib/with-request-context';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/export/clients
 * 
 * Exports all clients to CSV format.
 * No input validation needed - read-only endpoint with no parameters.
 */
export const GET = withRequestContext(async () => {
  try {
    const auth = await requireAdminAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await enforceRateLimit({ identifier: "export:clients:get", limit: RATE_LIMITS.EXPORT });
    if (rateLimit) return rateLimit;

    const clients = await prisma.client.findMany({
      include: {
        _count: { select: { events: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Convert to CSV format
    const csvData = clients.map((client: typeof clients[number]) => ({
      'Nama': client.nama,
      'Email': client.email,
      'Phone': client.phone || '',
      'Instagram': client.instagram || '',
      'Storage Quota (GB)': client.storageQuotaGB,
      'Total Events': client._count.events,
      'Dibuat': new Date(client.createdAt).toLocaleDateString('id-ID'),
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
        'Content-Disposition': `attachment; filename="clients-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    logger.error('admin.export.clients_failed', { err: error });
    return handlePrismaError(error);
  }
});
