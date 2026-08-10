# Merge Conflict Resolution Patterns

Patterns for resolving merge conflicts when multiple PRs touch overlapping code.

## Session Context: 2026-05-25

Four PRs merged in sequence (security audit findings + sprint work):
- PR #120 (Finding #1): Cross-table email guards
- PR #119 (Finding #2): Case-insensitive role checks + helpers
- PR #118 (Finding #3): requireAdminAuth helper
- PR #117 (Sprint 3): Request correlation ID tracing

PR #119 and #117 had merge conflicts after earlier PRs merged.

---

## Pattern 1: Simple Import Merge

**Scenario:** Two PRs add different imports to the same file.

**Example (PR #119 → main):**
```typescript
// Conflict in src/lib/auth/options.ts
<<<<<<< HEAD
import { ROLE_ADMIN, ROLE_CLIENT } from "@/lib/auth/role-constants";
import { normalizeRawRole } from "@/lib/auth/role-helpers";
=======
import { normalizeEmail } from "@/lib/auth/email-helpers";
>>>>>>> origin/main
```

**Resolution:** Keep both import sets.
```typescript
import { ROLE_ADMIN, ROLE_CLIENT } from "@/lib/auth/role-constants";
import { normalizeRawRole } from "@/lib/auth/role-helpers";
import { normalizeEmail } from "@/lib/auth/email-helpers";
```

**Verification:**
```bash
npx tsc --noEmit  # Verify TypeScript compiles
git add <file>
git commit -m "chore: resolve merge conflict (keep both imports)"
git push origin <branch>
```

---

## Pattern 2: Complex Multi-Way Middleware Merge

**Scenario:** Three PRs modify the same middleware file with overlapping changes:
- PR #117: Adds request ID helpers + security fix (user headers on request, not response)
- PR #119: Adds role normalization helpers + constants
- Both touch: imports, redirect logic, final response construction

**Example (PR #117 → main after #119 merged):**

**Conflict 1: Imports + Helper Functions**
```typescript
<<<<<<< HEAD
import { REQUEST_ID_HEADER, normalizeRequestId } from "@/lib/request-id-constants";

// 4 helper functions: resolveRequestId, jsonWithRequestId, 
// redirectWithRequestId, nextWithRequestId
=======
import { ROLE_ADMIN, ROLE_CLIENT } from "@/lib/auth/role-constants";
import { normalizeTokenRole } from "@/lib/auth/role-helpers";
>>>>>>> origin/main
```

**Resolution:** Merge ALL imports + keep ALL helper functions from HEAD.

**Conflict 2: Admin Route Redirect**
```typescript
<<<<<<< HEAD
const target = token.role === "CLIENT" ? "/portal/dashboard" : "/login";
return redirectWithRequestId(new URL(target, request.url), requestId);
=======
if (isClient) {
  return NextResponse.redirect(new URL("/portal/dashboard", request.url));
}
return NextResponse.redirect(new URL("/login", request.url));
>>>>>>> origin/main
```

**Resolution:** Use HEAD's `redirectWithRequestId()` helper (for request ID) + origin/main's `isClient` variable (for normalized role).
```typescript
const target = isClient ? "/portal/dashboard" : "/login";
return redirectWithRequestId(new URL(target, request.url), requestId);
```

**Conflict 3: Final Response Construction**
```typescript
<<<<<<< HEAD
// HEAD: Sets user headers on REQUEST (security fix)
const requestHeaders = new Headers(request.headers);
requestHeaders.set(REQUEST_ID_HEADER, requestId);
requestHeaders.set("x-user-email", token.email as string);
requestHeaders.set("x-user-id", token.sub as string);
if (role) {
  requestHeaders.set("x-user-role", role);
}

const response = NextResponse.next({
  request: { headers: requestHeaders },
});
response.headers.set(REQUEST_ID_HEADER, requestId);
=======
// origin/main: Sets user headers on RESPONSE (old insecure behavior)
const response = NextResponse.next();
response.headers.set("x-user-email", token.email as string);
response.headers.set("x-user-id", token.sub as string);
if (role) {
  response.headers.set("x-user-role", role);
}
>>>>>>> origin/main
```

**Resolution:** Use HEAD's entire approach (security fix + request ID support).

**Why:** HEAD contains a security fix (user headers on request, not response) that must not be lost. origin/main's approach leaks user context to client.

---

## Resolution Strategy

**When conflicts involve:**

1. **Imports only:** Keep both sets
2. **Helper functions:** Keep all helpers from both sides
3. **Logic changes:** Analyze intent of each side:
   - Security fixes → always preserve
   - New features → combine both
   - Refactors → use the more complete version
4. **Variable renames:** Use the newer naming convention + update references

**Verification checklist:**
```bash
# 1. Resolve conflicts in editor or via write_file
# 2. Verify TypeScript
npx tsc --noEmit

# 3. Verify linting (if project has it)
npm run lint

# 4. Commit with descriptive message
git add <files>
git commit -m "chore: resolve merge conflicts (describe what was combined)"

# 5. Push
git push origin <branch>

# 6. Merge PR
gh pr merge --squash --delete-branch
```

---

## When to Ask for Help

**Resolve yourself when:**
- Import additions (both needed)
- Helper function additions (both needed)
- Non-overlapping logic changes (combine both)
- Clear intent from commit messages

**Ask user when:**
- Conflicting business logic (different approaches to same problem)
- Unclear which version is correct
- Security implications unclear
- Breaking changes on both sides

---

## Common Pitfalls

1. **Losing security fixes:** Always check if one side has security improvements (auth checks, header placement, input validation)
2. **Dropping helper functions:** When one side adds helpers, don't lose them in merge
3. **Inconsistent naming:** If one side renamed variables/functions, update all references
4. **Incomplete merges:** Verify the final file compiles and makes logical sense

---

## Related

- Main skill Section 6: Merging readiness checklist
- `references/bot-review-feedback.md`: Handling bot reviews after merge
