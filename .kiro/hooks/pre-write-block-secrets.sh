#!/bin/bash
# PreToolUse fs_write: Block jika agent mencoba tulis secrets ke file
# Input: JSON via STDIN dengan tool_input.operations[].content
# Exit 2 = block tool, STDERR dikembalikan ke LLM

INPUT=$(cat)

CONTENT=$(echo "$INPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
ops = d.get('tool_input', {}).get('operations', [])
print(' '.join(str(o.get('content', '')) for o in ops))
" 2>/dev/null)

if [ -z "$CONTENT" ]; then
  exit 0
fi

# Patterns secrets yang dilarang
PATTERNS=(
  'ghp_[A-Za-z0-9]{36}'
  'github_pat_[A-Za-z0-9_]+'
  'CLOUDFLARE_API_TOKEN\s*=\s*[A-Za-z0-9_-]{30,}'
  'VPS_WEBHOOK_SECRET\s*=\s*\S+'
  'NEXTAUTH_SECRET\s*=\s*\S+'
  'DATABASE_URL\s*=\s*postgresql://[^@]+:[^@]+@'
  'ABLY_API_KEY\s*=\s*\S+'
)

for pattern in "${PATTERNS[@]}"; do
  if echo "$CONTENT" | grep -qP "$pattern" 2>/dev/null; then
    echo "BLOCKED: Secret/credential detected in file write. Remove it before writing." >&2
    echo "Use .env or .dev.vars for secrets — never commit to tracked files." >&2
    exit 2
  fi
done

exit 0
