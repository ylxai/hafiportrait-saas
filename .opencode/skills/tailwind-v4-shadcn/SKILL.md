---
name: tailwind-v4-shadcn
description: Tailwind v4 and shadcn/ui styling conventions
license: MIT
compatibility: opencode
---

# Tailwind v4 + shadcn/ui

## Theme: Aura Noir (OLED Dark)

### Allowed Colors (OKLCH Semantics)
```css
/* Backgrounds */
bg-background    /* Main background */
bg-card         /* Card background */
bg-card-hover   /* Card hover */

/* Text */
text-foreground     /* Primary text */
text-muted-foreground /* Secondary text */

/* Actions */
bg-primary         /* Primary buttons */
text-primary-foreground

/* Borders */
border-border
```

### NEVER Use
- Static colors: amber-500, gray-800, red-400
- rgba(var(--primary)) syntax
- Light mode colors

### Components
- Import from @/components/ui/*
- Dialog uses @base-ui/react (NOT Radix)
- Use sonner for toasts (NOT alert())

### Example
```tsx
<div className="bg-background text-foreground border border-border rounded-lg p-4">
  <h1 className="text-2xl font-bold">Title</h1>
  <button className="bg-primary text-primary-foreground hover:bg-primary/90">
    Click me
  </button>
</div>
```