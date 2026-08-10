# PR Review Comment Analysis Workflow

## Use Case

When a user asks "check if there are review comments on PR #X", follow this workflow to provide comprehensive analysis.

## Step-by-Step

### 1. Fetch PR Comments

```bash
# Get all review comments (code-level, inline)
gh api repos/{owner}/{repo}/pulls/{number}/comments

# Get general PR comments (conversation)
gh pr view {number} --comments

# Get review summaries (approve/request changes)
gh api repos/{owner}/{repo}/pulls/{number}/reviews
```

### 2. Parse and Categorize

**Review comment types:**
- **Review comments** (`/pulls/comments`) - Inline code comments on specific lines
- **Issue comments** (`/issues/comments`) - General PR conversation
- **Reviews** (`/pulls/reviews`) - Approval/changes requested/commented

**Key fields to extract:**
```json
{
  "user.login": "reviewer username",
  "body": "comment text",
  "path": "file path",
  "line": "line number",
  "created_at": "timestamp",
  "in_reply_to_id": "parent comment ID (for threads)"
}
```

### 3. Identify Bot vs Human Reviews

**Bot patterns:**
- Username ends with `[bot]`
- Common bots: `gemini-code-assist[bot]`, `codeant-ai[bot]`, `dependabot[bot]`

**Bot comment structure:**
- Often includes severity badges (🔴 HIGH, 🟠 MAJOR, 🟡 MEDIUM)
- May include "Fix in Cursor" / "Fix in VSCode" links
- Structured with reproduction steps
- May include code suggestions in markdown

### 4. Check for Owner Responses

```bash
# Get all comments and filter by author
gh api repos/{owner}/{repo}/pulls/{number}/comments | \
  jq '.[] | select(.user.login == "owner-username")'
```

**Look for:**
- `in_reply_to_id` matching bot comment IDs
- Phrases like "Applied in commit", "Fixed in", "Addressed"
- Commit SHAs referenced in responses

### 5. Verify Fixes Applied

**Check subsequent commits:**
```bash
# List commits after review
gh api repos/{owner}/{repo}/pulls/{number}/commits

# View specific commit that claims to fix issue
gh api repos/{owner}/{repo}/commits/{sha}
```

**Verification checklist:**
- [ ] Owner acknowledged each comment
- [ ] Commits reference the fixes
- [ ] File paths in commits match commented files
- [ ] No unresolved "changes requested" reviews

## Example Output Format

```markdown
## PR #79 Review Summary

**Status:** 4 findings, all resolved

**Reviewers:**
- gemini-code-assist[bot] (2 comments)
- codeant-ai[bot] (2 comments)

**Findings:**

| # | Severity | File | Issue | Status |
|---|----------|------|-------|--------|
| 1 | HIGH | GalleryClient.tsx:110 | Realtime merge broken | ✅ Fixed (cdff678) |
| 2 | MAJOR | GalleryClient.tsx:114 | Race condition | ✅ Fixed (cdff678) |
| 3 | MAJOR | view/route.ts:32 | View count race | ✅ Fixed (cdff678) |
| 4 | LOW | AdminAlertsBanner.tsx:126 | Stale alerts | ✅ Fixed (cdff678) |

**Owner Response:**
- All 4 findings addressed in commit cdff678
- Verification: tsc clean, eslint clean
- Status: Ready for merge
```

## Pitfalls

### Pitfall: Confusing comment types

**Issue:** Mixing up review comments (inline) vs issue comments (general)

**Solution:** Use correct API endpoints:
- `/pulls/{number}/comments` - Code review comments
- `/issues/{number}/comments` - General discussion
- `/pulls/{number}/reviews` - Review summaries

### Pitfall: Missing threaded replies

**Issue:** Not detecting owner responses in comment threads

**Solution:** Check `in_reply_to_id` field to build comment threads

### Pitfall: Assuming bot comments are always valid

**Issue:** Bot comments may be false positives

**Solution:** Always verify:
1. Owner's response (they may dispute the finding)
2. Subsequent commits (fix may already be applied)
3. Context (bot may have misunderstood the code)
