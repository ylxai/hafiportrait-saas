'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState({
    nama: '',
    email: '',
    phone: '',
    instagram: ''
  })

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch('/api/portal/profile')
        const data = await res.json()

        if (res.ok && data.data?.client) {
          setProfile(data.data.client)
        }
      } catch {
        toast.error('Gagal memuat profil')
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    try {
      const res = await fetch('/api/portal/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: profile.nama,
          phone: profile.phone || null,
          instagram: profile.instagram || null
        })
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Gagal menyimpan')
        return
      }

      toast.success('Profil berhasil diperbarui')
    } catch {
      toast.error('Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground mb-6">Profil Saya</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Nama
          </label>
          <input
            type="text"
            value={profile.nama}
            onChange={(e) => setProfile({ ...profile, nama: e.target.value })}
            required
            className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Email
          </label>
          <input
            type="email"
            value={profile.email}
            disabled
            className="w-full px-4 py-3 border border-border rounded-lg bg-card text-muted-foreground cursor-not-allowed"
          />
          <p className="text-xs text-muted-foreground mt-1">Email tidak dapat diubah</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Nomor Telepon
          </label>
          <input
            type="tel"
            value={profile.phone || ''}
            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
            className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Instagram
          </label>
          <input
            type="text"
            value={profile.instagram || ''}
            onChange={(e) => setProfile({ ...profile, instagram: e.target.value })}
            placeholder="@username"
            className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-primary text-primary-foreground py-3 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Menyimpan...
            </>
          ) : (
            'Simpan Perubahan'
          )}
        </button>
      </form>
    </div>
  )
}
