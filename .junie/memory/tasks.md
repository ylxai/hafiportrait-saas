# Standard Operating Procedures (SOP)

## Feature Implementation & Fix Workflow
When instructed to implement a new feature or fix a bug, the agent **MUST** follow this strict sequence:
1. **Branching**: Always create a new branch if not already on one. Naming convention: `feature/your-feature-name` or `fix/your-bug-name`.
2. **Implementation**: Write the code, ensuring strict ESLint (`no-any`) and TypeScript compliance.
3. **Commit**: Stage changes (`git add .`) and commit using conventional commits (include `Co-authored-by: Junie <junie@jetbrains.com>` trailer).
4. **Push**: Push the branch to the remote repository.
5. **Pull Request**: Open a new Pull Request (PR) using the GitHub MCP.
6. **Review**: Wait for the PR to be reviewed (e.g., by Gemini Code Assist or the User). Fix any review comments before merging.
7. **Memory Update**: Always update `.junie/memory/errors.md` and `.junie/memory/tasks.md` with new findings, rules, or references encountered during the session so they are remembered across sessions.

## 8. Prisma Schema Update SOP
Whenever `prisma/schema.prisma` is modified (e.g., adding an `UploadSession` table):
1. **Push schema**: Run `npx prisma db push`.
2. **Generate client**: Run `npx prisma generate`.
3. Do this BEFORE testing any code to avoid `PrismaClient is not defined` errors.

## 9. Gemini Code Assist PR Review SOP
When opening a new Pull Request:
1. **DO NOT** merge it immediately.
2. Wait for the Gemini Code Assist review bot.
3. Fix any high/medium priority suggestions.
4. Reply to the bot's comments (to mark the thread as resolved).
5. Trigger another review using `/gemini review` if necessary before merging.

---

## TODO FROM CODEBASE AUDIT (April 2026)

### Immediate Fixes (Do First)
- [ ] Fix Button Component colors - ganti ke semantic OKLCH tokens
- [ ] Fix Stats API route - gunakan helper functions
- [ ] Fix Clients page data access pattern - konsisten dengan Events page
- [ ] Add BigInt serialization di Stats route

### Short-term (This Week)
- [ ] Fix middleware matcher - tambahkan /api/admin/*
- [ ] Upgrade TypeScript target ke ES2022
- [ ] Remove ioredis dari dependencies
- [ ] Remove unused Prisma import dari cloudflare-queue.ts
- [ ] Implement pagination di Clients page
- [ ] Add rate limiting middleware

### Long-term (This Month)
- [ ] Fix Cloudflare Worker type imports
- [ ] Ganti console.log dengan structured logging
- [ ] Fix ESLint suppression di Events page
- [ ] Fix Dashboard hardcoded colors
- [ ] Implement caching layer
- [ ] Add monitoring/observability tools