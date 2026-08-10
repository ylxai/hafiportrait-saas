# Vercel Deployment Failure Isolation

When a PR's Vercel deployment fails with cryptic build errors, **isolate whether the PR is the cause** before spending time debugging the PR code.

## Pattern: Check Main Branch First

**Symptom:** PR Vercel deployment fails with webpack/build error that's not obviously related to your changes.

**Before debugging your PR code:**

```bash
# 1. Save current work
git stash  # or commit if you prefer

# 2. Switch to main branch
git checkout main
git pull origin main

# 3. Try building main branch
npm run build

# 4. Check result
# - If main ALSO fails with same error → pre-existing bug, not your PR
# - If main builds successfully → your PR introduced the issue
```

## Why This Matters

**Saves time:** Don't waste hours debugging code that was already broken.

**Correct attribution:** Proves your PR is innocent when main is already broken.

**Proper fix scope:** Pre-existing bugs should be fixed in separate PR, not bundled with your feature/fix.

## Example from PR #121 (2026-05-25)

**Context:** PR #121 changed provider ID constants in auth code. Vercel deployment failed with:

```
TypeError: Cannot read properties of undefined (reading 'length')
at WasmHash._updateWithBuffer
```

Then after cache clear:

```
UnhandledSchemeError: Reading from "node:async_hooks" is not handled
Import trace: node:async_hooks → request-context.ts → logger.ts → global-error.tsx
```

**Investigation:**
1. Checked PR branch build: ❌ Failed
2. Switched to main branch
3. Checked main branch build: ❌ **Also failed with identical error**

**Conclusion:**
- ✅ PR #121 changes were innocent
- ✅ Main branch already broken before PR
- ✅ Root cause: `global-error.tsx` (client component) importing Node.js built-in via logger chain
- ✅ Separate fix needed, not related to provider ID changes

## When to Use This Pattern

**Always check main when:**
- Vercel deployment fails with webpack/bundling errors
- Error message doesn't obviously relate to your code changes
- Error involves build tooling (webpack, Next.js, bundler)
- Error is cryptic or involves internal tooling code

**Skip this check when:**
- Error clearly points to code you changed (e.g., TypeScript error in file you edited)
- Linter/test failure on code you wrote
- Obvious syntax error in your changes

## Response Strategy

**If main is broken:**
1. Report findings to user with evidence (both branches fail)
2. Offer options:
   - Option A: Fix the pre-existing bug in this PR (scope creep but unblocks)
   - Option B: Fix in separate PR first (cleaner but delays)
   - Option C: Merge PR as-is (not recommended - deployment still fails)
3. Get user decision before proceeding

**If main is clean:**
1. Your PR introduced the issue
2. Debug and fix in your PR
3. No need to involve user in decision - just fix it

## Fix: Node.js Built-ins in Client Components

When the root cause is a client component importing Node.js built-ins via a chain (e.g. `logger → request-context → node:async_hooks`), the fix is:

1. **Find all affected client components:**
   ```bash
   find src/app -name "error.tsx" -o -name "global-error.tsx" | xargs grep -l "from '@/lib/logger'"
   ```
2. **Remove the server-only import** from each file
3. **Replace with `console.error`** — preserve the event name string for log filtering:
   ```typescript
   // Before
   logger.error('error.boundary.global', { error, digest: error.digest });
   // After
   console.error('error.boundary.global', { error, digest: error.digest });
   ```
4. **Add a comment** explaining why console.error is used (prevents future re-introduction):
   ```typescript
   // Using console.error instead of structured logger because logger depends on
   // node:async_hooks which cannot be imported in client components.
   ```

**Note:** This pattern applies to ALL error boundary files (`error.tsx`, `global-error.tsx`) — they are all `'use client'` by Next.js requirement. Check all of them, not just the one in the error trace.

## Common Pre-Existing Issues

**Next.js client/server boundary violations:**
- Client components importing Node.js built-ins
- Server-only code imported in client components
- Manifests as webpack `UnhandledSchemeError` or module resolution errors

**Circular dependencies:**
- Manifests as webpack hash errors or undefined module errors
- Often hidden by cache, appears after `rm -rf .next`

**Missing environment variables:**
- Build-time env vars not set in Vercel
- Manifests as undefined reference errors during build

## Related Patterns

- See `nextjs-expert` skill for Next.js-specific client/server debugging
- See `references/vercel-build-transient-failures.md` for transient timeout issues
- See `references/ci-troubleshooting.md` for general CI debugging
