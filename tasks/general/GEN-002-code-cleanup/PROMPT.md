# Task: GEN-002 - Code Clean-up & Type Safety

**Created:** 2026-04-17
**Size:** M
**Review Level:** 2 (Plan and Code)

## Mission
Clean up the codebase to improve maintainability and type safety:
1. Replace non-essential `any` types with `unknown` or specific interfaces in `src/lib`, `src/hooks`, and `src/app`.
2. Remove production-unfriendly `console.log` statements, especially in storage and upload logic.
3. Replace them with a new lightweight logging helper in `src/lib/logger.ts` that can be toggled based on environment.

## Steps
- [ ] Create `src/lib/logger.ts` with `info`, `warn`, `error` methods.
- [ ] Scan and replace `any` in `src/` (excluding `generated/`).
- [ ] Scan and replace `console.log` with `logger.info` or remove them.
- [ ] Run `npm run lint`.
