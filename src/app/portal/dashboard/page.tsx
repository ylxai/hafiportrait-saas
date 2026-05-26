'use client'

import { useEffect, useState, Suspense } from 'react'
import { Loader2, Image, Calendar, Receipt, CheckCircle, Clock, ExternalLink, XCircle, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

interface Payment {
  id: string
  amount: number
  type: string
  status: string
  method: string
  createdAt: string
  event: {
    namaProject: string
    eventDate: string
  }
}

interface Gallery {
  id: string
  namaProject: string
  clientToken: string
  status: string
  isSelectionLocked: boolean
  createdAt: string
  event: {
    namaProject: string
    eventDate: string
  }
  _count: {
    photos: number
    selections: number
  }
}

interface DashboardData {
  galleries: Gallery[]
  payments: Payment[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

const statusConfig = {
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  published: { label: 'Tersedia', className: 'bg-primary/10 text-primary' },
  archived: { label: 'Arsip', className: 'bg-muted text-muted-foreground' },
}

const paymentStatusConfig = {
  pending: { label: 'Menunggu', className: 'bg-muted text-muted-foreground', icon: Clock },
  approved: { label: 'Disetujui', className: 'bg-primary/10 text-primary', icon: CheckCircle },
  rejected: { label: 'Ditolak', className: 'bg-destructive/10 text-destructive', icon: XCircle },
  awaiting_confirmation: { label: 'Menunggu Konfirmasi', className: 'bg-primary/10 text-primary', icon: AlertCircle },
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
      <DashboardContent />
    </Suspense>
  )
}

function DashboardContent() {
  const searchParams = useSearchParams()
  const showAll = searchParams.get('all') === '1'
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const limit = showAll ? 100 : 6
        const res = await fetch(`/api/portal/dashboard?limit=${limit}`)
        const json = await res.json()
        if (!res.ok) {
          toast.error(json.error || 'Gagal memuat data')
          return
        }
        setData(json.data)
      } catch {
        toast.error('Terjadi kesalahan')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [showAll])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  const galleries = data?.galleries ?? []
  const payments = data?.payments ?? []
  const totalGalleries = data?.pagination?.total ?? 0
  const pendingPayments = payments.filter(p => p.status === 'pending').length
  const publishedGalleries = galleries.filter(g => g.status === 'published').length

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Selamat datang di portal client Anda</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Image className="w-5 h-5 text-primary" aria-label="Gallery" />
            </div>
            <span className="text-sm text-muted-foreground">Total Gallery</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{totalGalleries}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-primary" />
            </div>
            <span className="text-sm text-muted-foreground">Gallery Aktif</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{publishedGalleries}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 col-span-2 lg:col-span-1">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-primary" />
            </div>
            <span className="text-sm text-muted-foreground">Tagihan Pending</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{pendingPayments}</p>
        </div>
      </div>

      {/* Galleries */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Gallery Saya</h2>
          {totalGalleries > 6 && (
            <Link href="/portal/dashboard?all=1" className="text-sm text-primary hover:underline">
              Lihat semua
            </Link>
          )}
        </div>

        {galleries.length === 0 ? (
          <div className="text-center py-10 bg-card border border-border rounded-xl">
            <Image className="w-12 h-12 mx-auto text-muted-foreground mb-3" aria-label="Empty" />
            <p className="text-muted-foreground">Belum ada gallery</p>
            <p className="text-sm text-muted-foreground mt-1">Gallery akan muncul setelah fotografer mengunggah foto</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {galleries.map((gallery) => {
              const cfg = statusConfig[gallery.status as keyof typeof statusConfig] ?? statusConfig.draft
              const hasSelection = gallery._count.selections > 0
              const canSelect = gallery.status === 'published' && !gallery.isSelectionLocked

              return (
                <div key={gallery.id} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{gallery.event.namaProject}</h3>
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {new Date(gallery.event.eventDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full shrink-0 ml-2 ${cfg.className}`}>
                      {cfg.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{gallery._count.photos} foto</span>
                    {hasSelection && <span className="text-primary">✓ Sudah dipilih</span>}
                    {canSelect && <span className="text-primary animate-pulse">Pilih foto</span>}
                  </div>

                  {gallery.status === 'published' && (
                    <Link
                      href={`/gallery/${gallery.clientToken}`}
                      className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Buka Gallery
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent Payments */}
      {payments.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Tagihan Terbaru</h2>
            <Link href="/portal/invoices" className="text-sm text-primary hover:underline">
              Lihat semua
            </Link>
          </div>

          <div className="space-y-3">
            {payments.slice(0, 3).map((payment) => {
              const cfg = paymentStatusConfig[payment.status as keyof typeof paymentStatusConfig] ?? paymentStatusConfig.pending
              const Icon = cfg.icon
              return (
                <div key={payment.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${cfg.className}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground text-sm">{payment.event.namaProject}</p>
                      <p className="text-xs text-muted-foreground">
                        {payment.type === 'dp' ? 'DP' : 'Pelunasan'} · {new Date(payment.createdAt).toLocaleDateString('id-ID')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-foreground">Rp {payment.amount.toLocaleString('id-ID')}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.className}`}>{cfg.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
