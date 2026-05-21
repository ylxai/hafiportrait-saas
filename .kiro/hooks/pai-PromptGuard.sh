#!/bin/bash
# PAI PromptGuard - UserPromptSubmit hook for prompt injection detection
# Scans user prompts for injection/exfiltration patterns BEFORE LLM processes
# Exit 0 = allow, Exit 2 = block (rare, only for severe threats)

INPUT=$(cat)

PROMPT=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('prompt',''))" 2>/dev/null)
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id','unknown'))" 2>/dev/null)

# Skip very short prompts
if [ ${#PROMPT} -lt 10 ]; then
  exit 0
fi

# Check for severe injection attempts (block-worthy)
SHOULD_BLOCK=0
BLOCK_REASON=""

# Check for system prompt override attempts
if echo "$PROMPT" | grep -qiE "ignore your (instructions|system prompt|rules)"; then
  SHOULD_BLOCK=1
  BLOCK_REASON="System prompt override attempt detected"
fi

# Check for credential exfiltration attempts
if echo "$PROMPT" | grep -qiE "(show|print|display|reveal).*(password|secret|key|token|credential)"; then
  SHOULD_BLOCK=1
  BLOCK_REASON="Potential credential exfiltration attempt"
fi

# Check for jailbreak attempts
if echo "$PROMPT" | grep -qiE "DAN mode|developer mode.*enabled|jailbreak"; then
  SHOULD_BLOCK=1
  BLOCK_REASON="Jailbreak attempt detected"
fi

if [ $SHOULD_BLOCK -eq 1 ]; then
  # Log security event
  MEMORY_DIR="$HOME/.kiro/pai/MEMORY/OBSERVABILITY"
  mkdir -p "$MEMORY_DIR"
  TIMESTAMP=$(date -Iseconds)
  echo "{\"timestamp\":\"$TIMESTAMP\",\"event\":\"prompt_blocked\",\"session_id\":\"$SESSION_ID\",\"reason\":\"$BLOCK_REASON\"}" >> "$MEMORY_DIR/security-alerts.jsonl"
  
  # Block the prompt
  echo "[PromptGuard] 🚨 BLOCKED: $BLOCK_REASON" >&2
  echo "{\"decision\":\"block\",\"reason\":\"[PAI SECURITY] $BLOCK_REASON\"}" 
  exit 2
fi

# Check for warnings (allow but alert)
if echo "$PROMPT" | grep -qiE "forget (everything|previous|all)"; then
  echo "[PromptGuard] ⚠️ WARNING: Memory wipe attempt detected" >&2
fi

if echo "$PROMPT" | grep -qiE "you are now|from now on you"; then
  echo "[PromptGuard] ⚠️ WARNING: Role override attempt detected" >&2
fi

# All checks passed
exit 0
