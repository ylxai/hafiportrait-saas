# Task: GEN-001 - Payment System Refinement (Security & Logic)

**Created:** 2026-04-17
**Size:** M

## Review Level: 2 (Plan and Code)

## Mission

Refine the payment and invoice system based on code review feedback:
1. Fix initial `paymentStatus` (set to `unpaid` instead of `awaiting_confirmation`).
2. Fix `uniqueCode` range (force 100-999).
3. Align PDF support (enable in API, restrict/align in UI).
4. Add SWR `refreshInterval` to invoice page.
5. Use `createdAt` for invoice issued date.
6. Verify `eventId` on payment proof submission (Security).

## Steps

### Step 1: Backend Logic Fixes
- [ ] Update `src/app/api/public/booking/route.ts`: status to `unpaid`, uniqueCode 100-999.
- [ ] Update `src/app/api/public/payment/presigned/route.ts`: Allow PDF.

### Step 2: Security & UI
- [ ] Update `src/app/api/public/payment/route.ts`: Verify `galleryId` vs `eventId`.
- [ ] Update `src/app/booking/invoice/[kodeBooking]/page.tsx`: SWR polling & Date display.

### Step 3: Verification
- [ ] `npm run lint` & `npm run build`.
