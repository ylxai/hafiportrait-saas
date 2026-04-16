# UI Conventions — Aura Noir Theme

## Design System
**Aura Noir** — OLED Luxury dark theme. Dominant dark, luxurious, OLED-friendly.

## Color Usage (Tailwind v4 OKLCH Semantic)
```tsx
// Backgrounds
bg-background        // Main page background (near-black)
bg-card              // Card/panel background
bg-card-hover        // Card hover state

// Text
text-foreground      // Primary text
text-muted-foreground // Secondary/muted text

// Actions
bg-primary           // Primary button/action
text-primary-foreground
hover:bg-primary/90

// Borders
border-border        // Standard border
```

**JANGAN gunakan:**
- Static colors: `amber-500`, `gray-800`, `white` (kecuali dalam konteks yang tepat)
- `rgba(var(--primary))` syntax di Tailwind v4 shadows
- Light-mode static colors untuk Aura Noir theme

## Component Library
- **Dialog**: `import { Dialog } from '@/components/ui/dialog'` — menggunakan `@base-ui/react` (BUKAN Radix)
- **Toast**: `import { toast } from 'sonner'` — BUKAN `alert()`
- **Loading**: `import { LoadingSpinner, PageLoader } from '@/components/ui/loading'`
- **Empty State**: `import { EmptyState } from '@/components/ui/empty-state'`
- **Pagination**: `import { Pagination } from '@/components/ui/pagination'`

## Native Input Styling
```tsx
// Native inputs WAJIB explicit styling:
<input className="border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground" />
```

## Icons
- Gunakan **Lucide React** — konsisten, tidak pakai emoji sebagai icon UI
- Fixed viewBox 24x24 dengan `w-5 h-5` atau `w-6 h-6`

## Interaction
- Semua clickable elements: `cursor-pointer`
- Hover transitions: `transition-colors duration-200`
- Jangan gunakan scale transforms yang shift layout

## Notifications
```typescript
import { toast } from 'sonner'
toast.success('Berhasil disimpan')
toast.error('Gagal menyimpan')
// JANGAN: alert('message')
```
