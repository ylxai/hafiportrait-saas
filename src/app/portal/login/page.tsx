'use client'

import { Suspense, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Loader2, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { PROVIDER_ID_CLIENT } from '@/lib/auth/role-constants'

/**
 * Validate a `callbackUrl` query parameter against open-redirect attacks.
 *
 * Without this guard an attacker could craft a link like
 *   `https://hafiportrait.com/portal/login?callbackUrl=https://evil.com`
 * and the browser would happily push the user there post-login (the
 * outer domain is legitimate, only the redirect target is malicious).
 * The classic mitigation is to refuse anything that doesn't look like a
 * same-origin path — i.e. starts with a single `/`, no protocol, no
 * protocol-relative `//`, no backslash tricks.
 */
function safeCallbackUrl(raw: string | null): string {
  const fallback = '/portal/dashboard'
  if (!raw) return fallback
  // Reject protocol-relative URLs like `//evil.com/foo` and any URL with
  // a scheme (`http:`, `javascript:`, `data:`). Also reject `\\evil.com`
  // which some browsers historically normalised to `//evil.com`.
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return fallback
  }
  // Belt-and-braces: also reject strings that decode to a different
  // scheme (e.g. `%2F%2Fevil.com` which decodes to `//evil.com`).
  try {
    const decoded = decodeURIComponent(raw)
    if (!decoded.startsWith('/') || decoded.startsWith('//') || decoded.startsWith('/\\')) {
      return fallback
    }
  } catch {
    return fallback
  }
  return raw
}

function LoginForm() {
  const searchParams = useSearchParams()
  // Default landing after a successful client login. The middleware will
  // forward the user to the requested page if it's whitelisted for the
  // CLIENT role (e.g. /gallery/[token], /portal/dashboard). The raw query
  // value is run through `safeCallbackUrl` to prevent open-redirect.
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'))

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      // BUG FIX #6: Sign out any existing session (e.g. admin) before signing
      // in as a client. Without this, a logged-in admin who somehow reaches
      // this form could end up with a confused dual-session state where both
      // the old admin cookie and the new client token coexist, granting
      // unintended access to /admin routes.
      await signOut({ redirect: false })

      const result = await signIn(PROVIDER_ID_CLIENT, {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        toast.error('Email atau password salah')
        setLoading(false)
        return
      }

      toast.success('Login berhasil')
      // Hard navigation guarantees the freshly-set `next-auth.session-token`
      // cookie is included on the destination request. With the previous
      // `router.push()` + `router.refresh()` pattern there was a race
      // window where the edge middleware fetched the RSC payload before
      // the Set-Cookie was committed to the jar — the resulting token=null
      // bounced the user straight back to /portal/login despite having a
      // valid session. `window.location.replace` triggers a full document
      // load (so the cookie jar is always current) AND removes the login
      // page from session history — so a "Back" press after a successful
      // sign-in does not flash the form before middleware sends the user
      // back to the dashboard.
      window.location.replace(callbackUrl)
      // No `setLoading(false)` here on purpose; the page is unloading and
      // re-enabling the button would briefly flicker the form.
    } catch {
      toast.error('Terjadi kesalahan')
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
