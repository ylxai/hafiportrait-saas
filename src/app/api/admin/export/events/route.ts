import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { unauthorizedResponse, handlePrismaError } from '@/lib/api/response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';

async function checkAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return unauthorizedResponse();
  }
  return session;
}

export async function GET(request: Request) {
  try {
    const auth = await checkAuth();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const events = await prisma.event.findMany({
      where: status ? { status } : undefined,
      include: {
        client: { select: { nama: true, email: true, phone: true } },
        package: { select: { nama: true, price: true } },
      },
      orderBy: { eventDate: 'desc' },
    });

    // Convert to CSV format
    const csvData = events.map(event => ({
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
        'Content-Disposition': `attachment; filename="events-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('[API] Error exporting events:', error);
    return handlePrismaError(error);
  }
}
