#!/bin/bash
# PAI FileChanged - PostToolUse hook for config file monitoring
# Watches for changes to key config files and logs them
# Exit 0 always (observability only, never blocks)

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null)

# Only monitor write operations
if [[ "$TOOL_NAME" != "fs_write" && "$TOOL_NAME" != "write" ]]; then
  exit 0
fi

FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('path',''))" 2>/dev/null)

# Key files to watch
if echo "$FILE_PATH" | grep -qE "\.env$|\.env\.|settings\.json$|package\.json$|tsconfig\.json$|next\.config\.|prisma/schema\.prisma$"; then
  # Log the change for observability
  MEMORY_DIR="$HOME/.kiro/pai/MEMORY/OBSERVABILITY"
  mkdir -p "$MEMORY_DIR"
  
  TIMESTAMP=$(date -Iseconds)
  echo "{\"timestamp\":\"$TIMESTAMP\",\"event\":\"FileChanged\",\"file\":\"$FILE_PATH\"}" >> "$MEMORY_DIR/file-changes.jsonl"
  
  echo "[FileChanged] Config file modified: $FILE_PATH" >&2
fi

# Always allow - this is observability only
exit 0
