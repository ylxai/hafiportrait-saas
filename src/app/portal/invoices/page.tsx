'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Loader2, Receipt, Upload, CheckCircle, Clock, XCircle, AlertCircle, ChevronDown, ChevronUp, MapPin, Package, Calendar } from 'lucide-react'
import { toast } from 'sonner'

interface PackageDetail {
  nama: string
  description: string | null
  price: number
  duration: number | null
  fitur: string[]
  maxSelection: number
  maxDownload: number
}

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
    location: string | null
    paymentStatus: string
    package: PackageDetail | null
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
  const [expandedId, setExpandedId] = useState<string | null>(null)
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

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !activePaymentId) return

    const payment = payments.find(p => p.id === activePaymentId)
    if (!payment) return

    // Cleanup helper — reset input + activePaymentId
    function cleanup() {
      setActivePaymentId(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }

    // Validate file type
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      toast.error('Format file tidak didukung. Gunakan JPG, PNG, atau WebP.')
      cleanup()
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran file maksimal 5MB')
      cleanup()
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
            const isExpanded = expandedId === payment.id
            const detailId = `invoice-detail-${payment.id}`
            const eventDate = new Date(payment.event.eventDate)
            const isUploading = uploading === payment.id

            return (
              <div key={payment.id} className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Clickable header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : payment.id)}
                  aria-expanded={isExpanded}
                  aria-controls={detailId}
                  className="w-full text-left p-5 space-y-4 hover:bg-muted transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-foreground">{payment.event.namaProject}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {eventDate.toLocaleDateString('id-ID', {
                          day: 'numeric', month: 'long', year: 'numeric'
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${cfg.className}`}>
                        <Icon className="w-3.5 h-3.5" />
                        {cfg.label}
                      </span>
                      {isExpanded
                        ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      }
                    </div>
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
                </button>

                {/* Expandable detail */}
                {isExpanded && (
                  <div id={detailId} className="px-5 pb-5 space-y-4 border-t border-border">
                    {/* Event info */}
                    <div className="pt-4 space-y-2">
                      <h4 className="text-sm font-medium text-foreground">Detail Event</h4>
                      <div className="space-y-1.5 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 shrink-0" />
                          {eventDate.toLocaleDateString('id-ID', {
                            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                          })}
                        </div>
                        {payment.event.location && (
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 shrink-0" />
                            {payment.event.location}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Package detail */}
                    {payment.event.package && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                          <Package className="w-4 h-4" />
                          Paket: {payment.event.package.nama}
                        </h4>
                        {payment.event.package.description && (
                          <p className="text-sm text-muted-foreground">{payment.event.package.description}</p>
                        )}
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="bg-background rounded-lg p-3">
                            <p className="text-muted-foreground text-xs mb-1">Harga Paket</p>
                            <p className="font-semibold text-foreground">Rp {payment.event.package.price.toLocaleString('id-ID')}</p>
                          </div>
                          {payment.event.package.duration != null && (
                            <div className="bg-background rounded-lg p-3">
                              <p className="text-muted-foreground text-xs mb-1">Durasi</p>
                              <p className="font-semibold text-foreground">{payment.event.package.duration} menit</p>
                            </div>
                          )}
                          <div className="bg-background rounded-lg p-3">
                            <p className="text-muted-foreground text-xs mb-1">Maks. Pilih Foto</p>
                            <p className="font-semibold text-foreground">{payment.event.package.maxSelection} foto</p>
                          </div>
                          <div className="bg-background rounded-lg p-3">
                            <p className="text-muted-foreground text-xs mb-1">Maks. Download</p>
                            <p className="font-semibold text-foreground">
                              {payment.event.package.maxDownload === 0 ? 'Tidak terbatas' : `${payment.event.package.maxDownload} foto`}
                            </p>
                          </div>
                        </div>
                        {payment.event.package.fitur.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground font-medium">Termasuk:</p>
                            <ul className="space-y-1">
                              {payment.event.package.fitur.map((f) => (
                                <li key={f} className="flex items-center gap-2 text-sm text-foreground">
                                  <CheckCircle className="w-3.5 h-3.5 text-primary shrink-0" />
                                  {f}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

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
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
