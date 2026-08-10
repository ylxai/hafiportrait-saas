# Vercel Build Transient Failures

## Pattern: Identical Code, Different Build Outcomes

**Session:** 2026-05-23 (PR #99 → PR #100)

### Symptom

- Commit `d5f516f` on branch `feat/rate-limiting-admin-routes`: Vercel build **TIMEOUT/FAILURE**
- Commit `69504c4` on branch `refactor/rate-limit-helper` (clean branch from merged main): Vercel build **SUCCESS**
- **Code is identical** — same helper extraction, same imports, same logic

### Root Cause

**Transient Vercel infrastructure issue**, not code error.

Evidence:
1. ✅ Local TypeScript compilation passed (both commits)
2. ✅ ESLint passed (both commits)
3. ✅ No syntax errors in any file
4. ✅ No circular dependencies detected
5. ❌ Build timeout on first attempt (stuck at "Creating an optimized production build...")
6. ✅ Build success on second attempt with identical code

### Resolution Strategy

**When Vercel build fails but local checks pass:**

1. **Verify local build tools first:**
   ```bash
   npm run lint          # Should pass
   npx tsc --noEmit      # Check for TypeScript errors (ignore node_modules pre-existing issues)
   ```

2. **If local checks pass, suspect transient Vercel issue:**
   - Rollback to last known-good commit
   - Merge PR with working code
   - Create new PR from clean branch off merged main
   - Apply identical changes
   - Push and verify Vercel build

3. **DO NOT:**
   - Assume code is broken
   - Make random "fixes" to appease Vercel
   - Abandon working refactors due to build timeouts
   - Block merges indefinitely waiting for transient issues to resolve

### User Preference: Merge Working Code First

**Pattern from this session:**
1. PR #99 had 3 commits: `de57585`, `d1ea7b9`, `5b49162`
2. Commit `5b49162` verified working (Vercel SUCCESS)
3. Attempted refactor in commit `d5f516f` → Vercel TIMEOUT
4. **User decision:** Rollback to `5b49162`, merge PR #99 immediately
5. Create separate PR #100 with identical refactor from clean branch
6. PR #100 commit `69504c4` → Vercel SUCCESS

**Lesson:** Don't let transient build failures block merging verified working code. Separate concerns: merge functionality first, retry refactor in clean PR.

### Diagnostic Commands

```bash
# Check if code has syntax errors
node --check src/lib/rate-limit-helper.ts

# Check for circular dependencies (if madge installed)
npx madge --circular src/lib/rate-limit-helper.ts

# Verify imports resolve
node -e "require('./src/lib/rate-limit-helper.ts')"  # Will fail on TS, but shows import errors

# Check TypeScript on specific files
npx tsc --noEmit src/lib/rate-limit-helper.ts src/app/api/admin/analytics/route.ts
```

### When to Suspect Transient vs. Real Issue

**Transient (retry on clean branch):**
- ✅ Local lint/typecheck passes
- ✅ No syntax errors
- ✅ Previous commit on same branch built successfully
- ✅ Build timeout (not explicit error message)
- ✅ No recent dependency changes

**Real issue (fix code):**
- ❌ Local lint/typecheck fails
- ❌ Syntax errors in files
- ❌ Import errors (module not found)
- ❌ Explicit build error message (not timeout)
- ❌ Recent dependency version changes

### Vercel Build Timeout Thresholds

- **Free tier:** ~10 minutes
- **Pro tier:** ~45 minutes
- **Enterprise:** Configurable

If build consistently times out across multiple attempts with identical code, check:
1. Build cache corruption (clear via Vercel dashboard)
2. Dependency resolution issues (check package-lock.json)
3. Memory limits (large projects may need Pro tier)

### Related Patterns

- See `references/bot-review-comprehensive-fix.md` for the full PR #99 → PR #100 workflow
- See main SKILL.md Section 7 for bot review handling after merge
