'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Loader2, AlertCircle } from 'lucide-react'

export default function VerifyPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [error, setError] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    
    if (!token) {
      setError('Token tidak ditemukan')
      return
    }

    async function verify() {
      try {
        const res = await fetch('/api/portal/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        })

        const data = await res.json()

        if (!res.ok) {
          setError(data.error || 'Link tidak valid')
          return
        }

        const result = await signIn('credentials', {
          redirect: false,
          provider: 'client',
          clientId: data.data.clientId,
          email: data.data.email
        })

        if (result?.error) {
          setError('Gagal masuk')
          return
        }

        router.push('/portal/dashboard')
      } catch {
        setError('Terjadi kesalahan')
      }
    }

    verify()
  }, [searchParams, router])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Verifikasi Gagal</h1>
            <p className="text-muted-foreground">{error}</p>
          </div>
          <a
            href="/portal/login"
            className="inline-block bg-primary text-primary-foreground px-6 py-3 rounded-lg hover:bg-primary/90 transition-colors"
          >
            Kembali ke Login
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
        <p className="text-muted-foreground">Memverifikasi...</p>
      </div>
    </div>
  )
}
