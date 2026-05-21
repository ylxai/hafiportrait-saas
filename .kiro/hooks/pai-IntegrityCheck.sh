#!/bin/bash
# PAI IntegrityCheck - Stop hook for basic file integrity validation
# Simplified version: checks for common file corruption patterns
# Exit 0 always (observability only, never blocks)

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id','unknown'))" 2>/dev/null)

# Check critical project files for basic integrity
PROJECT_ROOT=$(cd "$(dirname "$0")/../.." && pwd)

check_json_integrity() {
  local file="$1"
  if [ -f "$file" ]; then
    if ! python3 -c "import json; json.load(open('$file'))" 2>/dev/null; then
      echo "[IntegrityCheck] ⚠️ JSON syntax error in: $file" >&2
      return 1
    fi
  fi
  return 0
}

# Check package.json
check_json_integrity "$PROJECT_ROOT/package.json"

# Check tsconfig.json
check_json_integrity "$PROJECT_ROOT/tsconfig.json"

# Check .env files exist (don't read content for security)
if [ ! -f "$PROJECT_ROOT/.env" ] && [ ! -f "$PROJECT_ROOT/.env.local" ]; then
  echo "[IntegrityCheck] ⚠️ No .env file found" >&2
fi

# Log integrity check completion
MEMORY_DIR="$HOME/.kiro/pai/MEMORY/OBSERVABILITY"
mkdir -p "$MEMORY_DIR"
TIMESTAMP=$(date -Iseconds)
echo "{\"timestamp\":\"$TIMESTAMP\",\"event\":\"IntegrityCheck\",\"session_id\":\"$SESSION_ID\",\"status\":\"completed\"}" >> "$MEMORY_DIR/integrity-checks.jsonl"

exit 0
