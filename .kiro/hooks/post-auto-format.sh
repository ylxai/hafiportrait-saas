#!/bin/bash
# PostToolUse: Auto-format TypeScript files after write via shell
# Runs after fs_write to auto-format .ts/.tsx files

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

# Only format TypeScript files
if [[ "$PATH_WRITTEN" == *.ts || "$PATH_WRITTEN" == *.tsx ]]; then
  cd /home/ubuntu/hafiportrait-saas
  echo "Auto-formatting: $PATH_WRITTEN"
  npx prettier --write "$PATH_WRITTEN" 2>/dev/null || true
fi

exit 0