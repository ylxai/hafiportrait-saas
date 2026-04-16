#!/bin/bash
# PostToolUse @filesystem: Lint otomatis jika file .ts/.tsx ditulis via filesystem MCP

INPUT=$(cat)
PATH_WRITTEN=$(echo "$INPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
inp = d.get('tool_input', {})
# filesystem MCP write tool
path = inp.get('path', '')
print(path)
" 2>/dev/null)

if [[ "$PATH_WRITTEN" == *.ts || "$PATH_WRITTEN" == *.tsx ]]; then
  echo "TypeScript file modified via filesystem MCP: $PATH_WRITTEN"
  cd /home/eouser/web-saas && npx eslint "$PATH_WRITTEN" --max-warnings=0 2>&1 | tail -10
fi

exit 0
