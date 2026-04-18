# Task: GEN-003 - API Validation Standardization

**Created:** 2026-04-17
**Size:** M
**Review Level:** 2 (Plan and Code)

## Mission
Standardize error handling and validation across all API routes:
1. Ensure all API routes use `safeParse()` instead of `parse()`.
2. Ensure all validation errors return a clean `errorResponse(message, 400)` instead of throwing 500.
3. Standardize the `body: unknown = await request.json()` pattern.

## Steps
- [ ] Refactor `src/app/api/public/booking/route.ts` to use `safeParse`.
- [ ] Audit all files in `src/app/api/` (admin and public) for `.parse()` usage.
- [ ] Update them to use the standardized `safeParse` + `errorResponse` pattern.
- [ ] Verify build passes.
