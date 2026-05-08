#!/bin/bash
# Stop hook: Jalankan lint jika ada file TS/TSX yang dimodifikasi dalam sesi ini
# Input: JSON via STDIN (hook_event_name, cwd, session_id)

INPUT=$(cat)
CWD=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('cwd',''))" 2>/dev/null)

# Hanya jalan di project hafiportrait-saas
if [[ "$CWD" != "/home/ubuntu/hafiportrait-saas"* ]]; then
  exit 0
fi

# Cek file TS/TSX yang dimodifikasi dalam 120 detik terakhir
RECENT=$(find "$CWD/src" -name "*.ts" -o -name "*.tsx" 2>/dev/null | xargs ls -t 2>/dev/null | head -1)
if [ -z "$RECENT" ]; then
  exit 0
fi

AGE=$(( $(date +%s) - $(stat -c %Y "$RECENT" 2>/dev/null || echo 0) ))
if [ "$AGE" -gt 120 ]; then
  exit 0
fi

echo "Running lint check..."
cd /home/ubuntu/hafiportrait-saas && npm run lint --silent 2>&1 | tail -5
