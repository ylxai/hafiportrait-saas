'use client';

import { useCallback, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAdminAlertsSubscription, type AdminAlert } from '@/lib/hooks/useAbly';

// Only `exceeded` (storage) and `failed` (jobs) leave behind a persistent
// banner. Warnings still fire a toast but disappear with it — they're
// informational, not actionable.
type PersistentAlert =
  | (Extract<AdminAlert, { type: 'storage_quota' }> & { alertType: 'exceeded' })
  | (Extract<AdminAlert, { type: 'failed_job' }> & { alertType: 'failed' });

const MAX_VISIBLE_BANNERS = 3;

function describeQuotaAlert(alert: Extract<AdminAlert, { type: 'storage_quota' }>): {
  variant: 'warning' | 'error';
  message: string;
} {
  const used = alert.usedGB.toFixed(2);
  const quota = alert.quotaGB.toFixed(2);
  const pct = Math.round(alert.percentage);

  switch (alert.alertType) {
    case 'warning':
      return {
        variant: 'warning',
        message: `${alert.clientName} mendekati kuota (${pct}% – ${used}/${quota} GB).`,
      };
    case 'critical':
      return {
        variant: 'warning',
        message: `${alert.clientName} hampir penuh (${pct}% – ${used}/${quota} GB).`,
      };
    case 'exceeded':
      return {
        variant: 'error',
        message: `Kuota ${alert.clientName} terlampaui (${used}/${quota} GB).`,
      };
  }
}

function describeFailedJob(alert: Extract<AdminAlert, { type: 'failed_job' }>): {
  variant: 'warning' | 'error' | 'success';
  message: string;
} {
  switch (alert.alertType) {
    case 'failed':
      return {
        variant: 'error',
        message: `Job ${alert.jobType} gagal (${alert.attemptCount ?? '?'}x). ${
          alert.errorMessage ?? ''
        }`.trim(),
      };
    case 'retry':
      return {
        variant: 'warning',
        message: `Job ${alert.jobType} sedang di-retry (#${alert.attemptCount ?? '?'}).`,
      };
    case 'resolved':
      return {
        variant: 'success',
        message: `Job ${alert.jobType} berhasil diselesaikan${
          alert.resolvedBy ? ` oleh ${alert.resolvedBy}` : ''
        }.`,
      };
  }
}

function isPersistentAlert(alert: AdminAlert): alert is PersistentAlert {
  if (alert.type === 'storage_quota') return alert.alertType === 'exceeded';
  if (alert.type === 'failed_job') return alert.alertType === 'failed';
  return false;
}

function alertKey(alert: AdminAlert): string {
  if (alert.type === 'storage_quota') {
    return `q:${alert.clientId}:${alert.galleryId}:${alert.alertType}`;
  }
  if (alert.type === 'failed_job') {
    return `j:${alert.jobId}:${alert.alertType}`;
  }
  return `p:${alert.paymentId}`;
}

/**
 * Global admin banner that subscribes to `photostudio:admin:alerts` and
 * surfaces realtime warnings without forcing the admin to refresh:
 *
 *  - Every alert pops a toast (`sonner`) so it cannot be missed.
 *  - Critical alerts (storage quota `exceeded`, job `failed`) also stick as
 *    a persistent inline banner with a dismiss button so the admin can act
 *    on them after the toast has timed out.
 *
 * The component renders nothing for non-admin sessions; the inner hook is
 * gated by `enabled` so non-admins do not even attempt to mint an Ably
 * TokenRequest.
 */
export default function AdminAlertsBanner() {
  const { data: session } = useSession();
  const isAdmin = (session?.user?.role ?? '').toLowerCase() === 'admin';

  // Most recent persistent alerts, newest first. Capped so a burst of
  // failed jobs doesn't render a wall of banners.
  const [pinned, setPinned] = useState<PersistentAlert[]>([]);

  const handleAlert = useCallback((alert: AdminAlert) => {
    if (alert.type === 'storage_quota') {
      const { variant, message } = describeQuotaAlert(alert);
      if (variant === 'warning') {
        toast.warning(message);
      } else {
        toast.error(message);
      }
    } else if (alert.type === 'failed_job') {
      const { variant, message } = describeFailedJob(alert);
      if (variant === 'success') {
        toast.success(message);
      } else if (variant === 'warning') {
        toast.warning(message);
      } else {
        toast.error(message);
      }
    } else {
      // payment_proof — toast only, no persistent banner
      toast.info(`Bukti transfer baru dari ${alert.clientName}`, {
        description: `Rp ${alert.amount.toLocaleString('id-ID')} · ${alert.kodeBooking}`,
      });
    }

    if (!isPersistentAlert(alert)) return;
    setPinned((prev) => {
      const key = alertKey(alert);
      // Replace any existing banner with the same key instead of dropping
      // the incoming event. The publisher re-emits with updated fields
      // (e.g. `usedGB` climbing, `errorMessage` rotating to the latest
      // failure) — keeping the older copy would freeze the banner on
      // stale data and hide the now-actionable state.
      const filtered = prev.filter((p) => alertKey(p) !== key);
      return [alert, ...filtered].slice(0, MAX_VISIBLE_BANNERS);
    });
  }, []);

  useAdminAlertsSubscription(isAdmin, handleAlert);

  const dismiss = useCallback((key: string) => {
    setPinned((prev) => prev.filter((p) => alertKey(p) !== key));
  }, []);

  if (!isAdmin || pinned.length === 0) return null;

  return (
    <div
      className="mb-4 space-y-2"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {pinned.map((alert) => {
        const key = alertKey(alert);
        if (alert.type === 'storage_quota') {
          const { message } = describeQuotaAlert(alert);
          return (
            <div
              key={key}
              className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground"
            >
              <span aria-hidden="true">💾</span>
              <div className="flex-1">
                <p className="font-medium text-destructive">Kuota Penyimpanan</p>
                <p className="text-muted-foreground">{message}</p>
                <Link
                  href="/admin/storage"
                  className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
                >
                  Buka Storage →
                </Link>
              </div>
              <button
                type="button"
                onClick={() => dismiss(key)}
                aria-label="Tutup peringatan"
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                ✕
              </button>
            </div>
          );
        }
        const { message } = describeFailedJob(alert);
        return (
          <div
            key={key}
            className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground"
          >
            <span aria-hidden="true">⚠️</span>
            <div className="flex-1">
              <p className="font-medium text-destructive">Background Job Gagal</p>
              <p className="text-muted-foreground">{message}</p>
              <Link
                href="/admin/storage"
                className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
              >
                Lihat Failed Jobs →
              </Link>
            </div>
            <button
              type="button"
              onClick={() => dismiss(key)}
              aria-label="Tutup peringatan"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
