#!/bin/bash
# PAI SmartApprover - PermissionRequest hook for smart approval
# Auto-approves operations in trusted workspace paths
# Exit 0 = allow, requires user approval otherwise

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null)
TOOL_INPUT=$(echo "$INPUT" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin).get('tool_input',{})))" 2>/dev/null)

# Only handle write/edit/bash operations
if [[ "$TOOL_NAME" != "fs_write" && "$TOOL_NAME" != "write" && "$TOOL_NAME" != "execute_bash" && "$TOOL_NAME" != "shell" ]]; then
  exit 0
fi

# Define trusted workspace paths
PROJECT_ROOT=$(cd "$(dirname "$0")/../.." && pwd)
TRUSTED_PATHS=(
  "$PROJECT_ROOT"
  "$HOME/.kiro"
  "$HOME/.claude"
  "$HOME/Projects"
  "/tmp"
)

# Extract target path
TARGET_PATH=""
if [[ "$TOOL_NAME" == "fs_write" || "$TOOL_NAME" == "write" ]]; then
  TARGET_PATH=$(echo "$TOOL_INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('path',''))" 2>/dev/null)
elif [[ "$TOOL_NAME" == "execute_bash" || "$TOOL_NAME" == "shell" ]]; then
  COMMAND=$(echo "$TOOL_INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('command',''))" 2>/dev/null)
  
  # Check if bash command targets trusted paths
  for trusted in "${TRUSTED_PATHS[@]}"; do
    if echo "$COMMAND" | grep -q "$trusted"; then
      # Auto-approve bash in trusted workspace
      exit 0
    fi
  done
  
  # Bash outside trusted paths - let user decide
  exit 0
fi

# Check if target path is in trusted workspace
for trusted in "${TRUSTED_PATHS[@]}"; do
  if [[ "$TARGET_PATH" == "$trusted"* ]]; then
    # Auto-approve write in trusted workspace
    exit 0
  fi
done

# Path outside trusted workspace - let user decide (default behavior)
exit 0
