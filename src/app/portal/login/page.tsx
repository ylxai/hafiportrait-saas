'use client'

import { Suspense, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, KeyRound } from 'lucide-react'
import { toast } from 'sonner'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Default landing after a successful client login. The middleware will
  // forward the user to the requested page if it's whitelisted for the
  // CLIENT role (e.g. /gallery/[token], /portal/dashboard).
  const callbackUrl = searchParams.get('callbackUrl') || '/portal/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const result = await signIn('client', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        toast.error('Email atau password salah')
        return
      }

      toast.success('Login berhasil')
      router.push(callbackUrl)
      router.refresh()
    } catch {
      toast.error('Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-2">
            <KeyRound className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Masuk ke Gallery</h1>
          <p className="text-muted-foreground">
            Gunakan email & password yang diberikan oleh studio Anda.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-card text-foreground rounded-2xl shadow-lg border border-border p-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
              className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground py-3 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Memproses...
              </>
            ) : (
              'Masuk'
            )}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Belum punya akses? Hubungi studio fotografi Anda.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  // useSearchParams() must be wrapped in <Suspense> in the App Router so the
  // segment can be statically prerendered and hydrate cleanly.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
