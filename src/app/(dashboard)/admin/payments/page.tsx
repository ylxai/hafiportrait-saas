'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { toast } from 'sonner';
import { Clock, ExternalLink, RefreshCw } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading';
import { useAdminAlertsSubscription, usePaymentStatusSubscription, type AdminAlert, type PaymentStatusUpdate } from '@/lib/hooks/useAbly';
import { useSession } from 'next-auth/react';
import { PaymentStatusBadge, PaymentProofThumbnail, PaymentActionButtons, type PaymentStatus } from '@/components/admin/payment-shared';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface PaymentItem {
  id: string;
  amount: number;
  type: string;
  method: string;
  status: PaymentStatus;
  proofUrl: string | null;
  createdAt: string;
  event: {
    id: string;
    kodeBooking: string;
    namaProject: string;
    paymentStatus: string;
    client: { nama: string; email: string };
  };
}

function PaymentRow({ payment, onAction }: { payment: PaymentItem; onAction: (id: string, action: 'approve' | 'reject') => Promise<void> }) {
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);

  const handle = async (action: 'approve' | 'reject') => {
    setLoading(action);
    try {
      await onAction(payment.id, action);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-4 p-4 rounded-2xl border border-border bg-background/50 hover:bg-card/50 transition-colors">
      <div className="flex-shrink-0">
        <PaymentProofThumbnail proofUrl={payment.proofUrl} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <Link href={`/admin/events/${payment.event.id}`}
            className="font-medium text-foreground hover:text-primary transition-colors">
            {payment.event.namaProject}
          </Link>
          <PaymentStatusBadge status={payment.status} />
        </div>
        <p className="text-sm text-muted-foreground">{payment.event.client.nama} · {payment.event.kodeBooking}</p>
        <p className="text-sm font-medium text-foreground mt-0.5">
          Rp {payment.amount.toLocaleString('id-ID')}
          <span className="text-muted-foreground font-normal"> · {payment.type === 'dp' ? 'Down Payment' : 'Pelunasan'} · {payment.method}</span>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5" suppressHydrationWarning>
          {new Date(payment.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <PaymentActionButtons
          status={payment.status}
          proofUrl={payment.proofUrl}
          loading={loading}
          onApprove={() => handle('approve')}
          onReject={() => handle('reject')}
        />
        {(payment.status !== 'pending' || !payment.proofUrl) && (
          <Link href={`/admin/events/${payment.event.id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors text-sm">
            <ExternalLink className="w-3.5 h-3.5" />
            Detail
          </Link>
        )}
      </div>
    </div>
  );
}

export default function AdminPaymentsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  const { data, isLoading, error, mutate } = useSWR(
    `/api/admin/payments?status=${filter}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  const payments: PaymentItem[] = data?.data?.payments ?? [];
  const total: number = data?.data?.total ?? 0;

  const handleAction = useCallback(async (paymentId: string, action: 'approve' | 'reject') => {
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({} as { error?: string }));
        toast.error(d?.error ?? 'Gagal memperbarui status');
        return;
      }
      toast.success(action === 'approve' ? 'Pembayaran disetujui' : 'Pembayaran ditolak');
      mutate();
    } catch {
      toast.error('Terjadi kesalahan, coba lagi');
    }
  }, [mutate]);

  // Real-time: new proof uploaded → refresh only (toast handled by AdminAlertsBanner)
  useAdminAlertsSubscription(isAdmin, useCallback((alert: AdminAlert) => {
    if (alert.type === 'payment_proof') {
      if (filter === 'pending' || filter === 'all') mutate();
    }
  }, [filter, mutate]));

  // Real-time: payment approved/rejected in another tab → refresh
  usePaymentStatusSubscription(useCallback((_update: PaymentStatusUpdate) => {
    mutate();
  }, [mutate]));

  const TABS: { key: typeof filter; label: string }[] = [
    { key: 'pending', label: 'Menunggu' },
    { key: 'all', label: 'Semua' },
    { key: 'approved', label: 'Disetujui' },
    { key: 'rejected', label: 'Ditolak' },
  ];

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pembayaran</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Konfirmasi bukti transfer dari klien</p>
        </div>
        <button onClick={() => mutate()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors text-sm">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Tabs - scrollable on mobile */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-2xl mb-4 overflow-x-auto [-webkit-overflow-scrolling:touch] flex-nowrap w-full sm:w-fit">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setFilter(tab.key)}
            className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
              filter === tab.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {error ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          Gagal memuat data. Silakan refresh halaman.
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center h-40">
          <LoadingSpinner size="md" />
        </div>
      ) : payments.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
          <Clock className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-sm">Tidak ada pembayaran {filter !== 'all' ? `dengan status "${TABS.find(t => t.key === filter)?.label}"` : ''}</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-3">{total} pembayaran ditemukan</p>
          <div className="space-y-3">
            {payments.map(p => (
              <PaymentRow key={p.id} payment={p} onAction={handleAction} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
