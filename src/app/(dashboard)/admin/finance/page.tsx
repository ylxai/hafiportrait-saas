'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import useSWR from 'swr';

type Summary = {
  totalEvents: number;
  paidEvents: number;
  pendingEvents: number;
  totalRevenue: number;
  totalPaid: number;
  totalPending: number;
};

type Event = {
  id: string;
  kodeBooking: string;
  namaProject: string;
  client: string;
  packageName: string;
  totalPrice: number;
  paidAmount: number;
  paymentStatus: string;
  eventDate: string;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function FinancePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { data, isLoading } = useSWR<{ summary: Summary; revenueByMonth: Record<string, number>; events: Event[] }>('/api/admin/finance', fetcher);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const summary = data?.summary;
  const events = data?.events || [];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-charcoal mb-6">Finance</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="glass-card p-6">
          <div className="text-sm text-warm-gray">Total Revenue</div>
          <div className="text-2xl font-bold text-green-600">{formatCurrency(summary?.totalRevenue ?? 0)}</div>
        </div>
        <div className="glass-card p-6">
          <div className="text-sm text-warm-gray">Paid</div>
          <div className="text-2xl font-bold text-blue-600">{formatCurrency(summary?.totalPaid ?? 0)}</div>
        </div>
        <div className="glass-card p-6">
          <div className="text-sm text-warm-gray">Pending</div>
          <div className="text-2xl font-bold text-champagne-600">{formatCurrency(summary?.totalPending ?? 0)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="glass-card p-4">
          <div className="text-sm text-warm-gray">Total Events</div>
          <div className="text-xl font-bold text-charcoal">{summary?.totalEvents ?? 0}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-sm text-warm-gray">Paid Events</div>
          <div className="text-xl font-bold text-green-600">{summary?.paidEvents ?? 0}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-sm text-warm-gray">Pending Events</div>
          <div className="text-xl font-bold text-champagne-600">{summary?.pendingEvents ?? 0}</div>
        </div>
      </div>

      <div className="glass-card">
        <div className="p-4 border-b border-champagne-100">
          <h2 className="font-semibold text-charcoal">Events</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-champagne-50/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-warm-gray uppercase">Booking</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-warm-gray uppercase">Project</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Package</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paid</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {events.length > 0 ? (
                events.map((event) => (
                  <tr key={event.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600">{event.kodeBooking}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{event.namaProject}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{event.client}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{event.packageName}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{formatCurrency(event.totalPrice)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatCurrency(event.paidAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        event.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {event.paymentStatus}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No events found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}