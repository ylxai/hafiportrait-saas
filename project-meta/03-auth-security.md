# PhotoStudio SaaS — Auth & Security

> Authentication flow, authorization gates, role system, and security rules.

---

## 1. Two-Auth System

The app has **two separate login flows**:

| System | Route | Provider | Role | Purpose |
|---|---|---|---|---|
| **Admin** | `/login` | CredentialsProvider (id: `admin`) | `ROLE_ADMIN` | Admin dashboard |
| **Client Portal** | `/portal/login` | CredentialsProvider (id: `client`) | `ROLE_CLIENT` | Client self-service |

**Important**: Two separate JWT sessions (not single-sign-on). Session tokens are NOT shared — an admin session does NOT grant portal access, and vice versa.

---

## 2. NextAuth.js Configuration (lib/auth/options.ts)

### Admin Provider (id: `"admin"`)
- Credentials: `{ email, password }`
- Background: `bcryptjs.compare(credentials.password, user.password)`
- Timing Attack Protection: Always hashes against a pre-computed `DUMMY_HASH` when user not found (constant-time comparison)
- Role: Sets `role: "admin"` in token/session

### Client Provider (id: `"client"`)
- Credentials: `{ email, password }`
- Maps client to Client model (not User model)
- Background: Normalizes email → `Client.findUnique` → `bcryptjs.compare`
- Role: Sets `role: "client"` in token/session

### Session Strategy: JWT
```typescript
session: { strategy: 'jwt' }
```

### Security Measures
- Email normalization (trim + lowercase via `normalizeEmail()`)
- Role normalization (lowercase + trim via `normalizeRawRole()` / `normalizeTokenRole()`)
- Session maxAge: 30 days (default)
- CSRF token rotation for all pages

---

## 3. Role System

```typescript
// src/lib/auth/role-constants.ts
export const ROLE_ADMIN = "admin";
export const ROLE_CLIENT = "client";
export const PROVIDER_ID_ADMIN = "admin";
export const PROVIDER_ID_CLIENT = "client";
```

All role comparisons are **normalized** (trim + lowercase) before check:

```typescript
// src/lib/auth/role-helpers.ts
export function normalizeTokenRole(token: { role?: string | null }): string
export function isAdminSession(session: Session): boolean
export function isClientSession(session: Session): boolean
export function normalizeRawRole(role: string | undefined): string
```

**CRITICAL**: Role normalization must be identical across middleware, route guards, and authOptions. Any inconsistency can cause privilege escalation.

---

## 4. Middleware (src/middleware.ts)

Runs in **Edge runtime** (no `node:async_hooks`).

### Flow
1. **Request ID**: Generates or echoes `x-request-id` header for request tracing
2. **Public Route Check**: Routes in `publicRoutes[]` skip auth
3. **Token Validation**: `getToken()` validates JWT via `process.env.NEXTAUTH_SECRET`
4. **Role-Based Access Control**:
   - `/admin` or `/api/admin` → requires `ROLE_ADMIN`
   - `/portal` or `/api/portal` → requires `ROLE_CLIENT`
   - Cross-visitors redirected (admin visiting portal → `/admin`; client visiting admin → `/portal/dashboard`)
5. **Header Injection**: Sets `x-user-id`, `x-user-email`, `x-user-role` on downstream request headers (NOT response — prevents spoofing leakage)

### Public Routes (No Auth)
```typescript
const publicRoutes = [
  "/",
  "/login",
  "/portal/login",
  "/portal/verify",
  "/api/auth",
  "/api/portal/auth",
  "/api/public",
  "/api/webhook",
  "/booking",
  "/gallery",
  "/api/ably/token",
];
```

`/gallery` (public image gallery by token) MUST NOT require auth — driven by `clientToken` in URL, not session.

### Middleware Security Edge Cases
- `/portal/login` with existing token: Redirects admin → `/admin`, honors `callbackUrl` for client
- CallbackUrl validation: `startsWith('/') && !startsWith('//') && !includes('\\') && !includes('://')`
- Invalid token (missing email): Returns 401 with request-id header

---

## 5. Route-Level Auth Guards

### Admin API (`/api/admin/*`)
```typescript
import { requireAdminAuth } from '@/lib/auth/require-admin-auth'

export async function GET(req: Request) {
  const auth = await requireAdminAuth()
  if (auth instanceof NextResponse) return auth
  // auth.user.email & auth.user.role === 'admin' are now safe
}
```

### Portal API (`/api/portal/*`)
```typescript
import { requireClientAuth } from '@/lib/auth/require-client-auth'

export async function GET(req: Request) {
  const auth = await requireClientAuth()
  if (auth instanceof NextResponse) return auth
  // auth.user.email & auth.user.role === 'client' are now safe
}
```

### Page-Level (Dashboard) Auth
No separate page-level guard — middleware handles it. But for server-rendered pages:
```typescript
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/options'

export default async function Page() {
  const session = await getServerSession(authOptions)
  if (!session) { redirect('/login') }
}
```

---

## 6. Webhook Security

All `/api/webhook/*` routes MUST validate:
```typescript
import { env } from '@/lib/env.server'
const secret = req.headers.get('x-webhook-secret')
if (secret !== env.VPS_WEBHOOK_SECRET) {
  return unauthorizedResponse('Invalid webhook secret')
}
```

---

## 7. Security Checklist

- ✅ Auth guards on ALL `/api/admin/*` and `/api/portal/*` routes
- ✅ Zod validation on ALL API inputs (NO unvalidated requests)
- ✅ BigInt serialization in all API responses (`successResponse()`)
- ✅ Credential encryption (bcrypt)
- ✅ Timing-attack resistance (dummy hash for missing users)
- ⚠️ **callbackUrl validation**: Vulnerable to open redirect (` ` + `/evil.com`) — patched but review periodically
- ⚠️ **Hardcoded `DUMMY_HASH`**: Static across deploys — not ideal, but mitigated by bcrypt cost being identical with real hashes
- ⚠️ **Session maxAge**: 30 days — review for security/privacy
