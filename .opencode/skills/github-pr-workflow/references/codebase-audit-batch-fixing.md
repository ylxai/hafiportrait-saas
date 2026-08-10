# Codebase Audit Batch Fixing Workflow

Pattern for systematically fixing issues from an audit document (codebase-audit.md, accessibility-todo.md, etc.) using delegation tasks.

## Grouping Strategy

Group issues into logical PRs of 3-5 issues each:

| PR | Category | Max files |
|----|----------|-----------|
| Security & Auth | M-1, M-2, M-3, M-7 | 4 files |
| Critical Bugs | C-1, C-2, C-3, C-4 | 3 files |
| Error Handling | M-5, M-6, M-9, M-15, M-17 | 5 files |
| Medium Bugs | M-4, M-8, M-13, M-16 | 6 files |
| Low Priority | L-1 through L-6 | 8 files |

**Rule:** Keep each delegation task to 3-4 files max. Tasks touching 5+ files across different domains (API routes + frontend + lib) timeout at 1800s.

## Delegation Task Template

```python
delegate_task(tasks=[
  {
    "goal": "Fix issues X, Y, Z in hafiportrait-saas. Create branch fix/<name> from main, fix all issues, lint+typecheck, push, open PR to main. Wait for bot auto-review (~3 min) then report results.",
    "context": """Repo: /home/ubuntu/hafiportrait-saas. Branch from main.
Run `npm run lint && npx tsc --noEmit 2>&1 | grep -v node_modules | grep 'error TS'` to verify.
Never push to main directly.

Fix these N issues:
**Issue-ID: Short title**
File: path/to/file.ts around line N
Problem: ...
Fix: ...
""",
    "toolsets": ["terminal", "file"]
  },
  # up to 2 more parallel tasks
])
```

## Recovery from Timed-Out Tasks

When a delegation task times out (1800s), the subagent may have already created branches/PRs. **Before retrying**, always check:

```bash
# Check what branches were created
git branch -a | grep "fix/\|feat/"

# Check open PRs
gh pr list --state open --json number,title,headRefName | python3 -c "
import json,sys; [print(p['number'],p['headRefName'],p['title'][:50]) for p in json.load(sys.stdin)]"
```

If branches and PRs exist → work is done, just check bot reviews and fix remaining issues.

## Stash Cleanup After Timeout

Timed-out tasks may leave uncommitted changes on main:

```bash
git status --short  # Check for dirty state
git stash           # Save changes
git stash drop      # Drop if not needed (verify first!)
```

## Sequential PR Merge Conflicts

When multiple PRs touch the same files (e.g. `middleware.ts`), later PRs get conflicts after earlier ones land:

```bash
git checkout fix/later-branch
git rebase origin/main
git push origin fix/later-branch --force-with-lease
# Then merge via GitHub as normal
```

## WhatsApp Notification After Batch

After all PRs are created and bot-reviewed:

```
✅ N PR baru dari codebase-audit.md siap review!

📌 PR #N — Security & Auth
https://github.com/owner/repo/pull/N
- M-1: token.sub null check
- M-2: JWT refresh preserve id/role

📌 PR #N — Critical Bugs
...

Semua PR sudah: ✅ lint ✅ tsc ✅ bot review
Minta konfirmasi untuk merge (satu per satu atau sekaligus).
```

## Testing Preview URLs Before Merge

### UI/UX Audit Checklist (do this before asking user to merge)

For each PR, verify via browser:
- Public pages load (homepage, booking form) — `browser_navigate` with bypass param
- Input touch targets ≥44px — `getBoundingClientRect().height`
- No horizontal overflow — `document.body.scrollWidth > window.innerWidth + 5`
- Nav links visible and sized correctly

For admin pages, use curl (browser login fails — see pitfall below).

### Browser Login Fails on Vercel Preview — Use Curl Instead

**Pitfall (2026-05-31):** Browser-based admin login does NOT work on Vercel preview URLs because:
- `__Secure-next-auth.session-token` is `HttpOnly` — cannot be set via `document.cookie` in JavaScript
- Vercel deployment protection intercepts navigation to `/admin` before NextAuth cookie is read
- The bypass query param (`?x-vercel-protection-bypass=...`) does NOT persist across navigation — each new URL needs the param

**Symptom:** Login form submits → redirects to Vercel login page instead of `/admin`.

**Solution:** Use curl with cookie jar for all admin endpoint testing:

For admin-protected endpoints, use curl with cookie jar (see kernel-cli skill for full pattern):

```bash
BYPASS="your-bypass-secret"
BASE="https://your-preview.vercel.app"

# Get admin credentials from prisma/seed.ts
grep "console.log" prisma/seed.ts  # Shows default email/password

# Login and test
CSRF=$(curl -s -c /tmp/c.txt "$BASE/api/auth/csrf" -H "x-vercel-protection-bypass: $BYPASS" | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])")
curl -s -c /tmp/c.txt -b /tmp/c.txt -L -X POST "$BASE/api/auth/callback/admin-credentials" \
  -H "x-vercel-protection-bypass: $BYPASS" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "csrfToken=$CSRF&email=admin@example.com&password=adminpass&callbackUrl=/admin&json=true"

# Test admin endpoint
curl -s -b /tmp/c.txt "$BASE/api/admin/payments?page=1&limit=3" \
  -H "x-vercel-protection-bypass: $BYPASS"
```

**Key:** Admin credentials are in `prisma/seed.ts` — look for `console.log('Login with: ...')` lines.
