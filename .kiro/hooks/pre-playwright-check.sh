#!/bin/bash
# PreToolUse @playwright: Cek apakah dev server running sebelum Playwright dijalankan

if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null | grep -q "200\|301\|302\|304"; then
  exit 0
fi

echo "WARNING: Dev server tidak running di localhost:3000. Jalankan 'npm run dev' terlebih dahulu." >&2
echo "Playwright mungkin gagal jika target URL adalah localhost:3000." >&2
exit 0  # warning only, tidak block
