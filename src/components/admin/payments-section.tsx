'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Clock, ExternalLink, ImageIcon } from 'lucide-react';
import { usePaymentStatusSubscription } from '@/lib/hooks/useAbly';

interface Payment {
  id: string;
  amount: number;
  type: string;
  method: string;
  status: string;
  proofUrl: string | null;
  createdAt: string;
}

interface PaymentsSectionProps {
  payments: Payment[];
  onMutate: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  pending: {
    label: 'Menunggu Konfirmasi',
    className: 'bg-warning/15 text-warning border border-warning/30',
    icon: <Clock className="w-3 h-3" />,
  },
  approved: {
    label: 'Disetujui',
    className: 'bg-success/15 text-success border border-success/30',
    icon: <CheckCircle className="w-3 h-3" />,
  },
  rejected: {
    label: 'Ditolak',
    className: 'bg-destructive/15 text-destructive border border-destructive/30',
    icon: <XCircle className="w-3 h-3" />,
  },
};

function PaymentStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.icon}
      {config.label}
    </span>
  );
}

function PaymentRow({ payment, onAction }: { payment: Payment; onAction: (id: string, action: 'approve' | 'reject') => Promise<void> }) {
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);

  const handleAction = async (action: 'approve' | 'reject') => {
    setLoading(action);
    await onAction(payment.id, action);
    setLoading(null);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl border border-border bg-background/50">
      {/* Proof thumbnail */}
      <div className="flex-shrink-0">
        {payment.proofUrl ? (
          <a href={payment.proofUrl} target="_blank" rel="noopener noreferrer"
            className="block w-16 h-16 rounded-xl overflow-hidden border border-border hover:border-primary transition-colors group relative">
            <img src={payment.proofUrl} alt="Bukti transfer" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <ExternalLink className="w-4 h-4 text-white" />
            </div>
          </a>
        ) : (
          <div className="w-16 h-16 rounded-xl border border-border bg-muted flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="font-medium text-foreground capitalize">{payment.type === 'dp' ? 'Down Payment' : 'Pelunasan'}</span>
          <PaymentStatusBadge status={payment.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Rp {payment.amount.toLocaleString('id-ID')} · {payment.method}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {new Date(payment.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
        {!payment.proofUrl && (
          <p className="text-xs text-muted-foreground italic mt-0.5">Belum ada bukti transfer</p>
        )}
      </div>

      {/* Actions */}
      {payment.status === 'pending' && payment.proofUrl && (
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => handleAction('approve')}
            disabled={loading !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-success/15 text-success border border-success/30 hover:bg-success/25 transition-colors text-sm font-medium disabled:opacity-50"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            {loading === 'approve' ? 'Memproses...' : 'Setujui'}
          </button>
          <button
            onClick={() => handleAction('reject')}
            disabled={loading !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 transition-colors text-sm font-medium disabled:opacity-50"
          >
            <XCircle className="w-3.5 h-3.5" />
            {loading === 'reject' ? 'Memproses...' : 'Tolak'}
          </button>
        </div>
      )}
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
  usePaymentStatusSubscription(useCallback(() => { onMutate(); }, [onMutate]));

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
          {/* Pending first */}
          {pending.map(p => <PaymentRow key={p.id} payment={p} onAction={handleAction} />)}
          {others.map(p => <PaymentRow key={p.id} payment={p} onAction={handleAction} />)}
        </div>
      )}
    </div>
  );
}
