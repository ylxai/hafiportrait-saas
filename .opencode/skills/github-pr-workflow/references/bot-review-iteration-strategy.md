# Bot Review Iteration Strategy

## Pattern: When to Stop Iterating on Bot Feedback

**Session:** 2026-05-23 (PR #99 rate limiting implementation)

### The Infinite Review Loop Problem

Bot reviews can create an infinite loop:
1. Fix issues from Round 1 → push commit
2. Bots review Round 2 → find new suggestions (often code quality)
3. Fix Round 2 → push commit
4. Bots review Round 3 → find more suggestions
5. **Loop continues indefinitely**

### User Preference: Two-Round Strategy

**From this session:**

**Round 1 (14 issues):**
- 🔴 Critical: 1 (PII leakage)
- 🟠 High: 3 (bugs, docs)
- 🟡 Medium: 5 (API patterns)
- 🟢 Low: 5 (code org)
- **Action:** Fixed ALL 14 issues in 2 commits
- **Result:** Vercel SUCCESS, merged to main

**Round 2 (2 issues):**
- 🟡 Medium: 2 (extract helper, log throttling)
- **Action:** Merge PR #99, address in separate PR #100
- **Rationale:** Working code > perfect code stuck in review

### Decision Framework

| Scenario | Action | Rationale |
|----------|--------|-----------|
| **Round 1: Critical/High issues** | Fix all before merge | Security, correctness, must-fix |
| **Round 1: Medium/Low issues** | Fix all in same PR | User preference: comprehensive fix |
| **Round 2: New Medium/Low issues** | Merge, fix in next PR | Avoid infinite loop, working code merged |
| **Round 2: New Critical/High issues** | Fix before merge | Security/correctness always blocks |
| **Round 3+** | Stop iterating | Diminishing returns |

### When Bot Suggestions Are Actually Blockers

**Always fix before merge:**
- 🔴 Security vulnerabilities (PII leakage, SQL injection, XSS)
- 🔴 Data loss risks (missing validation, race conditions)
- 🟠 Correctness bugs (wrong calculations, logic errors)
- 🟠 Breaking API changes without migration path

**Can defer to next PR:**
- 🟡 Code duplication (DRY violations)
- 🟡 Performance optimizations (unless critical path)
- 🟢 Code style (naming, formatting)
- 🟢 Documentation improvements
- 🟢 Test coverage suggestions

### Example: PR #99 Round 2 Decision

**Bot feedback (Sourcery-AI):**
1. Extract `enforceRateLimit()` helper (Medium)
2. Add log throttling for `DISABLE_RATE_LIMIT` (Medium)

**Analysis:**
- ✅ PR #99 already fixed 14 issues (all priorities)
- ✅ Vercel deployment SUCCESS
- ✅ Rate limiting verified working in preview
- ✅ 3 routes protected with consistent pattern
- 🟡 New suggestions are code quality, not bugs

**Decision:**
```
User: "merge dan lanjut fix helper yang gagal tadi"
Translation: Merge now, fix helper in next PR
```

**Outcome:**
- PR #99 merged successfully
- PR #100 created for refactor
- No functionality blocked
- Clean git history (feature + refactor separated)

### Communication Pattern

When presenting Round 2+ bot feedback to user:

```markdown
## 🆕 Bot Reviews Terbaru (Round 2)

**Status:** 2 issues (Medium priority)

1. 🟡 Code Duplication - Extract helper
2. 🟡 Log Flooding - Add throttling

**Analysis:**
- ✅ All Round 1 issues fixed (14/14)
- ✅ Vercel deployment SUCCESS
- ✅ Functionality verified working
- 🟡 New issues are code quality improvements

**Recommendation:**
- **Option 1:** Merge PR now, fix in PR #100 (avoid infinite loop)
- **Option 2:** Fix now, risk Round 3 reviews

Mau merge sekarang atau fix dulu?
```

### Anti-Pattern: Perfectionism Trap

**Don't do this:**
```
Round 1: Fix 14 issues → push
Round 2: Fix 2 issues → push
Round 3: Fix 1 issue → push
Round 4: Fix 1 issue → push
[PR still not merged after 2 weeks]
```

**Do this instead:**
```
Round 1: Fix all Critical+High+Medium+Low → push → merge
Round 2: New suggestions → create new PR
[Feature merged in 1 day, refactor in progress]
```

### Vercel Deployment as Gate

**Always verify Vercel SUCCESS before merge:**
```bash
# After each commit
git push origin <branch>
sleep 90  # Wait for Vercel
gh pr checks  # or curl API

# Only merge when:
# ✅ Vercel deployment: SUCCESS
# ✅ Critical/High issues: FIXED
# ✅ Medium/Low issues: FIXED (Round 1) or DEFERRED (Round 2+)
```

### Related Patterns

- See `references/bot-review-comprehensive-fix.md` for Round 1 comprehensive fix strategy
- See `references/vercel-build-transient-failures.md` for handling build issues during iteration
- See main SKILL.md Section 7 for bot review workflow
