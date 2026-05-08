#!/bin/bash
# AgentSpawn hook: Inject project context saat agent pertama aktif
# Output ke STDOUT akan ditambahkan ke context agent
# Input: JSON via STDIN (hook_event_name, cwd, session_id)

INPUT=$(cat)
CWD=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('cwd',''))" 2>/dev/null)

# Hanya inject jika bekerja di project hafiportrait-saas
if [[ "$CWD" != "/home/ubuntu/hafiportrait-saas"* ]]; then
  exit 0
fi

cat << 'EOF'
=== PhotoStudio SaaS — Active Project Context ===
Path: /home/ubuntu/hafiportrait-saas
Stack: Next.js 15.4.11, TypeScript strict, Tailwind v4, Prisma+PostgreSQL, Cloudflare R2, Cloudinary, Ably

CRITICAL RULES (must follow every response):
1. Route params/searchParams MUST be awaited — Next.js 15 breaking change
2. BigInt fields MUST be .toString() in all API responses
3. Storage credentials from DB (StorageAccount table), NOT .env
4. Background jobs via Cloudflare Queues ONLY — no BullMQ/PM2/Redis
5. All /api/admin/* routes MUST call getServerSession() at top
6. Use sonner toast(), NEVER alert()
7. Tailwind v4 OKLCH semantic colors only — no amber-500, gray-800
8. Validate all inputs with Zod — including date fields
9. Handle Prisma P2025 → return 404
10. Pagination: Math.min(limit, 100), parseInt(value, 10)

Verify before commit: npm run lint && npm run build
EOF
