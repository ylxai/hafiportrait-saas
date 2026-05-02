'use client'

import { useEffect, useState } from 'react'
import { Loader2, Receipt } from 'lucide-react'
import { toast } from 'sonner'

interface Payment {
  id: string
  amount: number
  type: string
  status: string
  createdAt: string
  event: {
    namaProject: string
    eventDate: string
  }
}

export default function InvoicesPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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

    fetchPayments()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (payments.length === 0) {
    return (
      <div className="text-center py-12">
        <Receipt className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">Belum Ada Tagihan</h2>
        <p className="text-muted-foreground">Tagihan pembayaran akan muncul di sini</p>
      </div>
    )
  }

  const statusColors = {
    pending: 'text-muted-foreground bg-muted',
    approved: 'text-primary bg-primary/10',
    rejected: 'text-destructive bg-destructive/10'
  }

  const statusLabels = {
    pending: 'Menunggu',
    approved: 'Disetujui',
    rejected: 'Ditolak'
  }

  const typeLabels = {
    dp: 'DP',
    full: 'Pelunasan'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Tagihan</h1>
        <p className="text-sm text-muted-foreground">
          Untuk pembayaran, silakan hubungi fotografer
        </p>
      </div>

      <div className="space-y-4">
        {payments.map((payment) => (
          <div
            key={payment.id}
            className="bg-card border border-border rounded-lg p-4"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-foreground">{payment.event.namaProject}</h3>
                <p className="text-sm text-muted-foreground">
                  {new Date(payment.event.eventDate).toLocaleDateString('id-ID')}
                </p>
              </div>
              <span
                className={`text-xs px-3 py-1 rounded-full ${
                  statusColors[payment.status as keyof typeof statusColors]
                }`}
              >
                {statusLabels[payment.status as keyof typeof statusLabels]}
              </span>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border">
              <span className="text-sm text-muted-foreground">
                {typeLabels[payment.type as keyof typeof typeLabels]}
              </span>
              <span className="text-lg font-bold text-foreground">
                Rp {payment.amount.toLocaleString('id-ID')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
