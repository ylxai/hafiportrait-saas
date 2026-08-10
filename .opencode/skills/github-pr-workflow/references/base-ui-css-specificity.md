# @base-ui/react/input CSS Specificity Issue

## Problem

`@base-ui/react/input` ships internal CSS that overrides Tailwind utility classes,
including `!important` variants. Discovered during mobile audit of hafiportrait-saas
booking form (PR #154, 2026-05-30).

**Symptom:** Input renders at 15px height despite `className="h-11"` or `className="!h-11"`.

```typescript
// Verified via getComputedStyle in browser:
// className="h-11"  → height: 15px  ← OVERRIDDEN
// className="!h-11" → height: 15px  ← STILL OVERRIDDEN
// style={{ height: '44px' }} → height: 44px  ← WORKS
```

## Root Cause

base-ui components apply their own CSS with higher specificity than Tailwind
utility classes. The `!important` Tailwind modifier (`!h-11`) is also insufficient
because base-ui's internal styles use specificity rules that win even over `!important`
in some cascade contexts.

## Fix

Use inline `style` prop to force the desired height — inline styles always win
the CSS cascade:

```tsx
// ❌ Does NOT work
<Input className="h-11" />
<Input className="!h-11" />
<Input className="h-11 py-2" />

// ✅ Works
<Input style={{ height: '44px' }} />
```

## WCAG Touch Target Pattern for base-ui Inputs

When you need 44px touch targets (WCAG 2.5.5) on `@base-ui/react/input`:

```tsx
// In booking/form pages — apply per-input, don't change global Input default
<Input
  id="nama"
  type="text"
  style={{ height: '44px' }}
  // ... other props
/>
```

Keep the global `Input` component default at `h-9` to avoid regressions
across the rest of the app. Only override per-instance where WCAG requires it.

## Verified Results (hafiportrait-saas booking form)

After applying `style={{ height: '44px' }}`:
- text inputs: 50px ✅ (browser adds padding on top of 44px)
- email/password/tel: 50px ✅
- date input: 48px ✅
- textarea (raw HTML): 51px ✅ (not affected by base-ui)

All exceed the 44px WCAG 2.5.5 minimum.

## Note on `{ cause: error }` in Error constructor

TypeScript config in hafiportrait-saas does NOT support `new Error(msg, { cause })`.
Results in `TS2554: Expected 0-1 arguments, but got 2`.
Workaround: embed original error message in the new Error's message string:
```typescript
throw new Error(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
```
Do NOT add `lib: ['ES2022']` to tsconfig just for this — it changes other behavior.
