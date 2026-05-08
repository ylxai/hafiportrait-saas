#!/bin/bash
# PreToolUse: Block destructive shell commands that could delete important files
# Exit 2 = block tool, STDERR dikembalikan ke LLM

INPUT=$(cat)
CMD=$(echo "$INPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
inp = d.get('tool_input', {})
print(inp.get('command', ''))
" 2>/dev/null)

if [ -z "$CMD" ]; then
  exit 0
fi

# Destructive patterns yang harus diwarnai
DESTRUCTIVE=(
  'rm\s+-rf\s+'
  'rmdir\s+'
  'mkfs\s+'
  'dd\s+if='
  ':>\s*\/dev\/sd'
  '>\s*\/proc\/'
  'chmod\s+-R\s+000'
)

for pattern in "${DESTRUCTIVE[@]}"; do
  if echo "$CMD" | grep -qE "$pattern" 2>/dev/null; then
    echo "WARNING: Destructive command detected: $CMD" >&2
    echo "Apakah Anda yakin? Konfirmasi dulu dengan user." >&2
    exit 0  # Warning only, tidak block — agent mungkin punya konteks
  fi
done

# Block langsung untuk operasi paling berbahaya
if echo "$CMD" | grep -qE 'rm\s+-rf\s+(\/|src|app|\.kiro|node_modules)' 2>/dev/null; then
  echo "BLOCKED: Tidak bisa hapus folder sistem." >&2
  exit 2
fi

exit 0