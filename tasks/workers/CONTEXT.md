# Cloudflare Workers Tasks — Context

**Last Updated:** 2026-04-17
**Status:** Active
**Next Task ID:** WRK-001

---

## Current State

This task area manages Cloudflare Edge Workers and Queue processing for PhotoStudio SaaS. Background jobs are handled here instead of traditional worker processes.

---

## Key Files

| Category | Path |
|----------|------|
| Edge Workers| `workers/` |
| Queue Pub | `src/lib/cloudflare-queue.ts` |
| Webhooks | `src/app/api/webhook/` |
