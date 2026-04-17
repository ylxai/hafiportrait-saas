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

## Testing Cleanup Endpoint

```bash
# Test cleanup manually
curl -X POST http://localhost:3000/api/admin/upload/cleanup \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"

# Expected response:
# {"success":true,"data":{"deleted":5,"timestamp":"2026-04-16T16:30:00.000Z"}}
```
