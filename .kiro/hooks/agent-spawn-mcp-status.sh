#!/bin/bash
# AgentSpawn: Verify MCP servers availability
# Check apakah MCP servers yang diperlukan sudah loaded

INPUT=$(cat)
AGENT_NAME=$(echo "$INPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
# Could be in session or inferred
print(d.get('session_id', '')[:50] if d.get('session_id') else 'default')
" 2>/dev/null)

# Check MCP status (informational only)
echo "=== MCP Servers Status ==="

for server in context7 github playwright tavily tiger cloudflare-docs sequential-thinking memory; do
  STATUS=$(~/.kiro/settings/mcp.json 2>/dev/null | grep -A2 "\"$server\"" | grep -o '"disabled":\s*true' || echo "enabled")
  if [ "$STATUS" = "enabled" ]; then
    echo "  $server: enabled"
  else
    echo "  $server: disabled"
  fi
done 2>/dev/null || echo "(Config readable)"

echo "========================="

exit 0