# PhotoStudio SaaS — Known Issues & Debugging

> Production bugs, their symptoms, and how to debug them.

---

## 🔴 Critical Issues (Active)

### 1. Gallery "Kelola" Crash — `Terjadi Kesalahan`

**Status**: NOT FIXED (as of 2026-06-03)

**Symptom**: Clicking "Kelola" button on `/admin/galleries` page throws error boundary showing "Terjadi Kesalahan — Maaf, terjadi kesalahan saat memuat halaman admin."

**What was tried:**
- PR #165: Added `error` destructuring to `useSWR` hooks in gallery pages + added error UI
- Result: Error boundary STILL shows — `error` handling didn't help
- Pattern suggests error is NOT from SWR fetch failure (this would show error UI, not error boundary)

**Likely Root Causes:**
1. **Next.js 15 `params` change**: `useParams()` returns `params.id` which might be `undefined` on first render (Next.js async params)
   - Fix: Await params or handle `undefined` case before using `galleryId`
2. **Data structure mismatch**: API returns `{ success, data }` but gallery detail expects `{ data: { gallery } }` — silent crash on deep access
3. **Date serialization**: `eventDate` is `DateTime` (Prisma) → rendered client-side without serialization → hydration error
4. **Cloudinary context issue**: `PhotoImage` component runs in browser context, but `cloudinary.ts` might throw during SSR render → Next.js error boundary catches it
5. **Missing dependency**: `useSWR` key depends on `currentPage` and `photosPerPage` — if these are NaN or undefined on first render, URL becomes invalid

**How to debug:**
```bash
# Check API response directly
curl -H "Cookie: your-admin-cookie" \
  https://studio.hafiportrait.photography/api/admin/galleries/cmpwzop8u0001pwfl9wsx1pzc

# Or via browser console: check Network tab for /api/admin/galleries/{id}
```

**Suggested fix approach:**
1. Add `try/catch` around the entire gallery detail component body to capture exact error
2. Verify `params.id` is valid before rendering
3. Check API response shape matches TypeScript `Gallery` interface
4. If Cloudinary involved: guard with `typeof window !== 'undefined'` or dynamic import

---

### 2. Cloudinary `usedStorage` = 0.0 KB (Persistent)

**Status**: NOT FIXED

**Symptom**: In admin Storage Accounts page, Cloudinary accounts show `0.0 KB` used while R2 accounts show correct usage.

**Likely Root Cause:** Cloudinary upload flow does NOT update `StorageAccount.usedStorage` (only R2 flow does).

**Where to look:**
- Upload complete: `src/app/api/admin/upload/complete/route.ts`
- Storage account update: `src/lib/storage/accounts.ts`
- Check if `updateMany` for Cloudinary is present alongside R2

**Suspect:** The `usedStorage` increment is only triggered for R2 uploads. Cloudinary thumbnail generation (via Worker) doesn't update `StorageAccount.usedStorage`.

---

### 3. Error Boundary "Terjadi Kesalahan" Generic Error

**Location**: `src/app/(dashboard)/admin/error.tsx`

**Purpose**: Catches any unhandled error in admin child pages. Shows generic message + "Coba Lagi" button.

**Problem**: When error boundary shows, the actual error is swallowed. Need to log the error to console/dev tools to see what actually happened:

```tsx
// In error.tsx — current code logs but error may not show
useEffect(() => {
  console.error('error.boundary.admin', { error, digest: error.digest });
}, [error]);
```

**Improvement needed:** Add Sentry/Rollbar integration or at least log to a persistent error store.

---

## 🟡 Medium Priority

### 4. Mobile Menu Scroll (Fixed in PR #162)
- **Status**: Fixed in PR #162 — verify production
- **Fix**: Changed layout to `flex` + added `stopPropagation` on menu close

### 5. Payment Proof Thumbnail Blank (Fixed in PR #162)
- **Status**: Fixed in PR #162 — uses plain `<img>` instead of `next/image` for R2/CSP compatibility
- **Verification needed**: Confirm `next/image` domain not required for R2 direct URLs

### 6. `callbackUrl` Open Redirect (Security)
- **Status**: Partially fixed but review needed
- **Path**: `src/middleware.ts:106-108`
- **Vulnerability**: `startsWith('/')` check can be bypassed with space-prefixed URL (` /evil.com`)
- **Current validation**: `trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\') && !trimmed.includes('://')`
- **Still possible**: ` ` + `/evil.com` (space before slash) or Unicode variations
- **Fix**: Add `trim()` and `URL` class parse:
  ```typescript
  const isSafe = (url: string) => {
    try {
      const u = new URL(url, 'http://localhost') // throws if absolute
      return url.startsWith('/') && !url.startsWith('//') && !url.includes('\\')
    } catch { return false }
  }
  ```

---

## 🟢 Low Priority / Enhancement

### 7. Console Usage in Client-Compatible Code
Not a bug — `cloudinary.ts` and `storage/accounts.ts` intentionally use `console.*` because they run in browser context where `logger` (needs `node:async_hooks`) is unavailable.

### 8. Prisma BigInt Serialization
Always use `serializeBigInt()` or `successResponse()` for JSON responses. Common pitfall:
```typescript
// ❌ Throws in production
return NextResponse.json({ fileSize: photo.fileSize })

// ✅ Safe
return successResponse({ fileSize: photo.fileSize })
```

---

## 📊 Debugging Playbook

### When you see "Terjadi Kesalahan"
1. Check browser Network tab → look for failed API calls
2. Check browser Console tab → look for JavaScript errors
3. Check Vercel logs (`vercel logs --limit 50`)
4. Check specific API: `curl /api/admin/galleries/{id}` with session cookie
5. Add defensive logging at component entry point
6. If Cloudinary/R2 involved: check CORS, CSP, presigned URL expiry

### When API returns 500
1. Check Vercel logs for stack trace
2. Check for Prisma errors (P2025 = not found, P2002 = unique constraint)
3. Check for unhandled BigInt serialization
4. Check for missing env variable validation

### When upload fails
1. Check presigned URL generation
2. Check direct-to-R2 CORS
3. Check upload completion triggers thumbnail queue
4. Check webhook confirmation
