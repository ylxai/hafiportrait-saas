# Incremental PR Strategy

> **Pattern:** Create PRs with partial implementation + documentation, allowing review and merge before completion.

## When to Use

- Large refactoring or feature work (estimated >3 hours)
- Infrastructure changes that can be validated independently
- User wants to review approach before full implementation
- Work can be safely deployed incrementally without breaking existing functionality

## Anti-Pattern to Avoid

❌ **Don't wait for 100% completion before creating PR**
- Delays feedback loop
- Increases merge conflict risk
- Makes review harder (large diffs)
- Blocks parallel work

## Pattern: Infrastructure First

### Step 1: Implement Core Infrastructure

**What to include:**
- Core abstractions, utilities, or configuration
- 2-3 example implementations showing the pattern
- Comprehensive documentation explaining:
  - What's implemented (with examples)
  - What's remaining (with estimates)
  - Implementation pattern for remaining work
  - Testing approach

**Example from rate-limiting implementation:**
```
✅ Implemented:
- Bypass logic (Vercel preview + emergency override)
- Rate limit constants (ADMIN_READ, ADMIN_WRITE, STATS)
- 3 routes as reference examples

⏳ Remaining:
- 8 routes, 21 methods (~3 hours)
- Documented in docs/RATE-LIMITING-IMPLEMENTATION.md
```

### Step 2: Create PR with Clear Status

**PR Title Format:**
```
feat: <feature-name> (<status>)

Examples:
- feat: Add rate limiting to admin routes (partial)
- refactor: Migrate to new auth system (infrastructure)
- feat: Implement caching layer (phase 1/3)
```

**PR Body Structure:**
```markdown
## 🎯 Objective
[What problem this solves]

**Status:** [Partial implementation | Infrastructure only | Phase N/M]

---

## ✅ What's Implemented
[Detailed list with examples]

---

## ⏳ Remaining Work
[Table with estimates]

---

## 🧪 Testing
[How to test what's implemented]

---

## 📝 Implementation Pattern
[Code example showing the pattern]

---

## 🚀 Next Steps
[Options for proceeding]
```

### Step 3: Present Merge Options

Always give user 3 options:

**Option 1: Review Infrastructure First** (Recommended)
- Merge infrastructure + examples
- Validate approach in production
- Continue remaining work in separate PR

**Option 2: Complete All Work**
- Continue implementation (~X hours)
- Merge when 100% complete

**Option 3: Incremental Merge**
- Merge now (safe, backward-compatible)
- Remaining work continues in background
- No breaking changes

### Step 4: Documentation is Critical

**Must include:**
- `docs/<FEATURE>-IMPLEMENTATION.md` with:
  - Status table (completed vs remaining)
  - Implementation pattern with code examples
  - Testing instructions
  - Next steps

**Why documentation matters:**
- Future you (or another agent) can continue the work
- User can review approach without reading all code
- Clear handoff if work is paused

## Real-World Example: Rate Limiting PR #99

### Context
- Task: Add rate limiting to 11 admin routes
- Estimate: 4-6 hours total
- User preference: Review approach before full implementation

### What Was Done

**Commit 1: Infrastructure**
```
feat: add rate limiting infrastructure and partial implementation

- Add Vercel preview bypass logic
- Add emergency override with DISABLE_RATE_LIMIT env var
- Add new rate limit constants
- Implement 3 routes as examples
```

**Commit 2: Documentation**
```
docs: add rate limiting implementation guide

- Document completed routes (3/11)
- List remaining routes (8 routes, 21 methods)
- Provide implementation pattern
- Explain bypass logic
```

**PR Body:**
- Clear status: "Partial implementation (3/11 routes)"
- Infrastructure section: bypass logic + constants
- Remaining work table with estimates
- 3 merge options presented
- Link to detailed documentation

### Why This Worked

✅ **User got early feedback** on bypass logic approach
✅ **Infrastructure validated** before investing 3 more hours
✅ **Clear handoff** via documentation
✅ **Safe to merge** - no breaking changes
✅ **Parallel work possible** - user can review while agent continues

## Pattern: Vercel Environment-Based Feature Flags

When implementing features that need different behavior in preview vs production:

```typescript
// Infrastructure pattern
if (process.env.VERCEL_ENV === 'preview') {
  // Development/testing behavior
  return bypassedResult;
}

if (process.env.EMERGENCY_OVERRIDE === 'true') {
  logger.warn('feature.bypass', { reason: 'EMERGENCY_OVERRIDE=true' });
  return bypassedResult;
}

// Production behavior
return normalResult;
```

**Benefits:**
- No code changes needed to toggle behavior
- Preview deployments automatically use dev mode
- Emergency override available via env var
- Structured logging for audit trail

## Pitfalls

### ❌ Pitfall: "Almost Done" Syndrome

**Symptom:** Spending 2+ hours trying to complete remaining work before creating PR.

**Fix:** Create PR after infrastructure + 2-3 examples, even if 70% remains.

### ❌ Pitfall: Incomplete Documentation

**Symptom:** PR description says "partial implementation" but doesn't explain what's done or what remains.

**Fix:** Always include:
- Status table (✅ done vs ⏳ remaining)
- Estimates for remaining work
- Implementation pattern with code example

### ❌ Pitfall: No Merge Options

**Symptom:** Creating PR but not explaining when/how it should be merged.

**Fix:** Always present 3 options (review first, complete all, incremental merge) with recommendation.

### ❌ Pitfall: Breaking Changes in Partial PR

**Symptom:** Partial implementation breaks existing functionality.

**Fix:** Infrastructure PRs must be backward-compatible. New behavior should be:
- Opt-in (feature flag, env var)
- Additive (doesn't change existing behavior)
- Safe to deploy (no runtime errors if incomplete)

## Checklist for Incremental PRs

Before creating PR:
- [ ] Infrastructure is complete and testable
- [ ] 2-3 example implementations included
- [ ] Documentation file created with status table
- [ ] Implementation pattern documented with code example
- [ ] Remaining work estimated
- [ ] PR body includes 3 merge options
- [ ] Changes are backward-compatible
- [ ] Tests pass for implemented portion

## Related Patterns

- **Feature Flags:** Use env vars for preview vs production behavior
- **Additive Changes:** New code doesn't modify existing behavior
- **Documentation-Driven:** Write docs before completing implementation
- **Example-Driven:** Show pattern with 2-3 examples, not all cases
