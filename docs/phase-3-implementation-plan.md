# Phase 3: Performance Improvements - Implementation Plan

## Overview

Phase 3 focuses on optimizing image loading performance through caching and placeholders.

---

## 3.1 R2 Caching Headers

### Current Status
R2 files are served with default cache headers.

### Goal
Add appropriate Cache-Control headers for optimal CDN caching.

### Implementation

**Option 1: Cloudflare Cache Rules (Recommended)**
- Configure via Cloudflare Dashboard
- No code changes needed
- Rules:
  - Cache images for 1 year: `Cache-Control: public, max-age=31536000, immutable`
  - Cache HTML for 1 hour: `Cache-Control: public, max-age=3600`

**Option 2: R2 Custom Metadata**
- Set cache headers when uploading to R2
- File: `src/lib/upload/presigned.ts`
- Add `cacheControl` metadata to presigned URL

**Recommendation:** Use Cloudflare Cache Rules (easier, no code changes)

---

## 3.2 Blur Placeholder (LQIP)

### Current Status
Images show skeleton loader while loading.

### Goal
Show low-quality image placeholder (LQIP) for better perceived performance.

### Implementation Options

#### Option A: Cloudinary Blur Transformation
**Pros:**
- No additional storage
- Generated on-the-fly
- Easy to implement

**Implementation:**
```typescript
// Generate blur placeholder URL
const blurUrl = getCloudinaryThumbnailUrl(r2Url, {
  width: 20,
  quality: 10,
  effect: 'blur:1000',
});

// Use in Image component
<Image
  src={thumbnailUrl}
  placeholder="blur"
  blurDataURL={blurUrl}
/>
```

#### Option B: Generate Base64 Placeholder
**Pros:**
- Inline in HTML (no extra request)
- Fastest initial render

**Cons:**
- Requires image processing
- Larger HTML payload

**Implementation:**
1. Generate tiny thumbnail (20x20px)
2. Convert to base64
3. Store in database
4. Use as `blurDataURL`

#### Option C: Blurhash
**Pros:**
- Very small payload (~30 bytes)
- Beautiful blur effect

**Cons:**
- Requires library (`blurhash`)
- Need to generate hash on upload

**Recommendation:** Start with Option A (Cloudinary blur) - easiest to implement

---

## 3.3 CDN Failover

### Current Status
✅ Already implemented in `PhotoImage.tsx`

**Implementation:**
```typescript
const [useFallback, setUseFallback] = useState(false);

onError={() => {
  if (!useFallback) {
    setUseFallback(true); // Fallback to R2
  }
}}
```

**Status:** ✅ COMPLETE - No changes needed

---

## Implementation Priority

| Task | Priority | Effort | Impact |
|------|----------|--------|--------|
| 3.1 R2 Caching (Cloudflare Rules) | 🟢 Low | 10 min | High |
| 3.2 LQIP (Cloudinary blur) | 🟡 Medium | 30 min | Medium |
| 3.3 CDN Failover | ✅ Done | - | - |

---

## Quick Wins

### 1. Cloudflare Cache Rules (10 minutes)
1. Go to Cloudflare Dashboard
2. Navigate to Caching > Cache Rules
3. Add rule for R2 bucket:
   - Match: `*.r2.cloudflarestorage.com/*`
   - Cache TTL: 1 year
   - Browser TTL: 1 year

### 2. Cloudinary Blur Placeholder (30 minutes)
1. Update `PhotoImage.tsx`
2. Generate blur URL with Cloudinary
3. Add `placeholder="blur"` to Image component
4. Test loading experience

---

## Next Steps

**Recommended:**
1. ✅ Merge PR #58 (Phase 2)
2. 🟢 Implement 3.1 via Cloudflare Dashboard (no code)
3. 🟡 Implement 3.2 LQIP in separate PR
4. 📝 Update storage-improvement-tasks.md

**Or:**
- Skip Phase 3 for now (low priority)
- Focus on other features
- Revisit when performance becomes an issue

---

## Performance Metrics to Track

After implementing Phase 3:
- Time to First Byte (TTFB)
- Largest Contentful Paint (LCP)
- Cumulative Layout Shift (CLS)
- Image load time
- Cache hit rate

Use Vercel Analytics or Cloudflare Analytics to monitor.
