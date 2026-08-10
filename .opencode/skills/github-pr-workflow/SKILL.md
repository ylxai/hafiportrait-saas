---
name: github-pr-workflow
description: "GitHub PR lifecycle: branch, commit, open, CI, merge."
version: 1.1.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [GitHub, Pull-Requests, CI/CD, Git, Automation, Merge]
    related_skills: [github-auth, github-code-review]
---

# GitHub Pull Request Workflow

Complete guide for managing the PR lifecycle. Each section shows the `gh` way first, then the `git` + `curl` fallback for machines without `gh`.

## ⚠️ MERGE AUTHORIZATION — READ FIRST

**MERGE WORKFLOW (updated 2026-05-27):** Before merging, MUST:
1. ✅ Vercel deployment SUCCESS
2. ✅ All bot issues resolved
3. ✅ **Test preview URL with bypass secret** — no issues
4. ✅ After merge: test production URL

Then report status and ask for confirmation:

```
PR #N siap merge:
- ✅ Vercel deployment success
- ✅ Gemini: no issues
- ✅ Sourcery: "looks great!"
- ✅ Gitar: auto-approved

Konfirmasi untuk merge?
```

User explicitly said "jangan langsung merge" — do NOT merge autonomously even when Vercel ✅ + bots clean.

**Ping user for:**
- Merge confirmation (ALWAYS)
- New features (product decisions)
- Architecture changes
- Secrets / environment changes
- Anything uncertain or risky

User quote: "kalau anda tidak yakin untuk merge. sebaiknya laporkan saja ke saya. cek semuanya dulu. setelah tidak ada bot feedback dan vercel hijau. juga testing anda juga tidak ada masalah di preview link. langsung merge saja"

### Batch Audit PRs — WhatsApp Notification Pattern

When executing multiple PRs from an audit document (codebase-audit, accessibility-todo, etc.):

1. Use `delegate_task` with parallel tasks (up to 3 concurrent) — each task creates its own branch + PR
2. After ALL tasks complete, send WhatsApp with full PR list:
   ```
   ✅ N PR baru dari <audit-doc> siap review!
   
   📌 PR #N — <category>
   https://github.com/owner/repo/pull/N
   - Issue 1
   - Issue 2
   
   Semua PR sudah: ✅ lint ✅ tsc ✅ bot review
   Minta konfirmasi untuk merge.
   ```
3. Wait for user approval before merging any PR

**Rate limit pitfall (2026-05-31):** Running 3 parallel delegate tasks with heavy models can hit 429 rate limits. If one task fails with 429, retry it separately after the others complete.

**Delegation task scope limit (2026-05-31):** Tasks that touch too many files (5+ files across different domains) timeout at 1800s. Keep each task to 3-4 files max. If a task needs more, split it into two separate tasks. Signs a task is too large: it involves both API routes AND frontend pages AND lib utilities in the same task.

**Sourcery "looks great!" signal:** When Sourcery's latest review body is "Hey - I've reviewed your changes and they look great!" with no individual comments, it means zero issues found — safe to merge (pending Vercel ✅ and Gitar APPROVED).

**Sequential PR merge conflicts (2026-05-31):** When multiple PRs touch the same files (e.g. `middleware.ts`), later PRs get merge conflicts after earlier ones land. Fix with rebase before merging:
```bash
git checkout fix/later-branch
git rebase origin/main
git push origin fix/later-branch --force-with-lease
# Then merge via GitHub as normal
```
Use `--force-with-lease` (not `--force`) to avoid overwriting concurrent pushes.

**Delegation task timeout recovery (2026-05-31):** Delegate tasks time out at 1800s. When a task times out, the subagent may have already created branches and PRs before hitting the limit. **Before retrying**, always check:
```python
# Check what branches were created
terminal("git branch -a | grep 'fix/\\|feat/'")
# Check open PRs
terminal("gh pr list --state open --json number,title,headRefName")
```
If branches and PRs already exist, the work is done — just check bot reviews and fix any remaining issues. Do NOT re-run the full delegate task, which would create duplicate branches/PRs or fail with "branch already exists".

---

### Delegation for Large PRs (User Preference)

**User explicitly requested:** "gunakan delegates tasks dan parallel" — use `delegate_task` with parallel tasks for large implementation work.

When a PR requires changes across multiple files or domains, run delegate tasks in parallel rather than sequentially:

```python
delegate_task(tasks=[
  {
    "goal": "Fix X in file A and B. Do NOT commit.",
    "toolsets": ["terminal", "file"]
  },
  {
    "goal": "Fix Y in file C and D. Do NOT commit.",
    "toolsets": ["terminal", "file"]
  }
])
```

**When to use parallel delegation:**
- 3+ files need changes across different domains (worker + schema + API)
- Each task is independent (no shared state)
- Total changes > 50 lines

**Subagent instructions pattern:**
- Always say "Do NOT commit or push"
- Specify branch name if on a feature branch
- Ask subagent to run lint+tsc after edits
- Ask subagent to report: files modified, error count

---



The agent has a hard limit of 90 tool calls per turn. Long PR workflows (Vercel polling + bot review cycles) consume budget fast. Apply these patterns to avoid hitting the limit mid-task:

### Batch tool calls with execute_code
Instead of 5 separate `terminal()` calls, use one `execute_code` block:
```python
from hermes_tools import terminal
# Run all checks in one call
r1 = terminal("npm run lint 2>&1 | tail -3")
r2 = terminal("npx tsc --noEmit 2>&1 | grep 'error TS' | wc -l")
r3 = terminal("grep -r 'deadFn' src/ | wc -l")
print(r1['output'], r2['output'], r3['output'])
```

### Delegate large work to subagents
For tasks with 20+ file edits (TypeScript fixes, mass codemods), use `delegate_task` — subagents have their own 90-call budget:
```python
delegate_task(
  goal="Fix all TS implicit any errors in these files...",
  context="Branch: feat/xxx — do NOT commit",
  toolsets=["terminal", "file"]
)
```

### Avoid polling loops
Instead of `sleep(30)` × 10, use longer single sleeps:
```bash
sleep 90 && echo "done"  # One 90s wait beats three 30s waits
```

### When budget runs out mid-task
User will say "continue" — resume from last known state:
1. Check `git status` to see what's staged/committed
2. Check open PRs with `mcp_github_list_pull_requests`
3. Continue from where you left off

---

## Prerequisites

- Authenticated with GitHub (see `github-auth` skill)
- Inside a git repository with a GitHub remote

### Quick Auth Detection

