# Bot Review Triage & Response Workflow

When bot reviews arrive on a PR (Sourcery-AI, Gemini Code Assist, CodeAnt AI, etc.), follow this systematic triage and response workflow.

## 1. Wait for Bot Reviews

After pushing commits, wait 120-150 seconds for bot reviews to complete.

**CRITICAL: Check ALL bots, not just one or two.** The PR may have 5+ bots running:

| Bot | What it reviews | How to trigger |
|---|---|---|
| **Sourcery-AI** | Code quality, security, anti-patterns | Auto + `@sourcery-ai review` |
| **Gemini Code Assist** | Comprehensive code review | Auto + `/gemini review` |
| **Gitar** | PR quality, deployment readiness | Auto |
| **Seer (Sentry)** | Runtime error patterns | Auto |
| **CodeAnt AI** | Security vulnerabilities | Auto |
| **Vercel** | Build + Deployment | Auto |

**🚫 Pitfall:** Don't only check one or two bots. The user expects ALL bot feedback to be reviewed. A bot that silently commented with no issues is still a bot that ran — verify it explicitly.

```bash
# Wait for reviews
sleep 120

# Check ALL review comments — not just first bot
gh pr view $PR_NUMBER --json reviews,statusCheckRollup

# Verify every bot has completed (not still pending)
gh pr view $PR_NUMBER --json statusCheckRollup --jq '.statusCheckRollup[] | {name: (.name // .context), status: (.conclusion // .state)}'
```

## 2. Fetch All Bot Review Comments

Get both formal reviews AND issue comments — bots post in both places.

```bash
# Get formal reviews
gh api repos/$OWNER/$REPO/pulls/$PR_NUMBER/reviews

# Get issue comments (bots often post here too)
gh api repos/$OWNER/$REPO/issues/$PR_NUMBER/comments
```

## 3. Categorize Issues by Priority

Group findings by severity:

- **🔴 Critical** — Security vulnerabilities, data leaks, correctness bugs
- **🟠 High** — Logic errors, inconsistencies, missing error handling
- **🟡 Medium** — Code quality, maintainability, missing features
- **🟢 Low** — Style, naming, documentation, minor optimizations

**Example categorization:**
```
🔴 Critical (1):
  - PII leakage in logs (GDPR violation)

🟠 High (3):
  - resetAt inconsistency bug
  - Misleading documentation
  - Route count error in docs

🟡 Medium (5):
  - Missing Retry-After header in 429 responses
  - Should use rateLimitResponse helper

🟢 Low (5):
  - Missing imports
  - Inconsistent identifier format
  - Code organization
```

## 4. Present Options to User

**Default recommendation:** Fix Critical + High priority issues before merge.

Present options clearly:
```
Option 1: Fix Critical + High (4 issues, ~1-2 hours) ← Recommended
Option 2: Fix all issues (14 issues, ~3-4 hours)
Option 3: Merge now, fix later (defer to next PR)
```

**User preference (hafiportrait-saas project):** User prefers fixing ALL priority levels before merge. When given options, explicitly chose "fix semua dulu medium dan low nya" (fix all medium and low first).

## 5. Fix Issues Systematically

### Critical + High Priority First

Always fix these before considering merge:
- Security issues (PII leaks, injection vulnerabilities)
- Correctness bugs (logic errors, inconsistencies)
- Documentation errors that mislead users

### Medium + Low Priority

If user chooses comprehensive fix:
- Code quality improvements (DRY, helpers, consistency)
- Missing features (headers, error messages)
- Style and organization

### Commit Strategy

Group fixes by priority level:
```bash
# Commit 1: Critical + High
git commit -m "fix: address critical and high priority bot review feedback

Security (CodeAnt AI - Critical):
- Fix PII leakage in logs

High Priority (Sourcery AI):
- Fix resetAt inconsistency
- Update misleading comment
- Fix docs route count"

# Commit 2: Medium + Low
git commit -m "fix: address medium and low priority bot review feedback

Medium Priority (Gemini - 5 issues):
- Use rateLimitResponse helper
- Add Retry-After header

Low Priority (Gemini - 5 issues):
- Add missing imports
- Standardize identifier format
- Code organization"
```

## 6. Push and Wait for Re-Review

After fixing issues:
```bash
git push origin $BRANCH

# Wait for Vercel deployment
sleep 90

# Check deployment status
gh pr checks $PR_NUMBER
```

## 7. Monitor for New Bot Reviews

Bots may re-review after new commits. Repeat triage if new issues appear.

## Common Bot Review Patterns

### Sourcery-AI
- Code quality and refactoring suggestions
- Duplication detection
- Complexity warnings
- Usually Medium/Low priority

### Gemini Code Assist
- Missing error handling
- API best practices (headers, status codes)
- Consistency issues
- Mix of Medium/Low priority

### CodeAnt AI
- Security vulnerabilities
- PII leakage
- Injection risks
- Usually Critical/High priority

## Pitfalls

### ❌ Don't merge with unresolved Critical issues
Even if "only one issue", security and correctness bugs must be fixed.

### ❌ Don't ignore bot reviews
Bots catch real issues. Triage systematically rather than dismissing.

### ❌ Don't fix issues without categorizing first
Present options to user — they may prefer comprehensive fix over quick merge.

### ✅ Do wait for deployment success
Verify Vercel/CI passes after fixes before declaring "ready to merge".

### ✅ Do group fixes by priority in commits
Makes review history clear and allows partial rollback if needed.

### ✅ Do trigger re-review on ALL bots after fixes
Don't just check one bot's feedback and assume the rest are fine. After pushing fixes:
1. Check ALL bots for remaining issues
2. Trigger re-review on bots that had issues: `@sourcery-ai review` AND `/gemini review`
3. Verify ALL bots pass before declaring "ready to merge"

### 🚫 Don't assume the last commit is covered
After pushing fixes, bots may show "SKIPPED" status for the latest commit. Always check the status check rollup and re-trigger if needed.

## Example Session Flow

```
1. Push PR → wait 120s
2. Fetch reviews → 14 issues found
3. Categorize: 1 Critical, 3 High, 5 Medium, 5 Low
4. Present options → User chooses "fix all"
5. Fix Critical + High → commit → push
6. Wait 90s → verify deployment
7. Fix Medium + Low → commit → push
8. Wait 90s → verify deployment
9. Check for new reviews → none
10. Declare ready to merge
```

## Integration with PR Workflow

This workflow fits between "PR opened" and "ready to merge" in the standard `github-pr-workflow` skill:

1. Create branch
2. Make changes
3. Commit
4. Push
5. Open PR
6. **→ Bot review triage (this workflow)**
7. Merge

## Vercel Deployment Verification

After each push, verify deployment succeeds:

```bash
# Check deployment status
gh pr checks $PR_NUMBER

# Expected output:
# ✓ Vercel — Deployment has completed
```

If deployment fails, investigate before continuing with fixes.
