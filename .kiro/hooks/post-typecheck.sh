#!/bin/bash
# PostToolUse: Run TypeScript typecheck after write
# Catches type errors immediately after file write

INPUT=$(cat)
PATH_WRITTEN=$(echo "$INPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
inp = d.get('tool_input', {})
path = inp.get('path', '')
print(path)
" 2>/dev/null)

if [[ -z "$PATH_WRITTEN" ]]; then
  exit 0
fi

# Only check TypeScript files
if [[ "$PATH_WRITTEN" == *.ts || "$PATH_WRITTEN" == *.tsx || "$PATH_WRITTEN" == *.tsx ]]; then
  cd /home/ubuntu/hafiportrait-saas
  # Quick typecheck — lebih cepat dari full build
  npx tsc --noEmit --skipLibCheck 2>&1 | head -15
fi

exit 0