#!/bin/bash
set -e

echo "======================================"
echo "      PHOTOSTUDIO CODE REVIEW         "
echo "======================================"

echo "1. Checking ESLint strict rules (no-explicit-any)..."
npm run lint

echo "2. Checking TypeScript type definitions..."
npx tsc --noEmit

echo "3. Building Next.js project..."
npm run build

echo "======================================"
echo "   ✅ Review script completed!        "
echo "   No strict type errors found.       "
echo "======================================"