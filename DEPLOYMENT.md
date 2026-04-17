# Deployment Guide - PhotoStudio SaaS

## VPS Deployment

### Required Cron Jobs

#### 1. Upload Session Cleanup (Hourly)
Cleans up expired upload sessions from database.

**Setup Linux Cron:**
```bash
# Edit crontab
crontab -e

# Add this line (runs every hour)
0 * * * * curl -X POST http://localhost:3000/api/admin/upload/cleanup \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

**Environment Variable:**
Add to `.env`:
```env
CRON_SECRET=your-secure-random-string-here
```

Generate secure secret:
```bash
openssl rand -base64 32
```

---

## Vercel Deployment

### Cron Jobs Configuration

Create `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/admin/upload/cleanup",
      "schedule": "0 * * * *"
    }
  ]
}
```

**Environment Variable:**
Add `CRON_SECRET` to Vercel environment variables.

---

#### 2. Storage Account Key Rotation (Daily)
Automatically rotates credentials for accounts with `rotationEnabled=true` and `rotationNextDate <= now`.

Uses the same `VPS_WEBHOOK_SECRET` (no extra env variable needed).

**Setup Linux Cron:**
```bash
crontab -e

# Add this line (runs daily at 00:05 UTC)
5 0 * * * curl -X POST http://localhost:3000/api/admin/storage-accounts/rotation/cron \
  -H "Authorization: Bearer YOUR_VPS_WEBHOOK_SECRET" \
  -H "Content-Type: application/json"
```

**Setup Vercel Cron** — add to `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/admin/upload/cleanup",                       "schedule": "0 * * * *" },
    { "path": "/api/admin/storage-accounts/rotation/cron",       "schedule": "5 0 * * *" }
  ]
}
```

**Required env:**
```env
VPS_WEBHOOK_SECRET=your-secure-webhook-secret  # already required for webhooks
```

**How rotation works:**
1. Admin sets secondary credentials via Storage UI → Key Rotation → "Set Secondary Credentials"
2. Admin enables auto-rotation schedule (daily / weekly / monthly)
3. Cron calls `/api/admin/storage-accounts/rotation/cron` daily
4. If `rotationNextDate <= now`, secondary is promoted to primary atomically
5. Rotation history is logged (last 20 entries per account)

**Manual rotation:** Available anytime via Storage UI → Key Rotation → "Rotasi Sekarang"

---

## Testing Cleanup Endpoint

```bash
# Test cleanup manually
curl -X POST http://localhost:3000/api/admin/upload/cleanup \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"

# Expected response:
# {"success":true,"data":{"deleted":5,"timestamp":"2026-04-16T16:30:00.000Z"}}
```
