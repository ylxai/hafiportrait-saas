#!/bin/bash
# PAI ContainmentGuard - PreToolUse hook for sandbox enforcement
# Prevents operations outside project boundaries
# Exit 0 = allow, Exit 2 = block

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null)
TOOL_INPUT=$(echo "$INPUT" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin).get('tool_input',{})))" 2>/dev/null)

# Only check write/edit/bash operations
if [[ "$TOOL_NAME" != "fs_write" && "$TOOL_NAME" != "write" && "$TOOL_NAME" != "execute_bash" && "$TOOL_NAME" != "shell" ]]; then
  exit 0
fi

# Define allowed boundaries
PROJECT_ROOT=$(cd "$(dirname "$0")/../.." && pwd)
ALLOWED_PATHS=(
  "$PROJECT_ROOT"
  "$HOME/.kiro"
  "$HOME/.claude"
  "/tmp"
  "/var/tmp"
)

# Extract target path
TARGET_PATH=""
if [[ "$TOOL_NAME" == "fs_write" || "$TOOL_NAME" == "write" ]]; then
  TARGET_PATH=$(echo "$TOOL_INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('path',''))" 2>/dev/null)
  
  # Resolve to absolute path
  if [[ "$TARGET_PATH" == "~"* ]]; then
    TARGET_PATH="${TARGET_PATH/#\~/$HOME}"
  fi
  
  # Check if within allowed boundaries
  ALLOWED=0
  for allowed in "${ALLOWED_PATHS[@]}"; do
    if [[ "$TARGET_PATH" == "$allowed"* ]]; then
      ALLOWED=1
      break
    fi
  done
  
  if [ $ALLOWED -eq 0 ]; then
    echo "🚨 BLOCKED: Write outside project boundaries" >&2
    echo "Target: $TARGET_PATH" >&2
    echo "Allowed paths: ${ALLOWED_PATHS[*]}" >&2
    exit 2
  fi
  
elif [[ "$TOOL_NAME" == "execute_bash" || "$TOOL_NAME" == "shell" ]]; then
  COMMAND=$(echo "$TOOL_INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('command',''))" 2>/dev/null)
  
  # Block operations on critical system paths
  if echo "$COMMAND" | grep -qE "rm.*(/etc|/usr|/bin|/sbin|/boot|/sys|/proc)"; then
    echo "🚨 BLOCKED: Operation on system directory" >&2
    exit 2
  fi
  
  # Block operations outside HOME
  if echo "$COMMAND" | grep -qE "cd\s+/[^h]|cd\s+/home/[^u]"; then
    echo "⚠️  WARNING: Command navigates outside HOME" >&2
    # Allow but warn
  fi
fi

# All checks passed
exit 0