```bash
# Determine which method to use throughout this workflow
if command -v gh &>/dev/null && gh auth status &>/dev/null; then
  AUTH="gh"
else
  AUTH="git"
  # Ensure we have a token for API calls
  if [ -z "$GITHUB_TOKEN" ]; then
    if [ -f ~/.hermes/.env ] && grep -q "^GITHUB_TOKEN=" ~/.hermes/.env; then
      GITHUB_TOKEN=$(grep "^GITHUB_TOKEN=" ~/.hermes/.env | head -1 | cut -d= -f2 | tr -d '\n\r')
    elif grep -q "github.com" ~/.git-credentials 2>/dev/null; then
      GITHUB_TOKEN=$(grep "github.com" ~/.git-credentials 2>/dev/null | head -1 | sed 's|https://[^:]*:\([^@]*\)@.*|\1|')
    fi
  fi
fi
echo "Using: $AUTH"
```

### Extracting Owner/Repo from the Git Remote

Many `curl` commands need `owner/repo`. Extract it from the git remote:

```bash
# Works for both HTTPS and SSH remote URLs
REMOTE_URL=$(git remote get-url origin)
OWNER_REPO=$(echo "$REMOTE_URL" | sed -E 's|.*github\.com[:/]||; s|\.git$||')
OWNER=$(echo "$OWNER_REPO" | cut -d/ -f1)
REPO=$(echo "$OWNER_REPO" | cut -d/ -f2)
echo "Owner: $OWNER, Repo: $REPO"
```

---

## ⛔ ABSOLUTE RULE: NEVER Delete Untracked Files Without Asking

**Pitfall (2026-05-28):** Before committing, NEVER run `rm -f` on untracked files shown in `git status`. Untracked files are NOT in git history — deleting them is irreversible.

User correction: "docs/audit-tasks.md anda hapus? wow saya perlu itu" — file was permanently lost because it was untracked and I deleted it with `rm -f` before committing.

**Correct approach:**
```bash
# See what's untracked
git status --short

# NEVER do this without asking:
# rm -f docs/audit-tasks.md test-*.js  ← WRONG

# Instead: ask user what to do with untracked files
# Or: only stage specific files you intend to commit
git add src/lib/env.server.ts src/lib/cloudflare-queue.ts
git commit -m "..."
# Leave untracked files alone
```

**Rule:** If `git status` shows untracked files you didn't create in this session, ask the user before touching them. They may be work-in-progress the user needs.

---

## ⛔ ABSOLUTE RULE: NEVER Push Directly to Main

**Pitfall (2026-05-25):** Check `git branch --show-current` as **step 0 before making ANY file edit**, not just before pushing. Editing files on `main` then creating a branch after is still a violation — the changes land on `main` first. Correct order: branch → edit → commit → push → PR. Never edit → branch.

```bash
# ALWAYS run this before touching any file
git branch --show-current
# If output is "main" → git checkout -b <branch> FIRST
```

**User correction (2026-05-25):** Pushing directly to `main` without a branch + PR is a workflow violation — even in long sessions, even for "small" fixes, even for audit/sprint work.

> "apakah anda kehilang context atau memory? kamu membuat kesalahan lagi. anda harus wajib mengikuti workflow yang sudah saya tetapkan. meski session ini panjang"

**What happened:** Sprint 4, 5, 6 fixes and a payment account feature were all pushed directly to `main` without PRs. This bypassed bot review, Vercel deployment checks, and the full review cycle.

**Rule:** Every change, no matter how small or how long the session, MUST go through:
1. New branch (`git checkout -b fix/...` or `feat/...`)
2. Commit to branch
3. Push branch
4. Create PR
5. Wait for bot review
6. Fix feedback
7. Check Vercel deployment
8. Merge

**No exceptions.** Context compression does not excuse this. Long sessions do not excuse this.

**Recovery when you accidentally commit to main (2026-05-30):**
Never say "terlanjur" (already done / too late) — accidental main commits are ALWAYS recoverable. User was explicitly frustrated by this defeatist response.
```bash
# Step 1: Revert the commit from main immediately
git revert <sha> --no-edit && git push origin main

# Step 2: Create proper branch from reverted main
git checkout -b fix/the-thing

# Step 3a: Try cherry-pick first
git cherry-pick <original-sha>
# If cherry-pick SUCCEEDS:
git push -u origin fix/the-thing

# Step 3b: If cherry-pick FAILS with conflicts (branch diverged):
git cherry-pick --abort
# Re-apply changes manually using patch/write_file tools
# Then commit normally:
git add -A && git commit -m "fix: ..." && git push -u origin fix/the-thing

# Step 4: Open PR as normal
```
**Pitfall (2026-05-30):** Cherry-pick fails when the branch has diverged from main (e.g. after a revert + other commits landed). In that case, abort cherry-pick and re-apply the changes directly using file tools. Do NOT force-push or use `--strategy-option theirs` blindly.

The correct response is: "I made a mistake, here is how I am fixing it right now."

---

## 1. Branch Creation

This part is pure `git` — identical either way:

```bash
# Make sure you're up to date
git fetch origin
git checkout main && git pull origin main

# Create and switch to a new branch
git checkout -b feat/add-user-authentication
```

Branch naming conventions:
- `feat/description` — new features
- `fix/description` — bug fixes
- `refactor/description` — code restructuring
- `docs/description` — documentation
- `ci/description` — CI/CD changes

## 2. Making Commits

Use the agent's file tools (`write_file`, `patch`) to make changes, then commit:

```bash
# Stage specific files
git add src/auth.py src/models/user.py tests/test_auth.py

# Commit with a conventional commit message
git commit -m "feat: add JWT-based user authentication

- Add login/register endpoints
- Add User model with password hashing
- Add auth middleware for protected routes
- Add unit tests for auth flow"
```

Commit message format (Conventional Commits):
```
type(scope): short description

Longer explanation if needed. Wrap at 72 characters.
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `ci`, `chore`, `perf`

## 3. Pushing and Creating a PR

### Push the Branch (same either way)

```bash
git push -u origin HEAD
```

### Create the PR

**With gh:**

```bash
gh pr create \
  --title "feat: add JWT-based user authentication" \
  --body "## Summary
- Adds login and register API endpoints
- JWT token generation and validation

## Test Plan
- [ ] Unit tests pass

Closes #42"
```

Options: `--draft`, `--reviewer user1,user2`, `--label "enhancement"`, `--base develop`

**With git + curl:**

```bash
BRANCH=$(git branch --show-current)

curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/$OWNER/$REPO/pulls \
  -d "{
    \"title\": \"feat: add JWT-based user authentication\",
    \"body\": \"## Summary\nAdds login and register API endpoints.\n\nCloses #42\",
    \"head\": \"$BRANCH\",
    \"base\": \"main\"
  }"
