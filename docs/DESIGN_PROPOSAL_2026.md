# PhotoStudio SaaS - Redesign Proposal 2026 (Mobile-First)

## 1. Overview
This proposal outlines three distinct UI/UX directions for the 2026 redesign of PhotoStudio SaaS. All directions prioritize mobile users, high performance (Next.js 15+), and modern design tokens using Tailwind v4 and OKLCH color spaces.

---

## 2. Design Directions

### Direction A: Aura Noir (The OLED Luxury) 🌑
*Focused on high-end professionals and premium cinematic presentation.*

- **Vibe:** Premium, Exclusive, Cinematic.
- **Visual Language:**
    - Deep black backgrounds (`oklch(10% 0 0)`) for OLED power saving and depth.
    - Glassmorphism with ultra-thin glowing borders.
    - Modern serif headings (e.g., *Playfair Display*) with sharp sans-serif body text.
- **Color Palette (OKLCH Tokens):**
    - `--color-background`: `oklch(10% 0 0)`
    - `--color-foreground`: `oklch(95% 0.01 45)`
    - `--color-primary`: `oklch(70% 0.15 45)` (Glowing Amber)
    - `--color-surface`: `oklch(18% 0.02 45)` (Muted Charcoal)

### Direction B: Soft Tech (The Human-Centric) ☁️
*Focused on usability, accessibility, and mental clarity.*

- **Vibe:** Trusted, Clean, Minimalist.
- **Visual Language:**
    - Muted pastel backgrounds with airy whitespace.
    - Borderless cards with expansive, soft shadows.
    - Friendly, rounded iconography and typography (e.g., *Inter Soft*).
- **Color Palette (OKLCH Tokens):**
    - `--color-background`: `oklch(98% 0.01 240)` (Airy Blue-White)
    - `--color-foreground`: `oklch(25% 0.04 240)` (Soft Navy)
    - `--color-primary`: `oklch(65% 0.12 210)` (Soft Sky)
    - `--color-surface`: `oklch(100% 0 0)` (Pure White)

### Direction C: Bento Pulse (The Dynamic Power) 🟦
*Focused on high-speed management and energetic interactions.*

- **Vibe:** Productive, Fast, Modern.
- **Visual Language:**
    - Modular Bento-style grid that adapts to vertical mobile scrolling.
    - High-energy accent colors and spring-based animations.
    - Bold, condensed typography for data density (e.g., *Arimo*).
- **Color Palette (OKLCH Tokens):**
    - `--color-background`: `oklch(94% 0.02 280)` (Cool Grey)
    - `--color-foreground`: `oklch(15% 0.05 280)` (Dark Indigo)
    - `--color-primary`: `oklch(60% 0.25 330)` (Electric Magenta)
    - `--color-surface`: `oklch(100% 0 0)` (White Card)

---

## 3. Mobile-First UX Strategy

### Thumb-Driven Navigation
- **Action Zone:** Move all critical CTAs (Create Event, Upload, Save) to the bottom 30% of the screen.
- **Bottom Sheets:** Use `@base-ui/react` Bottom Sheets for all form inputs and filters on mobile.
- **Tab Bar:** A floating, pill-shaped navigation bar that minimizes on scroll.

### Gesture Patterns
- **Swipe Actions:**
    - Swipe left on an event card to Archive/Delete.
    - Swipe right to mark as Completed.
- **Haptic Feedback:** Subtle vibrations on successful photo selection or status changes.
- **Pinch-to-Inspect:** Native feeling pinch-to-zoom on gallery thumbnails without full-screen lightbox transition.

### Core Page Specifics
- **Dashboard:** Priority "Stories" style widgets for recent activity and alerts.
- **Events List:** Timeline-based view with scroll-snapping for key dates.
- **Gallery:** "Waterfall" layout with adaptive column widths based on device orientation.

---

## 4. Technical Implementation (Tailwind v4)
- Leverage `@theme` blocks for OKLCH variable definitions.
- Use `container-queries` for adaptive Bento Grid modules.
- Implementation of `motion` (Framer Motion) for gesture-driven transitions.
