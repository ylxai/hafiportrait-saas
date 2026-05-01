'use client'

import { useEffect, useState } from 'react'
import { Loader2, Image, Calendar } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

interface Gallery {
  id: string
  namaProject: string
  clientToken: string
  status: string
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

export default function DashboardPage() {
  const [galleries, setGalleries] = useState<Gallery[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/portal/dashboard')
        const data = await res.json()

        if (!res.ok) {
          toast.error(data.error || 'Gagal memuat data')
          return
        }

        setGalleries(data.data.galleries)
      } catch (error) {
        toast.error('Terjadi kesalahan')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (galleries.length === 0) {
    return (
      <div className="text-center py-12">
        <Image className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">Belum Ada Gallery</h2>
        <p className="text-muted-foreground">Gallery Anda akan muncul di sini setelah fotografer mengunggah foto</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Gallery Saya</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {galleries.map((gallery) => {
          const isNew = gallery.status === 'published' && gallery._count.selections === 0
          return (
            <Link
              key={gallery.id}
              href={`/gallery/${gallery.clientToken}`}
              className="block bg-card border border-border rounded-lg p-4 hover:bg-card-hover transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-foreground">{gallery.event.namaProject}</h3>
                {isNew && (
                  <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
                    Baru!
                  </span>
                )}
              </div>

              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {new Date(gallery.event.eventDate).toLocaleDateString('id-ID')}
                </div>
                <div className="flex items-center gap-2">
                  <Image className="w-4 h-4" />
                  {gallery._count.photos} foto
                </div>
              </div>

              {gallery._count.selections > 0 && (
                <div className="mt-3 pt-3 border-t border-border text-sm text-primary">
                  ✓ Seleksi sudah dikirim
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
