'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, ExternalLink, ImageIcon } from 'lucide-react';

export type PaymentStatus = 'pending' | 'approved' | 'rejected';

export const PAYMENT_STATUS_CONFIG: Record<PaymentStatus, { label: string; className: string }> = {
  pending: {
    label: 'Menunggu Konfirmasi',
    className: 'bg-warning/15 text-warning border border-warning/30',
  },
  approved: {
    label: 'Disetujui',
    className: 'bg-success/15 text-success border border-success/30',
  },
  rejected: {
    label: 'Ditolak',
    className: 'bg-destructive/15 text-destructive border border-destructive/30',
  },
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const cfg = PAYMENT_STATUS_CONFIG[status] ?? PAYMENT_STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>
      {status === 'pending' && <Clock className="w-3 h-3" />}
      {status === 'approved' && <CheckCircle className="w-3 h-3" />}
      {status === 'rejected' && <XCircle className="w-3 h-3" />}
      {cfg.label}
    </span>
  );
}

export function PaymentProofThumbnail({ proofUrl }: { proofUrl: string | null }) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [proofUrl]);

  if (proofUrl && !imgError) {
    return (
      <a
        href={proofUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-16 h-16 rounded-xl overflow-hidden border border-border hover:border-primary transition-colors group relative"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={proofUrl}
          alt="Bukti transfer"
          loading="lazy"
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
        <div className="absolute inset-0 bg-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <ExternalLink className="w-4 h-4 text-background" />
        </div>
      </a>
    );
  }

  return (
    <div className="w-16 h-16 rounded-xl border border-border bg-muted flex items-center justify-center">
      <ImageIcon className="w-6 h-6 text-muted-foreground" />
    </div>
  );
}

export function PaymentActionButtons({
  status,
  proofUrl,
  loading,
  onApprove,
  onReject,
}: {
  status: PaymentStatus;
  proofUrl: string | null;
  loading: 'approve' | 'reject' | null;
  onApprove: () => void;
  onReject: () => void;
}) {
  if (status !== 'pending' || !proofUrl) return null;

  return (
    <div className="flex gap-2 flex-shrink-0">
      <button
        onClick={onApprove}
        disabled={loading !== null}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-success/15 text-success border border-success/30 hover:bg-success/25 transition-colors text-sm font-medium disabled:opacity-50"
      >
        <CheckCircle className="w-3.5 h-3.5" />
        {loading === 'approve' ? 'Memproses...' : 'Setujui'}
      </button>
      <button
        onClick={onReject}
        disabled={loading !== null}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 transition-colors text-sm font-medium disabled:opacity-50"
      >
        <XCircle className="w-3.5 h-3.5" />
        {loading === 'reject' ? 'Memproses...' : 'Tolak'}
      </button>
    </div>
  );
}
