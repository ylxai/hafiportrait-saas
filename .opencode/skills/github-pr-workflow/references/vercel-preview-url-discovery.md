# Vercel Preview URL Discovery

> How to find the preview URL for a Vercel deployment from a GitHub PR.

## Method 1: Vercel Bot Comment (Most Reliable)

The Vercel GitHub bot posts a comment on every PR with the preview URL. Extract it:

```bash
gh api repos/<owner>/<repo>/issues/<PR_NUMBER>/comments --jq \
  '.[] | select(.user.login == "vercel[bot]") | .body'
```

Then grep for the URL pattern:

```bash
gh api repos/owner/repo/issues/123/comments --jq \
  '.[] | select(.user.login == "vercel[bot]") | .body' \
  | grep -oP 'https://[a-z0-9-]+\.vercel\.app'
```

The URL format is:
```
https://<project-name>-git-<branch-name>-<owner>.vercel.app
```

For branches with slashes (e.g. `fix/gallery-crash`), slashes become dashes:
```
https://hafiportrait-saas-git-fix-gallery-crash-ylxais-projects.vercel.app
```

## Method 2: GitHub Status Check

```bash
gh pr view <N> --json statusCheckRollup --jq \
  '.statusCheckRollup[] | select(.name == "Vercel" or .context == "Vercel") | .targetUrl'
```

This returns a Vercel dashboard URL, not the preview URL directly. Navigate to the dashboard URL to see the preview deployment.

## Method 3: Vercel CLI (Requires Auth)

```bash
# List deployments with branch info
npx vercel ls --limit 50 2>&1 | grep "<branch-name>"
```

## Vercel SSO Bypass

Preview deployments are behind Vercel's SSO/Deployment Protection. To access them from automated testing:

### Query Parameter Method
```bash
https://<preview-url>/path?x-vercel-protection-bypass=<secret>&x-vercel-set-bypass-cookie=true
```

### Cookie Method (For browser automation)
```javascript
await page.context().addCookies([
  {
    name: 'x-vercel-protection-bypass',
    value: '<bypass-secret>',
    domain: '.vercel.app',
    path: '/'
  }
]);
```

**Note:** The `x-vercel-set-bypass-cookie=true` query parameter sets the bypass cookie for the session. Without it, requests redirect to Vercel SSO login.

**Important:** The bypass secret only works for preview deployments, NOT production.

## Complete Testing Pattern

```bash
# 1. Get preview URL from Vercel bot comment
PREVIEW=$(gh api repos/owner/repo/issues/167/comments --jq \
  '.[] | select(.user.login == "vercel[bot]") | .body' \
  | grep -oP 'https://[a-z0-9-]+\.vercel\.app' | head -1)

# 2. Start Kernel browser session
SESSION=$(kernel browsers create -o json | jq -r .session_id)

# 3. Navigate with bypass
BYPASS="rrl1yNdMMWQMg95VEmHDQ09fvtGIRSeD"
kernel browsers playwright execute $SESSION "
  await page.goto('${PREVIEW}/login?x-vercel-protection-bypass=${BYPASS}&x-vercel-set-bypass-cookie=true');
  // ... test logic
"

# 4. Cleanup
kernel browsers delete $SESSION
```
