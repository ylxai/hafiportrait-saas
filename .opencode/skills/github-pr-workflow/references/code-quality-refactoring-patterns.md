# Common Code Quality Refactoring Patterns from Bot Reviews

When bot reviews suggest code quality improvements (after critical/high/medium issues are fixed), these patterns emerge frequently. Capture them here for reuse.

## Session Context: 2026-05-25

After merging 4 security PRs (PR #117, #118, #119, #120), bot reviews suggested two code quality improvements. These were implemented in follow-up PR #121.

---

## Pattern 4: Import Constants in Client Components (Not Hardcoded Strings)

**Bot Suggestion:** "Login pages still use hardcoded string values instead of importing and using the newly created constants."

**Problem:** After introducing named constants for provider IDs, the frontend login pages still used hardcoded string literals. This defeats the purpose of the constants — if the value changes, the frontend silently drifts.

**Example (Before):**
```typescript
// src/app/(auth)/login/page.tsx
const result = await signIn("admin-credentials", { ... });

// src/app/portal/login/page.tsx
const result = await signIn('client-credentials', { ... });
```

**Solution:** Import and use the constants in client components.

```typescript
// src/app/(auth)/login/page.tsx
import { PROVIDER_ID_ADMIN } from "@/lib/auth/role-constants";
const result = await signIn(PROVIDER_ID_ADMIN, { ... });

// src/app/portal/login/page.tsx
import { PROVIDER_ID_CLIENT } from '@/lib/auth/role-constants';
const result = await signIn(PROVIDER_ID_CLIENT, { ... });
```

**Key insight:** `role-constants.ts` is a pure constants file (no imports, no Node.js built-ins) — safe to import in client components. Always verify the import chain before assuming a lib file is client-safe.

**When to apply:**
- Any time a constant is defined in one place but used as a string literal elsewhere
- Bot says "use the shared constant instead of a magic string"
- Frontend code references values that are also defined as backend constants

---

## Pattern 1: Decouple Provider IDs from Domain Constants

**Bot Suggestion:** "Using `ROLE_ADMIN`/`ROLE_CLIENT` as the `CredentialsProvider` `id` couples provider identity to the role string, so a future change to the canonical role value would unintentionally rotate provider IDs and invalidate sessions."

**Problem:** NextAuth provider IDs are part of the session token structure. Changing them invalidates all existing sessions. When provider IDs are coupled to domain constants (like role names), refactoring the domain accidentally breaks sessions.

**Example (Before):**
```typescript
// src/lib/auth/role-constants.ts
export const ROLE_ADMIN = 'admin' as const;
export const ROLE_CLIENT = 'client' as const;

// src/lib/auth/options.ts
CredentialsProvider({
  id: ROLE_ADMIN,  // ❌ Coupled to domain constant
  // ...
})
```

**Solution:** Create separate constants for provider IDs, decoupled from domain semantics.

```typescript
// src/lib/auth/role-constants.ts
export const ROLE_ADMIN = 'admin' as const;
export const ROLE_CLIENT = 'client' as const;

/**
 * NextAuth CredentialsProvider IDs, decoupled from the role constants.
 *
 * These IDs are part of the session token structure and changing them
 * would invalidate all existing sessions, forcing every user to log in
 * again. By keeping them separate from ROLE_ADMIN/ROLE_CLIENT, we can
 * safely refactor role semantics (e.g., rename 'admin' to 'administrator'
 * in the DB) without accidentally rotating provider IDs and breaking
 * active sessions.
 *
 * WARNING: Changing these values will invalidate all existing sessions.
 * Coordinate with the team before modifying.
 */
export const PROVIDER_ID_ADMIN = 'admin' as const;
export const PROVIDER_ID_CLIENT = 'client' as const;

// src/lib/auth/options.ts
import { PROVIDER_ID_ADMIN, PROVIDER_ID_CLIENT } from '@/lib/auth/role-constants';

CredentialsProvider({
  id: PROVIDER_ID_ADMIN,  // ✅ Stable, independent from domain refactoring
  // ...
})
```

**Benefits:**
- Provider IDs remain stable even if role semantics change
- Clear separation of concerns (auth infrastructure vs domain model)
- Explicit warning comment prevents accidental changes

**When to apply:**
- Any time framework IDs (provider IDs, route names, API keys) are derived from domain constants
- When bot suggests "decouple X from Y to prevent accidental invalidation"

---

## Pattern 2: Centralize Duplicated Logic with Shared Helpers

**Bot Suggestion:** "The middleware now hand-rolls role normalization from `token.role`; consider reusing a shared helper (similar to `normalizeRole` in `role-helpers.ts`) so case/whitespace handling stays consistent."

**Problem:** Same logic (role normalization, email normalization, etc.) duplicated across multiple files. Each duplication is a chance for drift, bugs, or inconsistent behavior.

**Example (Before):**
```typescript
// src/lib/auth/require-admin-auth.ts
const ADMIN_ROLES = new Set(['admin']);

export async function requireAdminAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorizedResponse();
  
  const role = (session.user.role ?? '').toLowerCase();  // ❌ Duplicated logic
  if (!ADMIN_ROLES.has(role)) return forbiddenResponse();
  
  return session;
}

// src/lib/auth/role-helpers.ts
function normalizeRole(session: Session | null | undefined): string {
  return (session?.user?.role ?? '').trim().toLowerCase();  // ✅ Canonical version
}
```

**Solution:** Extract shared helper, remove duplication, delegate to single source of truth.

```typescript
// src/lib/auth/require-admin-auth.ts
import { isAdminSession } from '@/lib/auth/role-helpers';

export async function requireAdminAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorizedResponse();
  
  // Delegate to isAdminSession so middleware, route guards, and this
  // helper all apply the exact same trim + lowercase normalization.
  if (!isAdminSession(session)) return forbiddenResponse();
  
  return session;
}
```

**Benefits:**
- Single source of truth for normalization logic
- Consistent behavior across middleware, route guards, and helpers
- Easier to update (change once, applies everywhere)
- Reduced code duplication

**When to apply:**
- Bot suggests "extract helper" or "avoid duplication"
- Same logic appears in 2+ files
- Logic involves normalization, validation, or transformation
- Consistency is critical (auth, security, data integrity)

**Common candidates:**
- Role/permission checking
- Email normalization
- Input validation
- Error handling patterns
- Header/token parsing

---

## Pattern 3: Add Validation to Prevent Malformed Input

**Bot Suggestion:** "The `normalizeRequestId` helper only bounds length and nullish values; you might want to also normalize/validate the character set (e.g., trim or reject whitespace/control characters)."

**Problem:** Input validation only checks for presence/length but doesn't validate format. Malformed input (whitespace, control chars, unexpected characters) can slip through.

**Example (Before):**
```typescript
function normalizeRequestId(inbound: string | null): string {
  if (inbound && inbound.length > 0 && inbound.length <= MAX_LENGTH) {
    return inbound;  // ❌ No charset validation
  }
  return crypto.randomUUID();
}
```

**Solution:** Add charset validation to reject malformed input.

```typescript
// Define allowed pattern
const REQUEST_ID_ALLOWED_PATTERN = /^[a-zA-Z0-9-]+$/;

function normalizeRequestId(inbound: string | null): string {
  if (
    inbound &&
    inbound.length > 0 &&
    inbound.length <= MAX_LENGTH &&
    REQUEST_ID_ALLOWED_PATTERN.test(inbound)  // ✅ Charset validation
  ) {
    return inbound;
  }
  return crypto.randomUUID();
}
```

**Benefits:**
- Prevents whitespace/control characters in logs
- Rejects malformed input early
- Clear contract for what's acceptable
- Easier debugging (no surprising characters)

**When to apply:**
- Bot suggests "validate character set" or "reject whitespace"
- Input is used in logs, headers, or identifiers
- Malformed input could cause downstream issues
- Security-sensitive values (tokens, IDs, keys)

---

## General Principles

**When bot suggests code quality improvements:**

1. **Evaluate impact vs effort:**
   - High impact (prevents bugs, improves security) → implement
   - Low impact (minor style preference) → consider deferring

2. **Batch related improvements:**
   - Group similar refactorings in one commit
   - Don't create 5 PRs for 5 one-line changes

3. **Preserve behavior:**
   - Code quality refactors should not change behavior
   - Add tests if behavior is complex
   - Verify with TypeScript compilation + existing tests

4. **Document intent:**
   - Add comments explaining WHY the pattern exists
   - Reference bot review or security concern
   - Help future maintainers understand the decision

5. **Consider follow-up PR:**
   - If security fixes are urgent, merge first
   - Create clean follow-up PR for quality improvements
   - Avoid mixing critical fixes with refactoring

---

## Related

- Main skill Section 6: Pragmatic merge strategy (when to defer quality improvements)
- Main skill Section 7: Addressing bot review feedback
- `references/bot-review-comprehensive-fix.md`: User preference for fixing all issues together
