# PhotoStudio SaaS — UI Conventions & Style Guide

> How to style, which colors to use, and what NOT to do.

---

## 1. Color System: Aura Noir (OKLCH Semantic)

**NEVER use static color names** (`amber-500`, `gray-800`, `slate-300`).

All colors are semantic Tailwind v4 OKLCH tokens:

```css
/* From globals.css / @theme inline */
--color-background:         /* Main page background */
--color-foreground:          /* Main text */
--color-card:                /* Card/container background */
--color-card-hover:          /* Card hover state */
--color-muted:               /* Secondary elements */
--color-muted-foreground:    /* Secondary text */
--color-primary:             /* Primary action/button */
--color-primary-foreground:  /* Text on primary */
--color-border:              /* Borders, dividers */
--color-destructive:         /* Errors, danger actions */
```

### Usage
```tsx
// ✅ Correct
<div className="bg-background text-foreground">
  <button className="bg-primary text-primary-foreground hover:bg-primary/90">
    Submit
  </button>
  <p className="text-muted-foreground">Secondary info</p>
  <div className="border border-border rounded-lg" />
</div>

// ❌ WRONG — static colors forbidden
<div className="bg-gray-800 text-gray-200"> {/* NEVER */}
<div className="bg-amber-500"> {/* NEVER */}
<div className="text-slate-300"> {/* NEVER */}
```

### Dangerous Patterns (Invisible / Broken)
- `champagne-*`, `slate-*`, `gray-*` in Tailwind v4 → RENDER INVISIBLE (no style, no error)
- `rgba(var(--primary))` syntax → NOT supported

---

## 2. Component Conventions

### shadcn/ui
All UI components are from `src/components/ui/` (shadcn/ui v4). Import from there:
```tsx
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'  // base-ui/react, NOT Radix
```

### Input Styling
Native inputs **must** have explicit full styling:
```tsx
<input 
  className="border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground"
/>
```

### Notifications
```tsx
import { toast } from 'sonner'

toast.success('Gallery updated')
toast.error('Upload failed')
```
**NEVER use `alert()`** anywhere in the app.

---

## 3. Layout

### Admin Dashboard
- **Root layout**: `src/app/(dashboard)/admin/layout.tsx`
- **Sidebar navigation**: Admin pages grouped under `(dashboard)` layout
- **Route group `(dashboard)`**: Shared navigation, auth-guard wrapper, header/footer

### Client Portal
- **Root layout**: `src/app/portal/layout.tsx`
- **No shared dashboard UI** — simpler, client-facing

### Public Gallery
- **Dynamic route**: `/gallery/[token]/page.tsx`
- **No layout wrapper** (standalone page per gallery)

---

## 4. Client vs Server Components

### Rules
- **API routes** (`/api/*`): Always server-side (Node runtime) — use `logger`, NOT `console`
- **Dashboard pages** (`admin/*`): Mostly Client Components (`"use client"`) with `useSWR` for data fetching
- **Public pages**: Can be Server Components (SC) or Client Components (CC) | use SC where no interactivity needed

### `useSWR` Pattern (Client Components)
```tsx
"use client"

import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function Page() {
  const { data, isLoading, error, mutate } = useSWR('/api/admin/galleries', fetcher)
  
  if (isLoading) return <SkeletonLoader />
  if (error) return <ErrorRetry onRetry={mutate} />
  
  return <GalleryList data={data} />
}
```

### Effect of CSS Cascade
- `.fab` (in `globals.css`) is **unlayered CSS** → beats Tailwind `@layer utilities`
- Positioning for `.fab` must be in the CSS rule, NOT inline utilities like `bottom-4 right-4`

---

## 5. Forbidden Patterns

1. **NO `alert()`** anywhere → use `sonner toast()`
2. **NO static Tailwind colors** → semantic tokens only
3. **NO unbounded queries** → always paginate (`take`, `skip`)
4. **NO CSS selectors in tests** → `getByRole`, `getByLabel`, `getByText`, `getByTestId`
5. **NO `waitForTimeout()` in tests** → Playwright auto-wait
6. **NO magic numbers** → use constants from `@/lib/api/constants`
7. **NO `any` type** → `unknown` or specific interfaces
8. **NO direct storage credentials in `.env`** → `StorageAccount` table
