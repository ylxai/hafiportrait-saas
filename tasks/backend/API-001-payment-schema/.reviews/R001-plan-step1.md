## Plan Review: Step 1: Update Prisma Schema

### Verdict: REVISE

### Summary
The plan covers the core Prisma schema additions for the `Payment` model and relations, but it misses key elements derived from the prompt's context and file scope. Specifically, it doesn't address the requirement for "unique transfer codes" or the modification of `src/app/api/public/booking/route.ts`.

### Issues Found
1. **[Severity: important]** — **Missing unique transfer code handling:** The prompt explicitly requires "support for unique transfer codes for auto-mutasi verification" and tasks you to "Ensure Event model has fields needed". You need to add a field (e.g., `uniqueCode` Int) to either the `Event` or `Payment` model to support this.
2. **[Severity: important]** — **Missing updates to `booking/route.ts`:** The `File Scope` explicitly includes `src/app/api/public/booking/route.ts`. The plan currently ignores this file. If you add a `uniqueCode` to `Event`, this file will need to generate and save it when creating a new booking. This needs to be planned for.

### Missing Items
- Adding a field for the unique transfer code in `schema.prisma`.
- Updating `src/app/api/public/booking/route.ts` to utilize the new unique code logic.

### Suggestions
- **Build Breakage Anticipation:** When you update `paymentStatus` to `dp_paid`/`fully_paid` in the TS schemas, it will break multiple UI and API files that hardcode `'paid'` or `'partial'`. You should plan to fix these references across the codebase to ensure the build passes in the Testing step.
- For the unique transfer code, a random 3-digit number (e.g., 1-999) is the standard approach. Decide whether it lives on the `Event` (applies to the whole booking) or `Payment` (applies per payment intent) and update the schema and logic accordingly.
