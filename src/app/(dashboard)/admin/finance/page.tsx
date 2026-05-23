'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Plus, Save, X } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading';

type Summary = {
  totalEvents: number;
  paidEvents: number;
  pendingEvents: number;
  // Revenue fields are emitted as strings by the API to avoid silent
  // precision loss on large lifetime totals (BigInt-safe). Accept
  // `number` too for backward compatibility with cached responses.
  totalRevenue: string | number;
  totalPaid: string | number;
  totalPending: string | number;
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
  const { data, isLoading, mutate } = useSWR<{ data: { summary: Summary; revenueByMonth: Record<string, number>; events: Event[] } }>('/api/admin/finance', fetcher);
  
  const [recordingEvent, setRecordingEvent] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const summary = data?.data?.summary;
  const events = data?.data?.events || [];

  const formatCurrency = (amount: string | number | undefined | null) => {
    // Revenue strings come from the API as BigInt-safe digits; parse
    // back to Number for `Intl.NumberFormat`. Use `Number()` rather
    // than `parseInt` so partial / non-numeric strings (e.g. "123abc")
    // surface as `NaN` instead of being silently truncated, then
    // collapse `NaN`/non-finite/null/undefined results to 0 so the
    // dashboard never renders "Rp NaN" and zero-state formatting is
    // consistent with non-zero values (avoids "Rp 0" vs "Rp0" mismatch
    // between hardcoded fallback and Intl.NumberFormat output).
    //
    // Values that exceed Number.MAX_SAFE_INTEGER lose precision in the
    // formatter regardless of input type, but at the dashboard level a
    // 16-digit cap is fine — the precise value is preserved in the API
    // string for downstream analytics.
    const numAmount = typeof amount === 'string' ? Number(amount) : (amount ?? 0);
    const safeAmount = Number.isFinite(numAmount) ? numAmount : 0;
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(safeAmount);
  };

  const handleRecordPayment = async (eventId: string, amount: number) => {
    setIsSaving(true);
    setMessage('');
    
    try {
      const response = await fetch(`/api/admin/events?id=${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          paidAmount: amount,
          paymentStatus: amount >= (events.find(e => e.id === eventId)?.totalPrice || 0) ? 'paid' : 'partial'
        }),
      });
      
      if (response.ok) {
        setMessage('Payment recorded successfully');
        mutate(); // Refresh data
        setRecordingEvent(null);
        setPaymentAmount('');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Failed to record payment');
      }
    } catch (error) {
      console.error('Error recording payment:', error);
      setMessage('Error recording payment');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Finance</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl p-6">
          <div className="text-sm text-muted-foreground">Total Revenue</div>
          <div className="text-2xl font-bold text-success">{formatCurrency(summary?.totalRevenue ?? 0)}</div>
        </div>
        <div className="bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl p-6">
          <div className="text-sm text-muted-foreground">Paid</div>
          <div className="text-2xl font-bold text-foreground">{formatCurrency(summary?.totalPaid ?? 0)}</div>
        </div>
        <div className="bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl p-6">
          <div className="text-sm text-muted-foreground">Pending</div>
          <div className="text-2xl font-bold text-primary">{formatCurrency(summary?.totalPending ?? 0)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl p-4">
          <div className="text-sm text-muted-foreground">Total Events</div>
          <div className="text-xl font-bold text-foreground">{summary?.totalEvents ?? 0}</div>
        </div>
        <div className="bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl p-4">
          <div className="text-sm text-muted-foreground">Paid Events</div>
          <div className="text-xl font-bold text-success">{summary?.paidEvents ?? 0}</div>
        </div>
        <div className="bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl p-4">
          <div className="text-sm text-muted-foreground">Pending Events</div>
          <div className="text-xl font-bold text-primary">{summary?.pendingEvents ?? 0}</div>
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg ${message.includes('success') ? 'bg-success/15 text-success' : 'bg-destructive/10 text-destructive'}`}>
          {message}
        </div>
      )}

      <div className="bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl">
        <div className="p-4 border-b border-champagne-100">
          <h2 className="font-semibold text-foreground">Events</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Booking</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Project</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Client</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Package</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Paid</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.length > 0 ? (
                events.map((event) => (
                  <tr key={event.id} className="hover:bg-muted">
                    <td className="px-4 py-3 text-sm text-muted-foreground">{event.kodeBooking}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{event.namaProject}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{event.client}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{event.packageName}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{formatCurrency(event.totalPrice)}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{formatCurrency(event.paidAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        event.paymentStatus === 'paid' ? 'bg-success/15 text-success' : event.paymentStatus === 'partial' ? 'bg-primary/15 text-primary' : 'bg-warning/15 text-warning'
                      }`}>
                        {event.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {recordingEvent === event.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            placeholder="Amount"
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            className="w-24 px-2 py-1 text-sm border border-border rounded"
                            autoFocus
                          />
                          <button
                            onClick={() => handleRecordPayment(event.id, parseInt(paymentAmount) || 0)}
                            disabled={isSaving || !paymentAmount}
                            className="p-1 text-success hover:bg-success/10 rounded disabled:opacity-50"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setRecordingEvent(null);
                              setPaymentAmount('');
                            }}
                            className="p-1 text-destructive hover:bg-destructive/10 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setRecordingEvent(event.id);
                            setPaymentAmount((event.totalPrice - event.paidAmount).toString());
                          }}
                          disabled={event.paymentStatus === 'paid'}
                          className="flex items-center gap-1 px-3 py-1 text-sm text-primary hover:bg-muted rounded disabled:opacity-50 disabled:text-muted-foreground"
                        >
                          <Plus className="w-4 h-4" />
                          Record
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
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