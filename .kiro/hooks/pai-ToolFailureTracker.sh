#!/bin/bash
# PAI ToolFailureTracker - PostToolUse hook for failure logging
# Captures tool failures as structured events for debugging
# Exit 0 always (observability only, never blocks)

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name','unknown'))" 2>/dev/null)
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id','unknown'))" 2>/dev/null)
ERROR=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error','unknown error'))" 2>/dev/null)
TOOL_INPUT=$(echo "$INPUT" | python3 -c "import sys,json; inp=json.load(sys.stdin).get('tool_input',{}); s=str(inp)[:500]; print(s)" 2>/dev/null)

# Check if this is actually a failure (has error field)
if [[ "$ERROR" == "unknown error" ]]; then
  # Not a failure event, exit silently
  exit 0
fi

# Create observability directory
MEMORY_DIR="$HOME/.kiro/pai/MEMORY/OBSERVABILITY"
mkdir -p "$MEMORY_DIR"

# Log failure to JSONL
TIMESTAMP=$(date -Iseconds)
echo "{\"timestamp\":\"$TIMESTAMP\",\"event\":\"tool_failure\",\"session_id\":\"$SESSION_ID\",\"tool_name\":\"$TOOL_NAME\",\"error\":\"${ERROR:0:1000}\",\"tool_input_preview\":\"$TOOL_INPUT\"}" >> "$MEMORY_DIR/tool-failures.jsonl"

# Log to stderr for diagnostics
echo "[ToolFailureTracker] Logged failure: $TOOL_NAME — ${ERROR:0:80}" >&2

exit 0
