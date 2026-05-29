'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { Clock } from 'lucide-react';
import { usePaymentStatusSubscription, type PaymentStatusUpdate } from '@/lib/hooks/useAbly';
import { PaymentStatusBadge, PaymentProofThumbnail, PaymentActionButtons, type PaymentStatus } from '@/components/admin/payment-shared';
import { useState } from 'react';

interface Payment {
  id: string;
  amount: number;
  type: string;
  method: string;
  status: PaymentStatus;
  proofUrl: string | null;
  createdAt: string;
}

interface PaymentsSectionProps {
  payments: Payment[];
  onMutate: () => void;
}

function PaymentRow({ payment, onAction }: { payment: Payment; onAction: (id: string, action: 'approve' | 'reject') => Promise<void> }) {
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);

  const handleAction = async (action: 'approve' | 'reject') => {
    setLoading(action);
    try {
      await onAction(payment.id, action);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl border border-border bg-background/50">
      <div className="flex-shrink-0">
        <PaymentProofThumbnail proofUrl={payment.proofUrl} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="font-medium text-foreground capitalize">{payment.type === 'dp' ? 'Down Payment' : 'Pelunasan'}</span>
          <PaymentStatusBadge status={payment.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Rp {payment.amount.toLocaleString('id-ID')} · {payment.method}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5" suppressHydrationWarning>
          {new Date(payment.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
        {!payment.proofUrl && (
          <p className="text-xs text-muted-foreground italic mt-0.5">Belum ada bukti transfer</p>
        )}
      </div>
      <PaymentActionButtons
        status={payment.status}
        proofUrl={payment.proofUrl}
        loading={loading}
        onApprove={() => handleAction('approve')}
        onReject={() => handleAction('reject')}
      />
    </div>
  );
}

export function PaymentsSection({ payments, onMutate }: PaymentsSectionProps) {
  const handleAction = useCallback(async (paymentId: string, action: 'approve' | 'reject') => {
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as { error?: string }));
        toast.error(data?.error ?? 'Gagal memperbarui status pembayaran');
        return;
      }
      toast.success(action === 'approve' ? 'Pembayaran disetujui' : 'Pembayaran ditolak');
      onMutate();
    } catch {
      toast.error('Terjadi kesalahan, coba lagi');
    }
  }, [onMutate]);

  // Real-time: refresh when any payment status changes
  usePaymentStatusSubscription(useCallback((_update: PaymentStatusUpdate) => { onMutate(); }, [onMutate]));

  const pending = payments.filter(p => p.status === 'pending' && p.proofUrl);
  const others = payments.filter(p => !(p.status === 'pending' && p.proofUrl));

  return (
    <div className="bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg text-foreground">Riwayat Pembayaran</h2>
        {pending.length > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-warning/15 text-warning border border-warning/30">
            <Clock className="w-3 h-3" />
            {pending.length} menunggu konfirmasi
          </span>
        )}
      </div>
      {payments.length === 0 ? (
        <p className="text-muted-foreground text-sm">Belum ada data pembayaran.</p>
      ) : (
        <div className="space-y-3">
          {pending.map(p => <PaymentRow key={p.id} payment={p} onAction={handleAction} />)}
          {others.map(p => <PaymentRow key={p.id} payment={p} onAction={handleAction} />)}
        </div>
      )}
    </div>
  );
}



