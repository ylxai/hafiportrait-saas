# Storage & CDN Improvement Tasks

## Overview

| Component | Status |
|-----------|--------|
| R2 (Original Files) | ✅ Good - Direct upload via presigned URL |
| Cloudinary (Thumbnails) | ⚠️ Need quality fix |
| Multi-tenant | ✅ Good - StorageAccount table |

---

## Phase 1: Fix Thumbnail Quality (Immediate)

### 1.1 Update getCloudinaryThumbnailUrl
**File:** `src/lib/cloudinary.ts`

```typescript
// Change from:
quality: 'auto'

// To:
quality: 'auto:good'  // Higher quality (~75-85%)
```

### 1.2 Update getCloudinaryLightboxUrl
**File:** `src/lib/cloudinary.ts`

```typescript
// Change from:
quality: 'auto'

// To:
quality: 'auto:good'  // Higher quality for lightbox display
```

### 1.3 Fix LazyImage Cloudinary URL Optimization
**File:** `src/components/ui/lazy-image.tsx`

**Current Problem:** Regex only handles `/upload/` path, not `/image/fetch/`

```typescript
// Update getOptimizedSrc function:
const getOptimizedSrc = (url: string) => {
  if (!url || !url.includes('cloudinary.com')) return url;
  if (url.includes('f_auto')) return url;

  if (url.includes('/image/fetch/')) {
    return url.replace(/\/image\/fetch\//, '/image/fetch/f_auto,q_auto/');
  }
  return url.replace(/\/upload\/(v\d+\/)?/, '/upload/f_auto,q_auto/$1');
};
```

### 1.4 Add sizes Prop to PhotoImage
**File:** `src/components/photo/PhotoImage.tsx`

Add proper responsive sizes attribute for better loading performance.

---

## Phase 2: Multi-tenant Storage Optimization

### 2.1 Verify StorageQuota Enforcement
- Check upload flow for quota validation
- Ensure `Client.storageQuotaGB` is enforced

### 2.2 Add Storage Usage Dashboard
- Create admin page to view per-client storage usage
- Show: used GB, photo count, quota limit

### 2.3 Monitor StorageAccount Usage
- `StorageAccount.usedStorage` field already exists
- Ensure it's updated on upload/delete

---

## Phase 3: Performance Improvements

### 3.1 R2 Caching Headers
- Check Cloudflare cache rules
- Add appropriate Cache-Control headers

### 3.2 Blur Placeholder (LQIP)
- Generate low-quality image placeholders
- Show while main image loads

### 3.3 CDN Failover
- If Cloudinary fails, fallback to R2
- Already partially implemented in PhotoImage

---

## Phase 4: Future Considerations

### 4.1 AI Features (Optional)
Consider Cloudinary GenAI features:
- Background removal (`e_background_removal`)
- Generative fill (`b_gen_fill`)
- Generative replace
- Background replace

**Cost:** Uses credits from Cloudinary plan

### 4.2 Alternative: Sufy Migration
If considering Sufy as alternative:
- Pros: All-in-one (Storage + CDN + AI Avatar)
- Cons: Lose Cloudinary GenAI, egress fees

### 4.3 Cost Monitoring
- Track monthly spend per client
- Alert when approaching quota

---

## Implementation Priority

| Priority | Task | Effort |
|----------|------|--------|
| 🔴 P1 | Fix thumbnail quality (`auto:good`) | 10 min |
| 🔴 P1 | Fix LazyImage URL regex | 15 min |
| 🟡 P2 | Add PhotoImage sizes prop | 10 min |
| 🟡 P2 | Verify storage quota enforcement | 30 min |
| 🟢 P3 | Add storage dashboard | 2 hours |
| 🟢 P3 | LQIP blur placeholder | 1 hour |

---

## Quick Commands

```bash
# Test Cloudinary thumbnail
npm run dev
# Visit gallery page, inspect network tab

# Check storage usage
# In admin dashboard or via API
```

---

## Notes

- Current setup: R2 (original) + Cloudinary (thumbnails) is optimal
- Main issue: `quality: 'auto'` is too aggressive
- Solution: Use `quality: 'auto:good'` for better quality
- Multi-tenant already handled via StorageAccount table