```

The response JSON includes the PR `number` — save it for later commands.

To create as a draft, add `"draft": true` to the JSON body.

### ⚠️ CRITICAL: Bot Reviews Auto-Trigger on PR Creation

**DO NOT manually trigger bot reviews immediately after creating a PR.**

Bots (Gemini, Sourcery-AI, CodeAnt-AI) **automatically review new PRs within 1-2 minutes** of creation. Manual triggers (`/gemini review`, `@sourcery-ai review`) are **ONLY for re-reviews** after you push subsequent commits to address feedback.

**Correct workflow:**
1. Push branch → Create PR
2. **Wait 2-3 minutes** for automatic bot reviews to appear (they trigger independently of CI)
3. Read bot feedback → Fix issues → Push new commit
4. **NOW trigger re-reviews manually** with separate comments (see Section 7)

**Anti-pattern (DO NOT DO):**
- ❌ Post `/gemini review` immediately after creating PR
- ❌ Trigger bots before they've had time to auto-review
- ❌ Assume bots need manual trigger on first PR creation

**Real violation example (2026-05-25, PR #121):**
- Created PR at 18:18:50
- Triggered `@sourcery-ai review` at 18:18:57 (7 seconds later) ❌
- Triggered `/gemini review` at 18:19:03 (13 seconds later) ❌
- Bots were already auto-reviewing - manual triggers wasted cycles
- **Correct action:** Wait 2-3 minutes, let bots auto-review, THEN read feedback

**User correction from 2026-05-25:** "gini lo perlu anda update workflow lagi deh. dan belajar untuk meningkatkan diri sendiri maksud saya. ketika pertama kali fix dan anda push dan buat PR, tunggu feedback dari bot review. setelah dapat feedback lalu anda fix lagi tuh, nah baru ketika commit dan push baru trigger ulang bot. paham gak"

Translation: When you first push and create PR, WAIT for bot feedback. After you get feedback and fix it, THEN when you commit and push, trigger bot re-review.

**Correct sequence:**
1. Push branch + Create PR
2. **WAIT 2-3 minutes** - bots auto-review without manual trigger
3. Read bot feedback
4. Fix issues + Commit + Push
5. **NOW trigger manual re-review** with separate comments

**Anti-pattern (what I did wrong in this session):**
- ❌ Created PR #121 at 18:18:50
- ❌ Immediately triggered `@sourcery-ai review` at 18:18:57 (7 seconds later)
- ❌ Immediately triggered `/gemini review` at 18:19:03 (13 seconds later)

This wastes bot cycles because they were already auto-reviewing. Manual triggers are ONLY for re-reviews after subsequent commits, not for first review.

## 4. Monitoring CI Status

### Check CI Status

**With gh:**

```bash
# One-shot check
gh pr checks

# Watch until all checks finish (polls every 10s)
gh pr checks --watch
```

**With git + curl:**

```bash
# Get the latest commit SHA on the current branch
SHA=$(git rev-parse HEAD)

# Query the combined status
curl -s \
  -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/commits/$SHA/status \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f\"Overall: {data['state']}\")
