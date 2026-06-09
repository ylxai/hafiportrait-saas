# Mobile UI/UX Audit — PhotoStudio SaaS (2026-06-07)

> Tested on 390x844 viewport (iPhone 14 Pro) via Kernel browser automation.

---

## 🔴 Critical — Must Fix

### 1. Touch Targets Too Small (All Admin Pages)
Minimum recommended: **44x44px** (Apple HIG / Material Design). Current buttons:

| Element | Size | Page | Issue |
|---------|------|------|-------|
| Kelola | 158×32px | Galleries | Height 12px too short |
| Upload Foto | 316×36px | Gallery Detail | Height 8px too short |
| 🔗 Link Galeri | 170×38px | Gallery Detail | Height 6px too short |
| 📋 Seleksi Client | 172×38px | Gallery Detail | Height 6px too short |
| Save Settings | 131×40px | Gallery Detail | Height 4px too short |
| Buat Gallery | 58×36px | Galleries | Both dimensions too small |
| Semua / Menunggu / Disetujui / Ditolak | ~86×32px | Payments | Height 12px too short |
| Refresh | 95×34px | Payments | Height 10px too short |
| View all (x2) | 66×20px | Dashboard | Height 24px too short |

**Impact:** Users with larger fingers will struggle to tap accurately. WCAG 2.1 AA requires 44×44px minimum.

**Fix:** Increase padding to ensure minimum 44px height on all `button`, `a.btn`, and interactive elements.

---

## 🟡 High Priority

### 2. Payment Filter Buttons Wrap to 2 Rows
"Refresh" button sits alone on row 1 (y=106), while "Semua/Menunggu/Disetujui/Ditolak" wrap to row 2 (y=178). This wastes vertical space and confuses layout hierarchy.

**Fix:** Use horizontal scrollable filter pills or collapse filters into a dropdown on mobile.

### 3. Text Overlap in Gallery Detail Header
Gallery title and event kodeBooking text overlap:
- "Test Prod 131849•EV-MPS4JJ8U-2C4D" — bullet separator and event code crash into each other

**Fix:** Add `truncate` or `whitespace-nowrap overflow-hidden text-ellipsis` to title, or stack vertically on small screens.

### 4. Table/Card Layout Consistency
Payments page uses card layout (good for mobile ✅), but some data elements still have text wrapping/overflow issues.

---

## 🟢 Improvement Suggestions

### 5. Font Size
5-6 elements per page have font-size < 12px. Consider minimum 12px for readability (WCAG SC 1.4.4).

### 6. Input Fields Height
Input fields are 42px (close to 44px). Minor bump needed.

### 7. Hidden 1×1px Checkbox
A checkbox or hidden input registers at 1×1px in galleries page — needs `sr-only` class or proper sizing.

---

## ✅ Already Good

| Aspect | Status |
|--------|--------|
| No horizontal scroll | ✅ All pages fit 390px width |
| Sidebar collapses on mobile | ✅ Proper responsive behavior |
| Gallery list fits 1 screen | ✅ No excessive scrolling |
| No broken images | ✅ All images load |
| No console errors | ✅ Clean |
| Public gallery page | ✅ Clean layout |
| Booking page | ✅ Clean layout, 10 interactive elements |
| Card layout (not table) on mobile | ✅ Good for payments page |

---

## Priority Action Items

1. **Increase button height to 44px** — global CSS fix for all `button`, `a`, interactive elements
2. **Fix filter bar wrapping** on payments page
3. **Fix text overlap** in gallery detail header
4. **Remove 1×1px hidden input** or apply proper hidden class
5. **Minimum 12px font size** enforcement
