# Bot Review Trigger Commands

When fixing bot review issues, you must trigger re-review after pushing fixes.

## Trigger Commands (comment on PR)

```
/gemini review
@sourcery-ai review
@codeant-ai review
```

Post as **separate comments** — one per bot. Do NOT combine into one comment.

## Active Bots (2026-05-26)

| Bot | Trigger | Notes |
|-----|---------|-------|
| Gemini | `/gemini review` | Reliable, re-reviews on new commits |
| Sourcery-AI | `@sourcery-ai review` | Sometimes doesn't re-review — see below |
| CodeAnt-AI | skip re-trigger | Noisy, stale comments persist |
| **gitar-bot** | auto-only | New bot (appeared PR #128). Auto-approves PRs. No manual trigger needed. Its APPROVED state counts toward merge readiness. |

**gitar-bot behavior:** Posts empty-body COMMENTED reviews then a final APPROVED review. Ignore the empty reviews — only the APPROVED state matters. It reviewed commit `9bb5784` on PR #128 and auto-approved.

## Timing

- Bots typically respond within 1-2 minutes after comment
- Wait for Vercel deployment SUCCESS before triggering (bots may check deploy status)
- After triggering, wait ~2 minutes then check `get_pull_request_reviews`

## Identifying Stale vs Fresh Reviews

- Check `commit_id` field in each review
- If `commit_id` matches your latest push SHA → fresh review (address issues)
- If `commit_id` is an older SHA → stale review (issues already addressed)

## Example Comment Format

```markdown
/gemini review
@sourcery-ai review
@codeant-ai review

**Changes in latest commit (abc1234):**
1. ✅ Fixed issue X
2. ✅ Fixed issue Y
3. ✅ Fixed issue Z
```

Including a summary helps bots and human reviewers understand what changed.

## When Bots Don't Re-review

Some bots only review once per PR or only on new pushes (not comment triggers).
If no new review appears after 3 minutes:
- Check if the bot reviewed the latest commit already
- If only old-commit reviews exist and issues are fixed, safe to merge
- CodeAnt-AI sometimes doesn't re-review; verify fixes manually
