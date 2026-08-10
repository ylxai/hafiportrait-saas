# Pre-Push Schema Tightening Risk Checks

When a code review bot (or your own instinct) wants you to tighten a runtime constraint on an environment-sourced value, there's a class of foot-gun where the change typechecks, builds, and looks better — but throws on server startup the next time the deploy runs against an environment where the variable was never set.

This reference exists because it almost happened in PR #104 (split-env-ts) and was caught by a pre-push verification step.

## The Risk Pattern

Any of these changes can break production startup if the env var isn't provisioned in every target environment:

| Change | Why it can break | Example |
|--------|------------------|---------|
| `.optional()` → required | Zod throws at module load when var is missing | `CLOUDFLARE_WORKER_URL: z.string().url()` |
| Remove `.default('...')` | Same — optional value becomes mandatory | Removed hardcoded fallback URL |
| Add `.min(N)` | Empty-string values that previously slipped through now throw | `z.string().min(1)` |
| Add `.url()` validator | Non-URL strings now throw | `z.string().url()` |
| Move `safeParse` from inside function to module top-level | Validation now runs at import time, not call time | `const env = parsed.data` at module level |

Common to all: the failure is at **startup**, before any HTTP handler runs. Vercel will mark the deployment as failed, but if you've already merged and the deploy is to production, every user gets a 500 until you revert or set the variable.

## Pre-Push Checklist

Before pushing a tightening change to a branch with an open PR:

1. **Identify which env vars the change affects.** Read the diff. Any `.optional()`, `.default()`, validator addition, or required field is a candidate.

2. **List provisioned vars in each target environment.**
   - Vercel: `vercel env ls production` and `vercel env ls preview`
   - Netlify: `netlify env:list --context production`
   - Fly.io: `fly secrets list`
   - GitHub Actions: check repository settings → Secrets and variables → Actions
   - Manual: read the deploy platform's dashboard

3. **For every variable the change makes mandatory, confirm it exists in every target.** If even one environment is missing it, the deploy will break startup.

4. **If a variable is missing, choose the safe pivot before pushing.**

## The Safe Pivot Decision Tree

When a tightening change targets a variable that's NOT provisioned everywhere:

```
Is the variable mandatory for the code paths that run in this environment?
│
├── YES — the code can't function without it
│   └── Provision the variable in the missing environment FIRST,
│       then push the schema tightening.
│
├── NO — code paths that need it never run here, OR fallback is acceptable
│   └── Keep the variable optional. Add an explicit runtime guard at the
│       call sites that need it:
│
│       if (!ENV_VAR) {
│         logQueueError('Missing ENV_VAR', new Error('ENV_VAR not set'));
│         return { success: false, error: 'Missing ENV_VAR' };
│       }
│
│       This trades startup-time validation for call-time validation, but
│       avoids the production-break risk.
│
└── UNSURE — you don't know whether the code path runs here
    └── Default to the optional + guard pattern. Failing soft is recoverable;
        failing at startup is not.
```

## Worked Example: PR #104 CLOUDFLARE_WORKER_URL

**The change:** A bot (Gemini) recommended making `CLOUDFLARE_WORKER_URL` required in the Zod schema, because "the variable is essential for background jobs and validation at startup catches config errors immediately."

**The trap:** The current schema had a hardcoded `.default('https://photostudio-deletion-worker.masipah1973.workers.dev')`. Another bot comment (correctly) flagged this as bad practice — bakes a personal subdomain into the production bundle. The fix to that comment was to remove the default and make the variable optional with `.url().optional()`. So the natural next step was to combine both fixes: remove default AND make required.

**What got caught at the pre-push step:**

```bash
$ vercel env ls production 2>&1 | grep -i "WORKER_URL"
NOT FOUND in production
```

`CLOUDFLARE_WORKER_URL` was never provisioned in Vercel. The hardcoded default in the old schema was the only reason production worked. Pushing the "required" change would have broken every deploy until someone manually added the env var.

**The safe pivot used:**

Instead of pushing immediately, the agent paused and offered three options to the user:

- **A.** Set the env var in Vercel first, then push the "required" change.
- **B.** Keep `.optional()`, add explicit runtime guards in `queueStorageDeletion()` and `queueThumbnailGeneration()` that fail fast with a clear error per call.
- **C.** Restore the hardcoded default URL (rejecting Gemini's other comment).

The pause for confirmation prevented a near-miss production break.

**The general principle:** When you're about to make a change that adds a startup-time precondition, run the verification command for the target environment FIRST. The 5 seconds it takes is nothing compared to the time it would take to triage a production startup loop.

## When You Can Skip the Check

The verification is overkill for:
- Adding a NEW field to the schema that wasn't referenced before (no existing call site can break)
- Tightening a field that's already required in production env (the variable is provisioned, just less validated)
- Local-only changes that won't deploy until a separate deploy step

It's REQUIRED for:
- Optional → required transitions
- Removing a `.default(...)` that production relied on
- Schema-level validators that would reject existing real-world values (e.g., adding `.url()` to a field that currently holds a hostname-only string)

## Related Anti-Patterns

- **Hardcoded production URLs as Zod defaults:** Bakes personal/team subdomains into every build. Production-environment-specific values belong in deploy platform env vars, not schema defaults.
- **Schema defaults for secrets:** Never. A schema default for an API key or token means anyone reading the source code knows the production fallback.
- **Mixing tightening + reorganization in one commit:** When a schema change rearranges modules AND tightens validation, it's hard to verify which change broke what if the deploy fails. Land the reorg first (preserving original validation), then tighten in a follow-up commit.
