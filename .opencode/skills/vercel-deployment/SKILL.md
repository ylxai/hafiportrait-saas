---
name: vercel-deployment
description: Vercel deployment workflow
license: MIT
compatibility: opencode
---

# Vercel Deployment

## Deployment Commands
```bash
# Build locally first
npm run build

# Deploy to preview
vercel

# Deploy to production
vercel --prod

# Check logs
vercel logs hafiportrait-saas
```

## Environment Variables
Set in Vercel Dashboard > Settings > Environment Variables:
- DATABASE_URL
- NEXTAUTH_SECRET
- NEXTAUTH_URL
- CLOUDFLARE_API_TOKEN
- ABLY_API_KEY
- VPS_WEBHOOK_SECRET

## Pre-deployment Checklist
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] Database schema up to date
- [ ] Environment variables configured

## CI/CD
- GitHub Actions in .github/workflows/
- Auto-deploys on push to main
- Runs lint + build tests