for s in data.get('statuses', []):
    print(f\"  {s['context']}: {s['state']} - {s.get('description', '')}\")"

# Also check GitHub Actions check runs (separate endpoint)
curl -s \
  -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/commits/$SHA/check-runs \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
for cr in data.get('check_runs', []):
    print(f\"  {cr['name']}: {cr['status']} / {cr['conclusion'] or 'pending'}\")"
```

### Poll Until Complete (git + curl)

```bash
# Simple polling loop — check every 30 seconds, up to 10 minutes
SHA=$(git rev-parse HEAD)
for i in $(seq 1 20); do
  STATUS=$(curl -s \
    -H "Authorization: token $GITHUB_TOKEN" \
    https://api.github.com/repos/$OWNER/$REPO/commits/$SHA/status \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['state'])")
  echo "Check $i: $STATUS"
  if [ "$STATUS" = "success" ] || [ "$STATUS" = "failure" ] || [ "$STATUS" = "error" ]; then
    break
  fi
  sleep 30
done
```

## 5. Auto-Fixing CI Failures

When CI fails, diagnose and fix. This loop works with either auth method.

### Step 1: Get Failure Details

**With gh:**

```bash
# List recent workflow runs on this branch
gh run list --branch $(git branch --show-current) --limit 5

# View failed logs
gh run view <RUN_ID> --log-failed
```

**With git + curl:**

```bash
BRANCH=$(git branch --show-current)

# List workflow runs on this branch
curl -s \
  -H "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/repos/$OWNER/$REPO/actions/runs?branch=$BRANCH&per_page=5" \
  | python3 -c "
import sys, json
runs = json.load(sys.stdin)['workflow_runs']
for r in runs:
    print(f\"Run {r['id']}: {r['name']} - {r['conclusion'] or r['status']}\")"

# Get failed job logs (download as zip, extract, read)
RUN_ID=<run_id>
curl -s -L \
  -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/actions/runs/$RUN_ID/logs \
  -o /tmp/ci-logs.zip
cd /tmp && unzip -o ci-logs.zip -d ci-logs && cat ci-logs/*.txt
```

### Step 2: Fix and Push

After identifying the issue, use file tools (`patch`, `write_file`) to fix it:

```bash
git add <fixed_files>
git commit -m "fix: resolve CI failure in <check_name>"
git push
```

### Step 3: Verify

Re-check CI status using the commands from Section 4 above.

### Auto-Fix Loop Pattern

When asked to auto-fix CI, follow this loop:

1. Check CI status → identify failures
2. Read failure logs → understand the error
3. Use `read_file` + `patch`/`write_file` → fix the code
4. `git add . && git commit -m "fix: ..." && git push`
5. Wait for CI → re-check status
6. Repeat if still failing (up to 3 attempts, then ask the user)

## 6. Merging

### Vercel Preview Environment Variables

**Pitfall:** Env vars set only for `Production` in Vercel dashboard are NOT available in Preview deployments. Features that work in production silently degrade in preview.

**Symptom:** Feature works in production but fails in preview. Example: upload token generation returns `null` because `VPS_WEBHOOK_SECRET` is missing in preview env.

**Check existing env vars:**
```bash
TOKEN=$(cat ~/.local/share/com.vercel.cli/auth.json | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
curl -s "https://api.vercel.com/v10/projects/$PROJECT_ID/env?teamId=$TEAM_ID" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; [print(e['key'], e['target']) for e in json.load(sys.stdin).get('envs',[])]"
```

**Add to Preview (if ENV_CONFLICT, use PATCH with the env ID):**
```bash
# Add new
curl -s -X POST "https://api.vercel.com/v10/projects/$PROJECT_ID/env?teamId=$TEAM_ID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"key":"VAR_NAME","value":"value","type":"encrypted","target":["preview"]}'

# Update existing (get ID from list above)
curl -s -X PATCH "https://api.vercel.com/v10/projects/$PROJECT_ID/env/$ENV_ID?teamId=$TEAM_ID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"value":"new_value","type":"encrypted","target":["preview"]}'
```

**Vercel token:** `~/.local/share/com.vercel.cli/auth.json` → `token` field.
**Project/team IDs:** `.vercel/project.json` in repo root.

---

### Merge Readiness Checklist

**NEVER merge until ALL of these are true:**
1. ✅ **Bot reviews completely clean**
2. ✅ **Vercel deployment SUCCESS**
3. ✅ **Preview URL tested with bypass secret — no issues found**
4. ✅ After merge: **production URL tested and healthy**

### Preview URL Testing (MANDATORY before merge)

```bash
# 1. Get bypass secret
BYPASS=$(grep 'VERCEL_AUTOMATION_BYPASS_SECRET' .env | cut -d= -f2)

# 2. Get preview URL from deployment
PREVIEW=$(npx vercel inspect dpl_<id> 2>&1 | grep 'url' | head -1 | awk '{print $2}')

# 3. Test with Kernel browser (bypass Vercel protection)
export KERNEL_API_KEY=<key>
SESSION=$(kernel browsers create -o json | python3 -c "import sys,json; print(json.load(sys.stdin)['session_id'])")

kernel browsers playwright execute $SESSION "
  await page.goto('${PREVIEW}/?x-vercel-protection-bypass=${BYPASS}', { waitUntil: 'domcontentloaded' });
  const tests = [
    '${PREVIEW}/api/public/booking/packages',
    '${PREVIEW}/api/admin/galleries',
  ];
  const results = {};
  for (const url of tests) {
    const r = await page.evaluate(async (args) => {
      const res = await fetch(args.url, { headers: { 'x-vercel-protection-bypass': args.bypass } });
      return { status: res.status };
    }, { url, bypass: '${BYPASS}' });
    results[url.replace('${PREVIEW}', '')] = r.status;
  }
  return JSON.stringify(results);
"
kernel browsers delete $SESSION
```

**Expected results:**
- Public endpoints (`/api/public/*`) → 200
- Admin endpoints (`/api/admin/*`) → 401 (auth required, not 500)
- No 500 errors anywhere

**Pitfall:** Preview URL is protected by Vercel — always use bypass secret. Without it, all requests return 401 (Vercel auth, not app auth).

**Pitfall:** `page.evaluate` fails with `TypeError: Failed to fetch` if `page.goto()` hasn't been called first. Always navigate to the base URL before calling fetch in evaluate.

### Post-Merge Production Testing

```bash
PROD="https://studio.hafiportrait.photography"
curl -s -w '\nHTTP:%{http_code}' "$PROD/api/public/booking/packages" | tail -2
# Expected: HTTP:200

curl -s -w '\nHTTP:%{http_code}' "$PROD/api/admin/galleries" | tail -2
# Expected: HTTP:401
```



**User correction from 2026-05-25:** "ketika tidak ada lagi feedback, anda harus check deployment vercel di PR apakah berhasil. kalau sudah berhasil langsung merge."

Translation: When there's no more feedback, you MUST check Vercel deployment in the PR to see if it succeeded. If it succeeded, merge immediately.

**How to check Vercel deployment:**
1. Open PR page on GitHub
2. Scroll to checks section at bottom
3. Look for "Vercel" check status
4. Verify status is ✅ "Deployment successful" (not ⏳ pending or ❌ failed)
5. Only merge when Vercel shows SUCCESS

**Anti-pattern (DO NOT DO):**
- ❌ Merge after bot reviews clean without checking Vercel
- ❌ Assume Vercel is fine because other CI passed
- ❌ Merge while Vercel is still building (⏳ pending)

### Pragmatic Merge Strategy: Critical Fixes vs Quality Improvements

**When bot reviews enter diminishing returns** (all critical/high/medium issues fixed, only code quality suggestions remain), you have two options:

**Option A: Merge and Follow-Up (Recommended for Large PRs)**
1. Merge the PR with critical fixes complete
2. Create a new PR for code quality improvements
3. Implement remaining suggestions in clean context

**When to use:**
- PR already addresses 3+ security/bug findings
- Remaining suggestions are architectural (decouple constants, extract helpers)
- Suggestions would require touching multiple files
- Risk of infinite suggestion loop (each fix generates new suggestions)

**Option B: Continue Iterating (Recommended for Small PRs)**
1. Fix remaining suggestions
2. Re-trigger bot reviews
3. Merge when completely clean

**When to use:**
- PR is small (1-2 files)
- Suggestions are simple (add validation, fix typo)
- User explicitly requested "fix ALL issues"

**User preference from 2026-05-25:** "merge semua lalu up lagi code quality improvement" — pragmatic approach to separate critical fixes from incremental improvements. After fixing all security issues across 4 PRs, user chose to merge with remaining code quality suggestions and handle them in a follow-up PR.

**Key principle:** Don't let perfect be the enemy of good. If critical issues are fixed and CI is green, merge. Quality improvements can follow.

**Iterative Loop Pattern (User Preference):**
- Fix ALL feedback (Critical + High + Medium + Low + Suggestions)
- Trigger re-reviews (separate comments: `/gemini review`, then `@sourcery-ai review`)
- Wait ~3 minutes for reviews
- Check each bot's feedback on latest commit
- If ANY issues remain → fix and repeat
- Only merge when completely clean

**User correction from 2026-05-25:** "fix semua (termasuk PR #117 bug + PR #119 suggestions) sebelum merge apapun harus trigger bot dulu . / /gemini review dan @sourcery-ai review . satau-satu comment nya lalu monitor dulu lihat feedback bot review. kalau masih ada lanjut fix dan trigger lagi. lalu tunggu lagi. sampai tidak ada feedback lalu beritahu saya"

This means: Fix everything → trigger → wait → check → repeat until clean → THEN notify user. Run the full loop autonomously.

**When bot reviews reference an old commit SHA:**
- The issues were from a previous version of the code
- If you've already fixed them in a newer commit, they're resolved
- Safe to merge once latest commit has no new issues

**Anti-pattern (DO NOT DO):**
- ❌ Merge immediately after Vercel SUCCESS without checking bot reviews
- ❌ Merge with "will fix in follow-up PR" for issues bots flagged
- ❌ Skip re-review trigger after fixing issues

This was explicitly corrected: PR #100 and #101 were merged without checking bot reviews. Always complete the full review cycle.

**With gh:**

```bash
# Squash merge + delete branch (cleanest for feature branches)
gh pr merge --squash --delete-branch

# Enable auto-merge (merges when all checks pass)
gh pr merge --auto --squash --delete-branch
```

**With git + curl:**

```bash
PR_NUMBER=<number>

# Merge the PR via API (squash)
curl -s -X PUT \
  -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/pulls/$PR_NUMBER/merge \
  -d "{
    \"merge_method\": \"squash\",
    \"commit_title\": \"feat: add user authentication (#$PR_NUMBER)\"
  }"

# Delete the remote branch after merge
BRANCH=$(git branch --show-current)
git push origin --delete $BRANCH

# Switch back to main locally
git checkout main && git pull origin main
git branch -d $BRANCH
```

Merge methods: `"merge"` (merge commit), `"squash"`, `"rebase"`

### Enable Auto-Merge (curl)

```bash
# Auto-merge requires the repo to have it enabled in settings.
# This uses the GraphQL API since REST doesn't support auto-merge.
PR_NODE_ID=$(curl -s \
  -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/pulls/$PR_NUMBER \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['node_id'])")

curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/graphql \
  -d "{\"query\": \"mutation { enablePullRequestAutoMerge(input: {pullRequestId: \\\"$PR_NODE_ID\\\", mergeMethod: SQUASH}) { clientMutationId } }\"}"
```

## 7. Addressing Bot Review Feedback

When bots (CodeAnt AI, Gemini Code Assist, Sourcery-AI, Rovo Dev) leave review comments, follow a systematic approach to address feedback efficiently. See `references/bot-review-feedback.md` for the complete workflow and `references/bot-review-comprehensive-fix.md` for user preference on fixing all priority levels together.

**CRITICAL: Bot auto-review hanya terjadi SEKALI — saat PR pertama dibuat.**
Setelah commit berikutnya, bot TIDAK otomatis re-review. Harus selalu di-trigger manual setelah setiap round of fixes:
```
@sourcery-ai review
/gemini review
```
Jangan tunggu bot re-review sendiri — tidak akan terjadi.

**CRITICAL RULE: NEVER merge while bot reviews have unresolved issues.**
PR #100 and #101 were merged prematurely without checking bot reviews — this was explicitly corrected by the user.

**Correct Autonomous Workflow (Iterative Loop Until Clean):**

User preference: **Fix ALL bot feedback (including suggestions) before merge.** Thorough resolution over speed. Run the full loop autonomously until completely clean, then notify user.

1. Push code → Create PR
2. **⚠️ DO NOT manually trigger bot reviews** — bots auto-review new PRs within 1-2 minutes
3. **Wait and check bot reviews FIRST** (Sourcery-AI, Gemini, CodeAnt-AI) — typically appear within 1-2 minutes of push, independently of CI
4. Read ALL bot feedback → Categorize by severity (Critical/High/Medium/Low/Suggestions)
5. **Fix ALL issues** (not just critical) — user prefers comprehensive resolution:
   - Critical + High + Medium + Low + Suggestions
   - Commit fix → Push
6. **⚠️ USER PREFERENCE: Wait for confirmation before triggering re-reviews** (2026-05-27)
   
   User explicitly requested: "bisakah anda menunggu sebentar setelah commit dan push lalu trigger bot. ada yang perlu saya check sehingga meninggalkan sebentar sesi ini dan akan kembali lagi nanti"
   
   **When to wait:**
   - After fixing bot feedback and pushing new commit
   - Before triggering manual re-reviews
   - User may need to check something external (Vercel dashboard, logs, etc.)
   
   **Pattern:**
   - Fix issues → Commit → Push
   - Report: "Fixes pushed. Vercel deploying. Ready to trigger bot re-reviews when you confirm."
   - Wait for user's "continue" or explicit approval
   - THEN trigger re-reviews
   
   This overrides the autonomous loop pattern for THIS USER. Other users may prefer autonomous iteration.

7. **Trigger re-review** by posting **separate comments** for each bot (do NOT combine into one comment):
   
   First comment:
   ```
   /gemini review
   ```
   
   Wait for Gemini response, then post second comment:
   ```
   @sourcery-ai review
   ```
   
   **Sourcery re-review reliability:** `@sourcery-ai review` comment trigger is unreliable. If Sourcery doesn't respond within 3-4 minutes after a fix commit + trigger, push a trivial no-op commit (e.g. add/remove a blank line) to give it a new SHA to review against. If it still doesn't respond after that, **do not block on Sourcery** — proceed to merge if: (a) all Sourcery feedback from the original review is addressed in code, (b) Gemini has no new issues on the latest commit, and (c) Vercel deployment is SUCCESS. Observed in PR #123: fix commit pushed, `@sourcery-ai review` triggered, Sourcery never posted a new review — merged successfully after Vercel confirmed green.

   **`gitar-bot`** — auto-approves PRs silently on first review (no action needed, treat as informational). Does NOT need manual re-trigger. First appeared in PR #128-129 (2026-05-27).

~~`@codeant-ai review`~~ — **DO NOT trigger re-reviews for CodeAnt.** User explicitly asked to drop CodeAnt from re-review triggers ("kurangi trigger bot review selanjutnya. gunakan gemini dan sourcery-ai saja"). The initial CodeAnt review on PR creation is fine, but its inline comments persistently re-attach to subsequent commits even after the issue is fixed (stale state issue), creating noise in re-reviews. Skip it.
   
   **Rationale:** Some bot triggers may not fire reliably when batched in a single comment. Separate comments ensure each bot sees its own trigger independently. User explicitly corrected this: "anda salah trigger. jangan satukan commentnya buat satu-satu /gemini review lalu buat lagi @sourery-ai review"

7. **Wait ~3 minutes** for bot reviews to complete on the new commit
8. **Check reviews ONE BY ONE** — read each bot's feedback on the latest commit SHA
9. **Categorize new feedback:**
   - If ANY issues remain (Critical/High/Medium/Low/Suggestions) → fix and repeat from step 5
   - If reviews are clean (no new issues, or only reference old commit SHAs) → proceed to step 10
10. **Loop until completely clean** — repeat steps 5-9 until NO bot has ANY unresolved feedback
11. Once all bot reviews clean → check Vercel deployment status → THEN merge
12. **Notify user** only when merge is complete

**Key principle:** Run the full iterative loop autonomously. User expects you to fix → trigger → wait → check → repeat until clean, THEN report. Not "here are the issues, should I fix them?" — just fix everything and report when done.

**Why bot reviews first, Vercel second:** Bot reviewers post within ~1-2 minutes of push regardless of CI. Vercel preview builds can take 3-10 minutes. Reading bot reviews while Vercel builds means the Vercel result lands as you finish triaging — no wasted wall-clock. User explicitly corrected the reverse order: "sebaiknya lebih baik melihat review bot dulu baru kemudian monitor vercel deployment. jadi ubah urutannya".

**How to tell reviews are resolved:**
- New reviews on latest commit SHA have no issues
- Only reviews present are from older commit SHAs (already addressed)
- Bot explicitly approves or has no new comments

**User Preference (Important):**
When bot reviews identify multiple issues across priority levels, user prefers **comprehensive fix approach**:
- Fix ALL issues (Critical → High → Medium → Low) before merge
- Thorough resolution over speed
- Present clear summary with priority categorization (🔴🟠🟡🟢)

**Quick pattern:**
1. Fetch bot comments → categorize by priority (Critical/High/Medium/Low)
2. Fix ALL issues in one commit (or two if large: Critical+High, then Medium+Low)
3. Push fix → Trigger re-review (comment `/gemini review`, `@sourcery-ai review`, `@codeant-ai review`)
4. Wait 2 minutes → Check for new reviews on latest commit
5. Repeat until clean
6. **If bot comments reference old commit SHA:** issues are resolved, safe to merge
7. **If bot comments seem wrong:** verify actual file state with `read_file`, bot may be reviewing intermediate diff

### Impact Analysis Before Implementing Breaking Changes

**CRITICAL: Always check impact before implementing architectural changes suggested by bots.**

When bots suggest refactoring that changes public APIs, constants, or identifiers used across the codebase, **STOP and analyze impact FIRST** before implementing.

**Pattern: Breaking Change Detection**

Bot suggests: "Use distinct provider ID values ('admin-credentials' instead of 'admin') to decouple from role semantics"

**Wrong approach:**
```typescript
// ❌ Blindly implement suggestion without checking usage
export const PROVIDER_ID_ADMIN = 'admin-credentials' as const;
export const PROVIDER_ID_CLIENT = 'client-credentials' as const;
```

**Right approach:**
1. **Search codebase for ALL usages** of the values being changed
2. **Identify breaking change scope** - frontend, tests, documentation, external integrations
3. **Assess deployment complexity** - coordinated deployment needed? Session invalidation?
4. **Present findings to user** with clear impact summary BEFORE implementing
5. **Get explicit approval** for breaking changes

**Example from 2026-05-25 session (PR #121):**

Bot suggested changing provider IDs from `'admin'/'client'` to `'admin-credentials'/'client-credentials'`. I implemented without checking impact.

**Impact discovered AFTER implementation:**
```typescript
// Frontend code breaks:
signIn('admin')  // ❌ No longer matches 'admin-credentials'
signIn('client') // ❌ No longer matches 'client-credentials'

// All existing sessions invalidated
// Coordinated frontend + backend deployment required
```

**User correction:** "berarti itu kesalahan anda tanpa mengecek impact. terus apa saran anda"

Translation: That's your mistake for not checking impact. What's your recommendation?

**Impact Analysis Checklist:**

Before implementing ANY change that modifies:
- Public API signatures
- Constants used in multiple files
- Identifiers referenced by frontend
- Configuration values
- Database schema
- Session structure

**Run this analysis:**

1. **Search for usages:**
   ```bash
   # Search for the value being changed
   grep -r "old-value" src/ tests/ --include="*.ts" --include="*.tsx"
   
   # Search for the identifier
   grep -r "CONSTANT_NAME" src/ tests/ --include="*.ts" --include="*.tsx"
   ```

2. **Categorize impact:**
   - ✅ **Safe**: Only used in same file, no external references
   - ⚠️ **Medium**: Used across backend files, no frontend impact
   - 🔴 **Breaking**: Used in frontend, tests, or external integrations

3. **Document findings:**
   ```markdown
   ## Impact Analysis
   
   **Files affected:** 2
   - src/app/login/page.tsx (frontend)
   - src/app/portal/login/page.tsx (frontend)
   
   **Breaking changes:**
   - All existing sessions invalidated (users must re-login)
   - Frontend signIn() calls must be updated
   - Coordinated deployment required
   
   **Risk:** HIGH - requires frontend changes + user re-login
   ```

4. **Present to user with options:**
   - Option A: Implement breaking change + update all affected code
   - Option B: Revert to avoid breaking changes
   - Option C: Hybrid approach (rename constants but keep values)

5. **Get explicit approval** before proceeding with breaking changes

**When to skip impact analysis:**
- Purely internal refactoring (private functions, local variables)
- Changes within single file with no exports
- Test-only changes
- Documentation updates

**When impact analysis is MANDATORY:**
- Bot suggests "decouple", "rename", "change values" for exported constants
- Changes to API routes, endpoints, or request/response shapes
- Modifications to authentication flow, session structure, or tokens
- Database schema changes
- Environment variable renames

**Safe implementation pattern:**
1. Search → Analyze → Document → Present → Get approval → Implement
2. If breaking changes detected, offer user choice BEFORE implementing
3. Never assume "user won't mind re-login" - always ask

### Investigating Code Quality Issues Before Fixing

**CRITICAL: Don't blindly fix unused imports or "dead code" warnings.**

When bots flag unused imports, duplicate code, or missing validation, investigate WHY before removing/fixing:

**Pattern: Unused Import Investigation**

Bot says: "Remove unused ROLE_ADMIN import from options.ts"

**Wrong approach:**
```typescript
// ❌ Blindly remove import
- import { ROLE_ADMIN, ROLE_CLIENT } from './constants';
+ import { ROLE_CLIENT } from './constants';
```

**Right approach:**
1. **Check actual usage** - Search file for all references to the import
2. **Understand the asymmetry** - Is there intentional design difference?
3. **Verify implementation completeness** - Is code missing that should use it?

**Example from 2026-05-25 session (PR #121):**

Bot flagged unused `ROLE_ADMIN` import in `options.ts`. Investigation revealed:

```typescript
// Admin provider - uses DB value (can vary)
return {
  role: normalizeRawRole(user.role)  // ← Uses DB, not constant
};

// Client provider - hardcoded (no DB column)
return {
  role: ROLE_CLIENT  // ← Uses constant
};
```

**Conclusion:** Asymmetry is intentional. Admin roles come from User.role DB column (need normalization), client roles are always 'client' (no role column in Client table). Safe to remove unused import.

**User instruction from 2026-05-25:** "fix keduanya tetapi perlu cek apakah unused import ini memang harus dihapus atau bahkan implementasi hilang sehingga jadi unused import"

Translation: Fix both issues, but check whether unused import should be removed OR if there's missing implementation that should use it.

**Investigation checklist:**
- [ ] Search file for all references to the flagged symbol
- [ ] Check if there's intentional asymmetry in the design
- [ ] Verify no missing implementation (e.g., one code path uses constant, another doesn't)
- [ ] Read surrounding code comments for design rationale
- [ ] If asymmetry exists, document WHY in commit message

**When to remove vs keep:**
- ✅ Remove: Genuinely unused, no missing implementation, asymmetry is intentional
- ❌ Keep: Missing implementation detected, should be used but isn't
- 🤔 Ask user: Unclear if asymmetry is intentional or bug

### Bot Diff Confusion Pattern

**Symptom:** Bot comments about issues that appear to be already fixed.

**Cause:** Bot reviews diff from commit N-1 → N, but you've already fixed the issue in commit N. Bot sees the "before" state in the diff, not the "after" state.

**Diagnosis:**
```bash
# Check actual file state at HEAD
git checkout <branch>
cat <file> | grep -A5 -B5 <relevant_section>

# Or use read_file tool to verify current state
```

**Response pattern:**
1. Verify actual file state shows fix is applied
2. Reply to bot with clarification comment explaining:
   - Bot reviewed diff from commit X → Y
   - Actual final state at HEAD is correct
   - Include code snippets showing current state
   - Request bot verify final file state, not intermediate diff
3. Wait for bot acknowledgment or proceed to merge if confident

**Example reply:**
```markdown
## 🤖 Bot Review Clarification

Bot reviewed commit X but appears to have seen intermediate diff.

**Actual Final State:**
File: `path/to/file.ts` at HEAD (commit Y)
Lines A-B: ✅ Issue already fixed

**What Commit Y Did:**
- REMOVED the problematic code
- Added explanatory comment

Request: Please verify final file state at HEAD rather than intermediate diff.
```

## 8. Complete Workflow Example

```bash
# 1. Start from clean main
git checkout main && git pull origin main

# 2. Branch
git checkout -b fix/login-redirect-bug

# 3. (Agent makes code changes with file tools)

# 4. Commit
git add src/auth/login.py tests/test_login.py
git commit -m "fix: correct redirect URL after login

Preserves the ?next= parameter instead of always redirecting to /dashboard."

# 5. Push
git push -u origin HEAD

# 6. Create PR (picks gh or curl based on what's available)
# ... (see Section 3)

# 7. Check bot reviews (see Section 7) — this comes BEFORE Vercel monitoring

# 8. Monitor CI/Vercel (see Section 4) — usually clean by the time bots are addressed

# 9. Merge when bots clean + CI green (see Section 6)
```

## 9. Branch Cleanup After Merge (MANDATORY)

**User correction (2026-05-25):** Stale branches accumulate from delegation tasks and create confusion. Branch cleanup is NOT optional — it is a required step after every merge.

**Note on `jq`:** If `jq` is not available, use Python instead:
```bash
gh pr list --state merged --json headRefName --limit 50 | \
  python3 -c "import json,sys; [print(b['headRefName']) for b in json.load(sys.stdin)]"
```
Do NOT use `jq` without first verifying it's installed (`which jq`). Python3 is always available.



**MANDATORY: Delete branch after every PR merge — both remote and local.**

User explicitly corrected this: stale branches accumulate from delegation tasks and create confusion.

### After merging a single PR:
```bash
# Delete remote branch
git push origin --delete <branch-name>

# Switch to main and pull
git checkout main && git pull origin main

# Delete local branch
git branch -D <branch-name>
```

### Bulk cleanup of merged branches (after many PRs):
```bash
# 1. Get list of all merged branches from GitHub
gh pr list --state merged --json headRefName --limit 50 | \
  python3 -c "import json,sys; [print(b['headRefName']) for b in json.load(sys.stdin)]"

# 2. Delete all that exist locally (keep main + any unmerged branches)
git branch | grep -v "^\* main$" | grep -v "^  main$" | \
  grep -v "unmerged-branch-1" | xargs git branch -D

# 3. Prune remote tracking refs
git fetch --prune
```

**Note:** `git branch --merged main` only detects regular merges. Squash merges (GitHub default) are NOT detected this way — use the `gh pr list` approach above instead.

**Workflow integration:** After `gh pr merge` or `mcp_github_merge_pull_request`, always run the cleanup commands above before moving to the next task.

---

## 10. Pre-Push Risk Checks for Schema Tightening

When a bot recommends tightening a runtime constraint (optional → required, adding `.min()`, removing `.default()`, etc.) on a value sourced from infrastructure (Vercel/Netlify/CF env vars, secret stores, K8s configmaps):

**ALWAYS verify the value is provisioned in every target environment before pushing.** A "required" Zod schema or a removed default that worked locally will throw at server startup the moment the deploy runs against an env where the variable was never set, breaking production for users.

See `references/pre-push-schema-tightening.md` for the full pattern, including the Vercel CLI verification recipe and the safe pivot when a variable is missing.

## 10. Pushing Back on Bot Recommendations

**User preference (2026-05-27):** Always check ALL 4 bot reviewers (sourcery-ai, gemini-code-assist, gitar-bot, codeant-ai). For each comment: validate if correct → fix immediately; if incorrect → reply with justification and ignore.

> jangan lewatkan feedback bot reviewer karena ada 4 bot reviewer. dan selalu cek apakah valid atau tidak, kalau valid langsung fix dan kalau tidak ignore dan balas bot

**IMPORTANT: Check ALL bots, not just one (2026-06-06).**
User explicitly corrected: jangan hanya fokus ke 1 bot, tapi semua bot. When checking reviews:
1. Query ALL reviews via gh pr view N --json statusCheckRollup,reviews
2. List EVERY bot's status and feedback in your response
3. Report a summary table showing all bots
4. Always mention bots that silently approved too
5. Final verdict: table with per-bot status

**Gemini contradiction pattern (2026-05-30):** Gemini can contradict itself across review rounds on the same PR. Example from PR #154: Round 2 said "don't change global Input", Round 3 said "centralize into global Input", Round 4 said "use outline-none", Round 5 said "use h-11 not inline style". When Gemini flip-flops, post one clear technical justification comment (with evidence like `getComputedStyle` results), then stop iterating on that issue. Do NOT keep changing code to match each contradictory suggestion.

**Known bot mistakes for hafiportrait-saas:**
- **Gemini on Prisma Accelerate protocol**: Suggests `prisma://` but correct is `prisma+postgres://accelerate.prisma-data.net/` — verify against actual `.env`
- **Gemini on missing imports in docs**: Valid — always add imports to code snippets in documentation
- **Gemini on env var renames** (e.g. `CLOUDFLARE_` → `NEXT_SERVER_`): Reject — would break already-provisioned Vercel env vars
- **Sourcery on helper extraction**: Evaluate if it adds real value; if 3-line pattern is readable inline, reject with explanation
- **Sourcery on Next.js 15 `params: Promise`**: Sourcery flags `params: Promise<{ id: string }>` as wrong, but this is CORRECT for Next.js 15+ App Router dynamic routes. `params` IS a Promise that must be awaited. Verify against actual framework version before accepting this suggestion.

Bots are not infallible. They apply generic rules from a knowledge base that may not match this project's actual deployment posture. When a bot recommendation conflicts with a project-specific decision (deploy target, naming convention already provisioned in cloud config, framework feature available locally but not in this stack), the right move is to **reject with a documented justification on the PR**, not silently ignore.

Skip bot recommendations when they:
- Apply a "best practice" that targets a context the project isn't in (e.g. "avoid CLOUDFLARE_ prefix to dodge Wrangler conflicts" when the project has no local Wrangler in its runtime path — Vercel-only deploys)
- Suggest renames that would force a parallel change to already-provisioned secrets/env vars in cloud dashboards (cost > benefit)
- Recommend adding defaults for production URLs/secrets (security anti-pattern: bakes personal subdomains into the bundle)

How to reject cleanly:
1. Implement the parts of the review you DO agree with (don't reject everything because one item is wrong)
2. Post a single PR comment with structure:
   - **Changes in <SHA>:** numbered list of what you fixed
   - **Rejecting <recommendation>:** one paragraph stating why this rule doesn't apply here, with the project-specific context
   - Re-trigger reviews at the bottom (`/gemini review`, `@sourcery-ai review`, `@codeant-ai review`)
3. If a bot keeps repeating the same rejected recommendation across re-reviews, that's expected — bots don't read prior comments. Don't keep replying. Final reviewer (human or merge gate) sees both your justification and the bot's note.

See `references/pre-push-schema-tightening.md` for a worked example combining schema tightening + bot pushback.

## Useful PR Commands Reference

| Action | gh | git + curl |
|--------|-----|--------------|
| List my PRs | `gh pr list --author @me` | `curl -s -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/repos/$OWNER/$REPO/pulls?state=open"` |
| View PR diff | `gh pr diff` | `git diff main...HEAD` (local) or `curl -H "Accept: application/vnd.github.diff" ...` |
| Add comment | `gh pr comment N --body "..."` | `curl -X POST .../issues/N/comments -d '{"body":"..."}'` |
| Request review | `gh pr edit N --add-reviewer user` | `curl -X POST .../pulls/N/requested_reviewers -d '{"reviewers":["user"]}'` |
| Close PR | `gh pr close N` | `curl -X PATCH .../pulls/N -d '{"state":"closed"}'` |
| Check out someone's PR | `gh pr checkout N` | `git fetch origin pull/N/head:pr-N && git checkout pr-N` |
| Trigger bot review | `gh pr comment N --body "/gemini review"` | `curl -X POST .../issues/N/comments -d '{"body":"/gemini review"}'` |

## Related References

- `references/merge-conflict-resolution.md` — Patterns for resolving merge conflicts when multiple PRs touch overlapping code. Covers simple import merges and complex multi-way middleware merges with security fix preservation. Includes PR #117, #119 session examples.
- `references/code-quality-refactoring-patterns.md` — Common refactoring patterns from bot review suggestions: decouple provider IDs from domain constants, centralize duplicated logic with shared helpers, add charset validation. Use when implementing code quality improvements in follow-up PRs after security fixes merge.
- `references/bot-review-trigger-commands.md` — Exact commands to trigger re-review from Gemini, Sourcery-AI, CodeAnt-AI; timing, stale vs fresh review detection
- `references/bot-review-feedback.md` — Systematic approach to addressing bot review comments (includes PR #97, #98, #99 session examples with prioritized fixing, PII redaction, Vercel bypass patterns)
- `references/bot-review-comprehensive-fix.md` — User preference for fixing ALL bot issues (Critical+High+Medium+Low) in two-commit strategy rather than incremental merges. Includes PR #99 rate-limiting session with security (PII redaction), bug risks (consistency), API patterns (specialized helpers), and code organization fixes
- `references/bot-review-iteration-strategy.md` — DEPRECATED: Previously recommended merging after Round 1 and deferring to separate PRs. User corrected this: ALWAYS fix ALL bot issues and re-trigger reviews until clean before merging. No exceptions.
- `references/ci-troubleshooting.md` — CI failure diagnosis and auto-fix patterns
- `references/conventional-commits.md` — Commit message format guide
- `references/incremental-pr-strategy.md` — Create PRs with partial implementation + documentation for early feedback
- `references/vercel-environment-bypass.md` — Use VERCEL_ENV for automatic preview vs production behavior (rate limiting, feature flags, validation)
- `references/vercel-build-transient-failures.md` — Handling Vercel build timeouts when identical code succeeds on retry; merge working code first, retry refactor in clean PR
- `references/vercel-deployment-failure-isolation.md` — When Vercel deployment fails with cryptic webpack/build errors, check if main branch also fails to isolate whether the PR is the cause. Includes PR #121 session example where main was already broken (client component importing Node.js built-in). Use BEFORE debugging PR code.
- `references/file-editing-conventions.md` — Chunked write protocol: never write files over 300 lines in single operation; always use surgical patches for edits
- `references/codebase-audit-batch-fixing.md` — Full workflow for fixing issues from audit docs (codebase-audit.md, accessibility-todo.md) using parallel delegation tasks. Covers grouping strategy, timeout recovery, sequential merge conflicts, WhatsApp notification pattern, and admin curl login for preview URL testing.
- `references/pre-push-schema-tightening.md` — Pre-push verification when bots recommend tightening Zod schemas (optional → required, removing defaults, adding validators) on env-sourced values. Includes Vercel CLI verification pattern and the safe pivot decision tree. Use BEFORE pushing any change that turns runtime config into a startup precondition.
- `references/nextjs-mass-codemod-patterns.md` — Python codemod for mass-wrapping Next.js route handlers (withRequestContext, require-client-auth migration). Handles multi-line imports, multi-line function signatures, brace-depth tracking. Tested on 52 route files with zero TypeScript errors. Also covers require-client-auth migration pitfall: grep for ALL remaining `session` references after import swap.
- `references/vercel-deployment-failure-isolation.md` — When Vercel deployment fails with cryptic webpack/build errors, check if main branch also fails (`git checkout main && npm run build`) to isolate whether the PR is the cause.
- `references/base-ui-css-specificity.md` — `@base-ui/react/input` overrides Tailwind `h-*` and `!h-*` classes. Use `style={{ height: '44px' }}` for WCAG touch targets. Also covers `{ cause: error }` TypeScript incompatibility in this project. Includes PR #121 session example where main was already broken (client component importing Node.js built-in `node:async_hooks` via logger chain). Fix: remove logger import from ALL client error boundaries (`global-error.tsx`, `error.tsx`, `admin/error.tsx`, `gallery/error.tsx`), replace with `console.error`. Also: env vars must be set in `.env` (not `.env.local`) for Next.js build — check `.env` for commented-out required vars before debugging build failures.
