# Task: API-001 - Database Schema Update for Payment System

**Created:** 2026-04-17
**Size:** S

## Review Level: 1 (Plan Only)

**Assessment:** Adding a new `Payment` table and modifying `Event` enum. Modifies data model which is hard to reverse.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 2

## Canonical Task Folder

```
tasks/backend/API-001-payment-schema/
├── PROMPT.md   ← This file (immutable above --- divider)
├── STATUS.md   ← Execution state (worker updates this)
├── .reviews/   ← Reviewer output (created by the orchestrator runtime)
└── .DONE       ← Created when complete
```

## Mission

Add the `Payment` model to Prisma schema and update the `Event` model's paymentStatus enums. This is the foundation for the new manual transfer and DP (down payment) system, including support for unique transfer codes for auto-mutasi verification.

## Dependencies

- **None**

## Context to Read First

**Tier 2 (area context):**
- `tasks/backend/CONTEXT.md`

## Environment

- **Workspace:** `prisma/schema.prisma`
- **Services required:** PostgreSQL

## File Scope

- `prisma/schema.prisma`
- `src/app/api/public/booking/route.ts`

## Steps

### Step 0: Preflight

- [ ] Required files and paths exist
- [ ] Dependencies satisfied

### Step 1: Update Prisma Schema

- [ ] Add `Payment` model with fields: id, eventId, amount, type ("dp"|"full"), method, proofUrl, status ("pending"|"approved"|"rejected"), createdAt, updatedAt.
- [ ] Ensure `Event` relation to `Payment` exists (`payments Payment[]`).
- [ ] Ensure `paymentStatus` enum/default in `Event` can accommodate: `unpaid`, `awaiting_confirmation`, `dp_paid`, `fully_paid`.
- [ ] (Optional) Ensure Event model has fields needed or if Payment table handles it all.

### Step 2: Update Database

- [ ] Run `npm run db:generate` to generate new Prisma client.
- [ ] Run `npm run db:push` to apply schema changes to database.

### Step 3: Testing & Verification

- [ ] Run FULL test suite: `npm run lint` and `npm run build`
- [ ] Fix all failures
- [ ] Build passes

### Step 4: Documentation & Delivery

- [ ] "Must Update" docs modified
- [ ] "Check If Affected" docs reviewed
- [ ] Discoveries logged in STATUS.md

## Documentation Requirements

**Must Update:**
- None

## Completion Criteria

- [ ] All steps complete
- [ ] All tests passing
- [ ] Schema successfully pushed to db

## Git Commit Convention

- **Step completion:** `feat(API-001): complete Step N — description`
- **Bug fixes:** `fix(API-001): description`
- **Tests:** `test(API-001): description`
- **Hydration:** `hydrate: API-001 expand Step N checkboxes`

## Do NOT

- Expand task scope — add tech debt to CONTEXT.md instead
- Skip tests
- Modify framework/standards docs without explicit user approval
- Commit without the task ID prefix in the commit message
