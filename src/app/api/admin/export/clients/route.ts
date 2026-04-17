import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { unauthorizedResponse, handlePrismaError, errorResponse } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

async function checkAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return unauthorizedResponse();
  }
  return session;
}

/**
 * GET /api/admin/export/clients
 * 
 * Exports all clients to CSV format.
 * No input validation needed - read-only endpoint with no parameters.
 */
export async function GET() {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    // Rate limiting
    const rateLimit = await checkRateLimit(auth.user.email, RATE_LIMITS.EXPORT);
    if (!rateLimit.success) {
      return errorResponse('Too many requests. Please try again later.', 429);
    }

    const clients = await prisma.client.findMany({
      include: {
        _count: { select: { events: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Convert to CSV format
    const csvData = clients.map(client => ({
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
      ...csvData.map(row => 
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
    console.error('[API] Error exporting clients:', error);
    return handlePrismaError(error);
  }
}
