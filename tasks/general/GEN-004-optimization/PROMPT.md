# Task: GEN-004 - Database & UI Optimization

**Created:** 2026-04-17
**Size:** M
**Review Level:** 2 (Plan and Code)

## Mission
Optimize performance and improve global UI consistency:
1. Add missing indexes to `prisma/schema.prisma` for `Payment` and `Event` models.
2. Create a centralized `formatDate` helper in `src/lib/utils.ts`.
3. Update all UI components to use the new `formatDate` helper.
4. Enhance `useDirectUpload` hook to provide feedback during retries.

## Steps
- [ ] Add `@@index` to `Payment` and `Event` in `schema.prisma`.
- [ ] Run `prisma generate` & `prisma db push`.
- [ ] Implement `formatDate` in `src/lib/utils.ts`.
- [ ] Replace scattered `toLocaleDateString` calls with `formatDate`.
- [ ] Update `useDirectUpload` with `retryCount` and `isRetrying` state.
