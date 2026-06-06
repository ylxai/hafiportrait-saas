# PhotoStudio SaaS — Workflow & Conventions

> **CRITICAL**: Read this file before making ANY code changes.
> This defines how AI agents should operate on this project.

---

## 1. PR Workflow (Strict Order)

```
[Branch] → [Commit + Push] → [Create PR] → [WAIT 3-5min auto-review]
    → [Read bot feedback] → [Fix all issues] → [Commit + Push fixes]
    → [Manual re-review] → [Vercel ✅ + All bots ✅]
    → [Ask user approval] → [Merge]
```

### Step-by-Step

#### Step 1: Branch
```bash
git checkout -b fix/your-bug-name
```
- Branch name: `fix/` or `feat/` prefix, kebab-case
- NEVER push directly to `main`

#### Step 2: Create PR
```bash
gh pr create --title "fix: description" --body "## Problem\n...\n## Changes\n..."
```
- Title format: `type: description` (conventional commits)
- Body should have: Problem, Root Cause, Changes, Testing
- Set `--base main`

#### Step 3: WAIT for auto-review
- **DO NOT trigger manual review** on first push
- Bots auto-review within 3-5 minutes:
  - **Sourcery-AI**: Code quality + security patterns
  - **Gitar**: Git/deployment analysis
  - **Gemini Code Assist**: Comprehensive code review
  - **Seer** (Sentry): Runtime error analysis
  - **CodeAnt-AI**: Security + anti-patterns
- Check results: `gh pr view <N> --json statusCheckRollup,reviews`

#### Step 4: Read bot feedback
- ALL issues must be addressed (Critical/High/Medium/Low)
- Especially Sourcery-AI (most thorough)
- Fix issues one by one, commit each fix

#### Step 5: Fix → Commit → Push
```bash
git add -A && git commit -m "fix: description of fix"
git push
```

#### Step 6: Manual re-review (AFTER fixes only)
```bash
gh pr comment <N> --body "@sourcery-ai review"
gh pr comment <N> --body "/gemini review"
```
- Trigger ONLY after you've pushed fixes
- NEVER trigger manual review on first push

#### Step 7: Verify all checks pass
```bash
gh pr view <N> --json statusCheckRollup
# Vercel: SUCCESS, Sourcery: SUCCESS, Gitar: SUCCESS, etc.
```

#### Step 8: Ask user before merging
```bash
gh pr merge <N> --squash --subject "fix: title"
```
- **NEVER merge autonomously** — always ask first
- Send WhatsApp summary for batch PRs
- Wait for explicit approval ("ye merge" or "merge semua")

#### Step 9: Cleanup merged branch
```bash
git push origin --delete <branch>
git branch -D <branch>
```

---

## 2. Code Review Standards

### Before Creating PR (Self-Review)
- `npm run lint` — MUST pass with 0 errors, 0 warnings
- `npm run build` — MUST pass (includes TypeScript check)
- No `console.log` in production code (use `logger` for server, `console.*` only for browser-compat)
- No `any` types — use `unknown` or specific interfaces
- All API inputs validated with Zod + `formatZodError()`
- All admin routes use `requireAdminAuth()`
- All Prisma BigInt fields use `serializeBigInt()` or `successResponse()`

### Bot Review Responses

| Bot | When It Reviews | What It Catches |
|---|---|---|
| **Sourcery-AI** | Auto + manual trigger | Code quality, security, anti-patterns, dead code |
| **Gitar** | Auto | PR quality, deployment readiness |
| **Gemini** | Auto + `/gemini review` | Comprehensive review with suggestions |
| **Seer (Sentry)** | Auto | Runtime error patterns |
| **CodeAnt-AI** | Auto | Security vulnerabilities, injection risks |

---

## 3. Code Conventions

### File Writing Rules (Chunked Write Protocol)
| Operation | Limit | Method |
|---|---|---|
| New file ≤ 300 lines | Single operation | `write_file()` |
| New file > 300 lines | NEVER single write | Write 250-300 lines, then append |
| Edit existing file | Surgical only | `patch()` tool (find-replace) |
| Bulk changes | Multiple small patches | Never rewrite entire large file |

### Import Style
```typescript
// ✅ Use @/ alias for absolute imports
import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'
import { successResponse } from '@/lib/api/response'

// ❌ NO relative imports outside own directory
import { prisma } from '../../../lib/db'
```

### Error Handling
```typescript
// ✅ Server code: try-catch with logger
try {
  const data = await prisma.model.findUnique({ where: { id } })
} catch (err: unknown) {
  logger.error('route.failed', { id, err })
  return serverErrorResponse('Failed to process')
}

// Handle Prisma P2025 → 404
if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
  return notFoundResponse()
}
```

### React Component Rules
- **Client Components**: `"use client"` directive at top
- **Server Components**: Default (no directive)
- API calls in client: `useSWR` with `error` + `mutate` destructured
- NO `alert()` — use `toast()` from `sonner`
- Dialog: Import from `@/components/ui/dialog` (uses `@base-ui/react`, NOT Radix)

---

## 4. Testing Conventions

### E2E Tests (Playwright)
```bash
npm run test:e2e          # All tests
npm run test:e2e:admin   # Admin only
npm run test:e2e:debug   # Debug mode
```

### Strict Rules
- **NO CSS selectors** — use `getByRole()`, `getByLabel()`, `getByText()`, `getByTestId()`
- **NO `waitForTimeout()`** — use Playwright auto-wait
- **Page Object Model**: Tests in `tests/e2e/pages/`
- **Auth state cached**: `playwright/.auth/`
- **Constants**: `import { HTTP_STATUS } from '@/tests/e2e/constants/http-status'`

---

## 5. AI Agent Handoff Protocol

When handing off to another AI agent:

### What to Include in the Prompt
1. **Current state**: What's been done, what's pending
2. **Branch**: Current branch name
3. **Known issues** (from `08-known-issues.md`)
4. **Last commit**: SHA + message
5. **What NOT to do**: Critical prohibitions

### Critical Prohibitions
1. ❌ **NO** merging without user approval
2. ❌ **NO** pushing directly to main
3. ❌ **NO** `any` types
4. ❌ **NO** `alert()` — use `toast()`
5. ❌ **NO** static Tailwind colors — OKLCH semantics only
6. ❌ **NO** CSS selectors in tests
7. ❌ **NO** `waitForTimeout()` in tests
8. ❌ **NO** storage credentials in `.env` — use `StorageAccount` table
9. ❌ **NO** single write over 300 lines — chunk it
10. ❌ **NO** rewriting entire large files — use surgical patches

---

## 6. Communication Protocol

### When to Notify User (WhatsApp)
- Batch PRs ready for merge approval
- Production issues found
- Architecture decisions needed
- Secrets/key rotations
- When blocked and need input

### When NOT to Notify
- Routine merges (after user approval)
- Minor fixes (bot review passed)
- This project maintenance (already agreed scope)

### Message Format
```
✅ **PR #N Merged** (commit SHA)
## What
[2-3 lines summary]
## Changes
[Bullet points of key changes]
## Verification
[Checks passed]
```
