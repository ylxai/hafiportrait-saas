# Task: UI-001 - Public Invoice Page & Payment Upload

**Created:** 2026-04-17
**Size:** M

## Review Level: 2 (Plan and Code)

**Assessment:** Creates new UI for payments, touches file upload (security), requires plan and code review.
**Score:** 4/8 — Blast radius: 1, Pattern novelty: 1, Security: 1, Reversibility: 1

## Canonical Task Folder

```
tasks/frontend/UI-001-public-invoice/
├── PROMPT.md   ← This file (immutable above --- divider)
├── STATUS.md   ← Execution state (worker updates this)
├── .reviews/   ← Reviewer output (created by the orchestrator runtime)
└── .DONE       ← Created when complete
```

## Mission

Create the public invoice page (`/booking/invoice/[kodeBooking]`) that displays the event summary, billings, payment instructions (bank details + unique code calculation), and an upload form for the payment proof. Also, modify the booking form submission to redirect to this new invoice page instead of showing the simple success message.

## Dependencies

- **Task:** API-001 (Database Schema Update for Payment System)

## Context to Read First

**Tier 2 (area context):**
- `tasks/frontend/CONTEXT.md`

## Environment

- **Workspace:** `src/app/booking/` and `src/components/ui/`
- **Services required:** None (uses standard Next.js components)

## File Scope

- `src/app/booking/page.tsx`
- `src/app/booking/invoice/[kodeBooking]/page.tsx`
- `src/app/api/public/booking/[kodeBooking]/route.ts`
- `src/app/api/public/payment/route.ts` (new)

## Steps

### Step 0: Preflight

- [ ] Required files and paths exist
- [ ] Dependencies satisfied (API-001 complete)

### Step 1: Booking Redirect

- [ ] Update `src/app/booking/page.tsx`: On successful submission, redirect to `/booking/invoice/${kodeBooking}` instead of showing the inline success message.

### Step 2: GET Booking Data API

- [ ] Create `src/app/api/public/booking/[kodeBooking]/route.ts` to fetch Event details (with relations to Package, Client, Payments) securely without authentication (since it's a public link based on kodeBooking).

### Step 3: Invoice Page UI

- [ ] Create `src/app/booking/invoice/[kodeBooking]/page.tsx`
- [ ] Display Status (UNPAID/DP_PAID/FULLY_PAID), Client info, and Event summary.
- [ ] Display payment instructions and options (DP or FULL) with dynamically added 3-digit unique code (e.g. `totalPrice + uniqueCode`).
- [ ] Create an upload button for "Upload Bukti Transfer" that updates the `Payment` table (and changes event status to `awaiting_confirmation`).
- [ ] (Optional for this task) Add a "Print" button that triggers `window.print()`.

### Step 4: Testing & Verification

- [ ] Run FULL test suite: `npm run lint` and `npm run build`
- [ ] Fix all failures
- [ ] Build passes

### Step 5: Documentation & Delivery

- [ ] "Must Update" docs modified
- [ ] "Check If Affected" docs reviewed
- [ ] Discoveries logged in STATUS.md

## Documentation Requirements

**Must Update:**
- None

## Completion Criteria

- [ ] All steps complete
- [ ] All tests passing

## Git Commit Convention

- **Step completion:** `feat(UI-001): complete Step N — description`
- **Bug fixes:** `fix(UI-001): description`
- **Tests:** `test(UI-001): description`
- **Hydration:** `hydrate: UI-001 expand Step N checkboxes`

## Do NOT

- Expand task scope — add tech debt to CONTEXT.md instead
- Skip tests
- Modify framework/standards docs without explicit user approval
- Commit without the task ID prefix in the commit message
