'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Receipt, Upload, CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface Payment {
  id: string
  amount: number
  type: string
  status: string
  method: string
  proofUrl: string | null
  createdAt: string
  updatedAt: string
  event: {
    id: string
    namaProject: string
    eventDate: string
    paymentStatus: string
  }
}

const statusConfig = {
  pending: { label: 'Menunggu Pembayaran', className: 'bg-muted text-muted-foreground', icon: Clock },
  approved: { label: 'Disetujui', className: 'bg-primary/10 text-primary', icon: CheckCircle },
  rejected: { label: 'Ditolak', className: 'bg-destructive/10 text-destructive', icon: XCircle },
  awaiting_confirmation: { label: 'Menunggu Konfirmasi', className: 'bg-primary/10 text-primary', icon: AlertCircle },
}

const typeLabels: Record<string, string> = { dp: 'DP', full: 'Pelunasan' }

export default function InvoicesPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null)

  useEffect(() => {
    fetchPayments()
  }, [])

  async function fetchPayments() {
    try {
      const res = await fetch('/api/portal/invoices')
      const data = await res.json()
      if (res.ok) {
        setPayments(data.data.payments)
      } else {
        toast.error(data.error || 'Gagal memuat tagihan')
      }
    } catch {
      toast.error('Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  function handleUploadClick(paymentId: string) {
    setActivePaymentId(paymentId)
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !activePaymentId) return

    const payment = payments.find(p => p.id === activePaymentId)
    if (!payment) return

    // Validate file type
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      toast.error('Format file tidak didukung. Gunakan JPG, PNG, atau WebP.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran file maksimal 5MB')
      return
    }

    setUploading(activePaymentId)
    try {
      // 1. Get presigned URL
      const presignedRes = await fetch('/api/public/payment/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          eventId: payment.event.id,
          fileSize: file.size,
        }),
      })
      const presignedData = await presignedRes.json()
      if (!presignedRes.ok) {
        toast.error(presignedData.error || 'Gagal mendapatkan URL upload')
        return
      }

      const { presignedUrl, uploadId } = presignedData.data

      // 2. Upload to R2
      const uploadRes = await fetch(presignedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!uploadRes.ok) {
        toast.error('Gagal mengupload file')
        return
      }

      // 3. Submit proof
      const submitRes = await fetch('/api/public/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: payment.event.id,
          paymentId: payment.id,
          uploadId,
        }),
      })
      const submitData = await submitRes.json()
      if (!submitRes.ok) {
        toast.error(submitData.error || 'Gagal mengirim bukti pembayaran')
        return
      }

      toast.success('Bukti pembayaran berhasil dikirim! Menunggu konfirmasi studio.')
      await fetchPayments()
    } catch {
      toast.error('Terjadi kesalahan saat upload')
    } finally {
      setUploading(null)
      setActivePaymentId(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tagihan</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload bukti transfer untuk konfirmasi pembayaran
        </p>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {payments.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <Receipt className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <h2 className="text-lg font-semibold text-foreground mb-1">Belum Ada Tagihan</h2>
          <p className="text-muted-foreground text-sm">Tagihan pembayaran akan muncul di sini</p>
        </div>
      ) : (
        <div className="space-y-4">
          {payments.map((payment) => {
            const cfg = statusConfig[payment.status as keyof typeof statusConfig] ?? statusConfig.pending
            const Icon = cfg.icon
            const canUpload = payment.status === 'pending' && !payment.proofUrl
            const isUploading = uploading === payment.id

            return (
              <div key={payment.id} className="bg-card border border-border rounded-xl p-5 space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-foreground">{payment.event.namaProject}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {new Date(payment.event.eventDate).toLocaleDateString('id-ID', {
                        day: 'numeric', month: 'long', year: 'numeric'
                      })}
                    </p>
                  </div>
                  <span className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full shrink-0 ${cfg.className}`}>
                    <Icon className="w-3.5 h-3.5" />
                    {cfg.label}
                  </span>
                </div>

                {/* Amount */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="text-sm text-muted-foreground">
                    <span>{typeLabels[payment.type] ?? payment.type}</span>
                    <span className="mx-2">·</span>
                    <span>Transfer Bank</span>
                  </div>
                  <span className="text-xl font-bold text-foreground">
                    Rp {payment.amount.toLocaleString('id-ID')}
                  </span>
                </div>

                {/* Proof status */}
                {payment.proofUrl && payment.status !== 'approved' && (
                  <div className="flex items-center gap-2 text-sm text-primary bg-primary/5 rounded-lg px-3 py-2">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    Bukti transfer sudah dikirim, menunggu konfirmasi studio
                  </div>
                )}

                {/* Upload button */}
                {canUpload && (
                  <button
                    onClick={() => handleUploadClick(payment.id)}
                    disabled={isUploading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-primary text-primary hover:bg-primary/5 transition-colors disabled:opacity-50 text-sm font-medium"
                  >
                    {isUploading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Mengupload...</>
                    ) : (
                      <><Upload className="w-4 h-4" /> Upload Bukti Transfer</>
                    )}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
