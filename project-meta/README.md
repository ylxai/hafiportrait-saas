# PhotoStudio SaaS Project Meta

> Master directory for all AI agents working on this project.
> Read **01-core.md** first, then dive into specific topics as needed.

---

## Quick Navigation

| File | Topic | Lines | Read When You Need To... |
|---|---|---|---|
| [**01-core.md**](01-core.md) | Project Identity, Tech Stack, Architecture, File Structure | 146 | Understand the project at a glance |
| [**02-database-storage.md**](02-database-storage.md) | Database Schema, Storage Architecture, BigInt, Known Data Issues | 145 | Work with data, storage, or database |
| [**03-auth-security.md**](03-auth-security.md) | Auth Flow, Role System, Middleware, Route Guards, Webhooks | 171 | Implement auth, security, or access control |
| [**04-api-conventions.md**](04-api-conventions.md) | Route Pattern, Validation, Response Helpers, Prisma Errors, Logger | 200 | Build API routes or handle errors |
| [**05-ui-conventions.md**](05-ui-conventions.md) | Color System, Component Patterns, Client/Server Rules, Forbiddens | 135 | Build UI components or pages |
| [**06-environment-config.md**](06-environment-config.md) | .env, Vercel Config, Scripts, MCP Tools | 119 | Deploy, configure, or run commands |
| [**07-utilities.md**](07-utilities.md) | Response Helpers, Validation, Constants, Hooks, Rate Limit | 183 | Use shared utilities or helpers |
| [**08-known-issues.md**](08-known-issues.md) | Production Bugs, Symptoms, Debug Playbook | 146 | Debug production issues |

---

## Critical Reminders (TL;DR)

### Before You Do Anything
1. **Build first**: `npm run lint && npm run build` — must pass
2. **Never use `any`**: Strict TypeScript — use `unknown` or specific types
3. **Validate everything**: Zod schemas for ALL API inputs
4. **No static Tailwind colors**: Semantic OKLCH tokens only
5. **Storage credentials in DB**: NOT `.env` — always use `StorageAccount` table
6. **BigInt = danger**: Always use `serializeBigInt()` or `successResponse()` for JSON
7. **Auth guards required**: `requireAdminAuth()` or `requireClientAuth()` for ALL internal routes
8. **Console vs Logger**: 
   - Server/API code → `logger` (from `@/lib/logger`)
   - Browser/Edge code → `console` (logger needs `node:async_hooks`)

### If You See Production Issues
1. Check **08-known-issues.md** first
2. Gallery crash → likely Next.js 15 params issue or data structure mismatch
3. Cloudinary 0.0 KB → upload complete flow missing StorageAccount update
4. "Terjadi Kesalahan" → check browser console + network + Vercel logs

---

## Status (as of 2026-06-05)

- ✅ Fresh codebase audit completed (2026-06-03)
- ✅ 6 PRs merged (#158-163) covering PII, types, mobile UI, auth tests
- ✅ Gallery error handling added but root cause NOT yet identified
- ⚠️ Cloudinary `usedStorage` = 0.0 KB still broken
- ⚠️ Gallery "Kelola" crash still occurring in production

