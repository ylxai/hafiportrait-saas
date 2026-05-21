#!/bin/bash
# PAI SecurityPipeline - Simplified shell version
# PreToolUse hook: Block dangerous operations
# Exit 0 = allow, Exit 2 = block (STDERR returned to LLM)

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null)
TOOL_INPUT=$(echo "$INPUT" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin).get('tool_input',{})))" 2>/dev/null)

# Only inspect bash/shell commands and write operations
if [[ "$TOOL_NAME" != "execute_bash" && "$TOOL_NAME" != "shell" && "$TOOL_NAME" != "fs_write" && "$TOOL_NAME" != "write" ]]; then
  exit 0
fi

# Extract command for bash tools
if [[ "$TOOL_NAME" == "execute_bash" || "$TOOL_NAME" == "shell" ]]; then
  COMMAND=$(echo "$TOOL_INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('command',''))" 2>/dev/null)
  
  # CRITICAL: Block destructive commands
  if echo "$COMMAND" | grep -qE "rm\s+-rf\s+/|rm\s+-rf\s+~|rm\s+-rf\s+\*"; then
    echo "🚨 BLOCKED: Dangerous recursive delete detected" >&2
    echo "Command attempted: $COMMAND" >&2
    exit 2
  fi
  
  if echo "$COMMAND" | grep -qE "dd\s+if=.*of=/dev/|mkfs|fdisk|parted"; then
    echo "🚨 BLOCKED: Disk operation detected" >&2
    exit 2
  fi
  
  if echo "$COMMAND" | grep -qE "curl.*\|.*bash|wget.*\|.*sh|curl.*\|.*sh"; then
    echo "🚨 BLOCKED: Pipe to shell from remote source" >&2
    exit 2
  fi
  
  if echo "$COMMAND" | grep -qE "chmod\s+777|chmod\s+-R\s+777"; then
    echo "⚠️  WARNING: chmod 777 detected - insecure permissions" >&2
    # Allow but warn
  fi
  
  if echo "$COMMAND" | grep -qE ">/dev/null.*2>&1.*&$"; then
    echo "⚠️  WARNING: Background process with suppressed output" >&2
    # Allow but warn
  fi
fi

# Extract path for write operations
if [[ "$TOOL_NAME" == "fs_write" || "$TOOL_NAME" == "write" ]]; then
  WRITE_PATH=$(echo "$TOOL_INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('path',''))" 2>/dev/null)
  
  # Block writes to critical system paths
  if echo "$WRITE_PATH" | grep -qE "^/etc/|^/usr/|^/bin/|^/sbin/|^/boot/"; then
    echo "🚨 BLOCKED: Write to system directory" >&2
    echo "Path: $WRITE_PATH" >&2
    exit 2
  fi
  
  # Block writes to SSH keys
  if echo "$WRITE_PATH" | grep -qE "\.ssh/id_|\.ssh/authorized_keys"; then
    echo "🚨 BLOCKED: Write to SSH keys" >&2
    exit 2
  fi
  
  # Warn on .env writes (already handled by pre-write-block-secrets.sh)
  if echo "$WRITE_PATH" | grep -qE "\.env$|\.env\."; then
    echo "⚠️  WARNING: Writing to .env file - ensure no secrets exposed" >&2
    # Allow but warn (pre-write-block-secrets will do deeper check)
  fi
fi

# All checks passed
exit 0
